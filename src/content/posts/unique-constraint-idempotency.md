---
title: "DuplicateKeyException은 버그가 아니다 — 유니크 제약으로 중복 처리를 막기"
slug: "unique-constraint-idempotency"
description: "동시 요청과 네트워크 재시도에서 중복 지급을 막기 위해 유니크 제약과 DuplicateKeyException을 의도적으로 사용하는 방법을 정리한다."
kind: "tech"
publishedAt: "2026-04-01"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "spring", "idempotency", "concurrency"]
relatedPosts: []
references:
  - title: "MySQL 8.0 Reference Manual — CREATE INDEX Statement"
    url: "https://dev.mysql.com/doc/refman/8.0/en/create-index.html"
  - title: "Spring Framework Javadoc — DuplicateKeyException"
    url: "https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/dao/DuplicateKeyException.html"
---

하루에 한 번만 받을 수 있는 보상을 구현하면서 가장 먼저 든 걱정은 중복 지급이었다. 사용자가 버튼을 빠르게 두 번 누를 수도 있고, 응답을 받지 못한 클라이언트가 같은 요청을 재시도할 수도 있다.

```text
요청 A ──┐
         ├── 서버 ── DB
요청 B ──┘
```

처음 구현에는 "오늘 이미 받았는가"를 SELECT로 확인하는 코드가 있었다. 단독 요청에서는 충분해 보이지만 동시 요청에는 빈틈이 있다.

## SELECT 사전 확인만으로는 부족하다

```java
if (rewardClaimRepository.existsToday(userId)) {
    throw new AlreadyClaimedException();
}

rewardClaimRepository.insert(userId, claimDate);
```

두 요청이 거의 같이 도착하면 둘 다 INSERT 전의 상태를 읽을 수 있다.

```text
요청 A                              요청 B
──────                              ──────
SELECT → 없음
                                    SELECT → 없음
INSERT
                                    INSERT
```

이건 단순한 check-then-act 경합이다. SELECT를 먼저 실행했다는 사실은 다음 INSERT의 유일성을 보장하지 않는다.

## 유일성을 DB가 보장하게 했다

보상 이력의 공개용 스키마를 단순화하면 유일성 단위는 "사용자 한 명이 하루에 한 번"이다.

```sql
CREATE TABLE reward_claims (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    claim_date DATE NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_reward_claim (user_id, claim_date)
);
```

동시에 두 INSERT가 와도 유니크 인덱스는 하나만 성공시킨다. Spring JDBC처럼 SQL 예외 번역이 적용된 계층에서는 나머지 요청이 `DuplicateKeyException`으로 번역된다.

```java
try {
    rewardClaimRepository.insert(userId, claimDate);
} catch (DuplicateKeyException exception) {
    throw new AlreadyClaimedException();
}
```

여기서 예외는 예상하지 못한 버그가 아니다. 경쟁에서 뒤늦게 도착한 요청을 DB가 차단했다는 정상적인 신호다.

다만 `DuplicateKeyException`이라는 타입만 보고 모든 중복을 같은 성공으로 처리하면 안 된다. 테이블에 유니크 제약이 여러 개라면 예상한 비즈니스 키가 아니라 다른 키의 충돌일 수도 있다. INSERT가 충돌시킬 수 있는 제약을 좁히거나, 데이터 접근 계층에서 제약 이름과 원인 예외를 확인해 `uk_reward_claim` 충돌만 도메인 중복으로 번역한다.

아래처럼 예외를 잡고 이어 가는 코드는 INSERT가 그 자리에서 실행되는 Spring JDBC 계열을 전제로 한다. JPA처럼 SQL 실행이 flush까지 미뤄질 수 있거나 예외 뒤 현재 트랜잭션이 rollback-only가 되는 조합에는 그대로 적용할 수 없다. 사용하는 데이터 접근 기술과 트랜잭션 매니저에서 실패 시점을 먼저 검증해야 한다.

## 사전 확인과 유니크 키는 같은 단위를 봐야 한다

처음 검토할 때 놓치기 쉬웠던 부분은 두 방어선의 기준이었다.

```sql
-- 애플리케이션의 사전 확인
SELECT 1
FROM reward_claims
WHERE user_id = :userId
  AND claim_date = CURRENT_DATE;

-- DB의 최종 방어
UNIQUE KEY uk_reward_claim (user_id, claim_date)
```

둘 다 "사용자 + 날짜"를 본다. 만약 사전 확인은 이벤트까지 구분하는데 유니크 키에는 이벤트가 없다면, 애플리케이션이 허용한 두 번째 이벤트를 DB가 막는다. 반대로 유니크 키는 이벤트별로 허용하는데 사전 확인이 날짜만 보면 정당한 요청을 코드가 먼저 거절한다.

유니크 키를 추가하는 것만큼 **무엇을 하나로 볼 것인지**를 맞추는 일이 중요했다.

## 중복을 에러로 볼지 성공으로 볼지

같은 `DuplicateKeyException`도 API 의미에 따라 처리 방식이 달랐다.

### 이미 처리됐다고 알려야 하는 경우

사용자가 직접 보상 받기 버튼을 눌렀다면 "이미 받았다"는 응답이 의미 있다.

```java
public ClaimResult claimDailyReward(long userId, LocalDate date) {
    try {
        rewardClaimRepository.insert(userId, date);
    } catch (DuplicateKeyException exception) {
        throw new AlreadyClaimedException();
    }

    pointService.grant(userId, DAILY_REWARD);
    return ClaimResult.created();
}
```

이 경우 중복은 도메인 오류로 번역한다. HTTP 상태와 오류 코드는 API 정책에 맞게 정하면 된다.

### 재시도를 조용히 흡수해야 하는 경우

외부 결제 영수증이나 비동기 이벤트처럼 같은 식별자가 다시 올 수 있는 입력은 이미 처리된 요청을 성공으로 간주하는 편이 자연스럽다.

```java
boolean inserted;
try {
    receiptRepository.insert(receiptId, userId);
    inserted = true;
} catch (DuplicateKeyException exception) {
    inserted = false;
}

if (inserted) {
    pointService.grant(userId, purchasedPoint);
}
```

INSERT에 성공한 요청만 후속 지급을 한다. 중복이면 아무것도 더 하지 않고 기존 처리 결과를 반환한다. 클라이언트 관점에서는 같은 요청을 여러 번 보내도 최종 상태가 같아진다.

가능하다면 예외를 흐름 제어로 쓰지 않고 DB가 제공하는 upsert 또는 insert-ignore 계열 문법을 검토할 수도 있다. 다만 어떤 중복까지 무시할지 명확해야 한다. 모든 무결성 오류를 통째로 삼키는 코드는 원인을 감춘다.

## 트랜잭션 경계도 같이 봐야 한다

이력 INSERT가 성공한 뒤 포인트 지급이 실패하면 둘을 같은 트랜잭션으로 묶었는지가 중요하다.

```java
@Transactional
public void claim(long userId, LocalDate date) {
    rewardClaimRepository.insert(userId, date);
    pointService.grant(userId, DAILY_REWARD);
}
```

둘이 같은 DB의 로컬 트랜잭션이라면 함께 커밋되거나 함께 롤백되게 만드는 것이 단순하다. 이력만 먼저 커밋하면 지급 실패 뒤 재시도도 유니크 키에 막혀 복구 경로가 필요해진다.

반대로 외부 시스템까지 걸친 처리라면 로컬 트랜잭션만으로는 부족하다. outbox, 상태 머신, 재처리 정책처럼 더 넓은 멱등성 설계가 필요하다. 유니크 키는 강한 최종 방어선이지만 전체 워크플로의 원자성을 대신해주지는 않는다.

## nullable 컬럼이 있으면 구멍이 생긴다

MySQL의 유니크 인덱스는 NULL을 포함한 여러 행을 허용한다. 아래처럼 유니크 키의 일부가 nullable이면 기대한 중복 방어가 작동하지 않을 수 있다.

```sql
CREATE TABLE coupon_claims (
    user_id BIGINT NOT NULL,
    campaign_id BIGINT NULL,
    UNIQUE KEY uk_coupon_claim (user_id, campaign_id)
);
```

동일한 `user_id`에 `campaign_id = NULL`인 행이 여러 개 들어갈 수 있다. "유니크 키가 있으니 절대 중복되지 않는다"는 말에는 **구성 컬럼이 의도한 방식으로 NOT NULL인가**라는 전제가 붙는다.

## 로그는 장애가 아니라 관측을 위해 남긴다

중복 요청이 설계된 흐름이라고 해서 아무 기록도 필요 없는 것은 아니다. 갑자기 중복 비율이 크게 늘면 클라이언트 재시도 정책이나 네트워크 문제를 의심할 수 있다.

다만 매 중복을 error 로그로 남기면 정상 경쟁 상황이 장애처럼 보인다. 예상한 비즈니스 키의 중복은 낮은 레벨의 구조화 로그나 메트릭으로 집계하고, 유니크 제약 자체가 없거나 다른 키가 충돌한 경우를 진짜 오류로 구분하는 편이 낫다.

## 정리

내가 가져간 기준은 다음과 같다.

- SELECT 사전 확인은 빠른 실패와 친절한 응답을 위한 1차 방어다.
- 동시 요청에서 유일성을 실제로 보장하는 곳은 DB 유니크 제약이다.
- 사전 확인 조건과 유니크 키는 같은 비즈니스 단위를 표현해야 한다.
- 중복을 오류로 돌려줄지 성공으로 흡수할지는 API 의미로 결정한다.
- 예외를 흡수하기 전에 실제로 충돌한 유니크 제약이 예상한 비즈니스 키인지 확인한다.
- 유니크 키 컬럼의 NULL 가능성과 후속 작업의 트랜잭션 경계를 함께 검토한다.

`DuplicateKeyException`을 없애야 할 예외로만 보면 catch 한 줄을 지우고 싶어진다. 하지만 한 번만 처리되어야 하는 입력에서는 그 예외가 마지막 방어선이 제대로 작동했다는 증거일 때가 있다.
