---
title: "응답이 늦자 클라이언트가 재전송했고, 포인트가 두 번 빠졌다"
slug: "client-retry-idempotency"
description: "응답 지연 뒤 재전송된 요청이 중복 차감을 만든 원인과 조건부 UPDATE로 멱등성을 되찾은 과정을 정리한다."
kind: "tech"
publishedAt: "2026-01-20"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "concurrency", "idempotency", "spring"]
relatedPosts: []
references:
  - title: "MySQL C API — mysql_affected_rows()"
    url: "https://dev.mysql.com/doc/c-api/8.4/en/mysql-affected-rows.html"
  - title: "MySQL Client/Server Protocol — Capability Flags"
    url: "https://dev.mysql.com/doc/dev/mysql-server/latest/group__group__cs__capabilities__flags.html"
  - title: "MariaDB Connector/J 3.4.2 — Configuration.java"
    url: "https://github.com/mariadb-corporation/mariadb-connector-j/blob/3.4.2/src/main/java/org/mariadb/jdbc/Configuration.java"
  - title: "MariaDB Connector/J 3.4.2 — ConnectionHelper.java"
    url: "https://github.com/mariadb-corporation/mariadb-connector-j/blob/3.4.2/src/main/java/org/mariadb/jdbc/client/impl/ConnectionHelper.java"
---

운영 중인 기능 하나는 포인트를 사용해 잠겨 있던 정보를 한 번만 열 수 있게 되어 있었다. 정상 요청이라면 상태를 `CLOSED`에서 `OPEN`으로 바꾸고 포인트를 한 번 차감하면 끝난다.

문제는 요청 처리가 평소보다 길어졌을 때 나타났다. 첫 요청의 응답을 받지 못한 클라이언트가 같은 요청을 다시 보냈고, 서버는 두 요청을 모두 성공으로 판단했다. 결과적으로 정보는 한 번 열렸지만 포인트는 두 번 빠졌다.

## 어떤 순서로 중복 차감이 일어났나

관련 로직을 공개용 예시로 줄이면 두 개의 UPDATE가 한 트랜잭션에 있었다.

```sql
UPDATE unlock_records
SET state = 'OPEN'
WHERE record_id = :recordId;

UPDATE accounts
SET point = point - :cost
WHERE account_id = :accountId;
```

첫 번째 UPDATE는 "이미 열었는가"를 기록하고, 두 번째 UPDATE는 비용을 차감한다. 당시 첫 번째 문장에는 현재 상태를 확인하는 조건이 없었다.

실제 식별자와 시각을 걷어내고 순서만 남기면 이렇다.

```text
요청 A                              요청 B
──────                              ──────
unlock_records UPDATE 성공
해당 행에 X-lock 획득
accounts UPDATE가 다른 잠금 때문에 대기
                                    응답 지연 뒤 같은 요청 재전송
                                    unlock_records UPDATE 시도
                                    요청 A의 X-lock을 기다림
accounts UPDATE 완료
COMMIT, X-lock 해제
                                    unlock_records UPDATE 실행
                                    OPEN -> OPEN인데도 성공으로 판단
                                    accounts UPDATE로 포인트 재차감
```

두 번째 요청이 동시에 달린 것이 문제의 전부는 아니었다. 더 직접적인 원인은 `OPEN`인 행을 다시 `OPEN`으로 바꾸는 UPDATE도 성공으로 취급한 데 있었다.

## 값이 안 바뀌었는데 affected rows가 1이었다

MySQL 서버의 기본 affected-rows 의미는 실제로 값이 바뀐 행의 수다. 하지만 클라이언트가 `CLIENT_FOUND_ROWS` capability를 사용하면 "바뀐 행"이 아니라 WHERE에 "찾힌 행"의 수를 돌려준다.

따라서 아래 문장은 연결 설정에 따라 결과가 달라질 수 있다.

```sql
UPDATE unlock_records
SET state = 'OPEN'
WHERE record_id = 101;
```

`record_id = 101`의 상태가 이미 `OPEN`이어도 found-rows 방식에서는 `1`이 반환된다. 애플리케이션이 `affectedRows > 0`만 보고 후속 차감을 진행한다면 중복 요청을 구별하지 못한다.

이 차이는 드라이버와 연결 옵션에 의존한다. 그래서 "같은 값으로 UPDATE하면 항상 0"이라는 가정도, "항상 1"이라는 가정도 안전하지 않다. 비즈니스 조건을 반환값의 우연한 의미에 맡기지 않는 편이 낫다.

## 체크를 UPDATE 안으로 옮겼다

수정은 작았다. 상태 변경이 허용되는 조건을 같은 UPDATE의 WHERE 절에 넣었다.

```sql
UPDATE unlock_records
SET state = 'OPEN'
WHERE record_id = :recordId
  AND state = 'CLOSED';
```

서비스는 이제 이 문장의 결과만으로 상태 전이를 판단한다.

```java
int updated = unlockRecordRepository.openIfClosed(recordId);
if (updated == 0) {
    throw new AlreadyOpenedException();
}

pointService.deduct(accountId, cost);
```

동시에 두 요청이 와도 결과는 달라진다.

```text
1. 요청 A: CLOSED 조건에 맞아 UPDATE 성공, 행 잠금 획득
2. 요청 B: 같은 행 UPDATE를 시도하고 잠금 대기
3. 요청 A: 포인트 차감 뒤 COMMIT
4. 요청 B: 잠금 해제 후 WHERE 조건을 다시 평가
5. 현재 상태가 OPEN이므로 affected rows = 0
6. 요청 B: 후속 포인트 차감 없이 종료
```

핵심은 `state = 'CLOSED'`라는 check와 `state = 'OPEN'`이라는 act가 한 SQL 문장 안에서 끝난다는 점이다. 둘 사이에 다른 요청이 끼어들 틈이 없다. 연결이 changed-rows 방식인지 found-rows 방식인지도 더는 중요하지 않다. 두 번째 요청은 행 자체를 찾지 못하기 때문이다.

## 운영 상황은 잠금을 일부러 만들어 재현했다

단순히 두 스레드를 동시에 시작하는 테스트만으로는 원래 순서가 잘 만들어지지 않았다. 그래서 별도 트랜잭션이 `accounts`의 테스트 행을 먼저 잠그도록 했다.

```text
잠금 보유 트랜잭션         요청 A                  요청 B
────────────────         ──────                  ──────
accounts FOR UPDATE
                         unlock_records 성공
                         accounts에서 대기
                                                 unlock_records에서 대기
accounts 잠금 해제
                         포인트 차감, COMMIT
                                                 조건 재평가, updated = 0
```

테스트에서 확인한 것은 구체적인 소요 시간이 아니라 다음 불변식이었다.

- 상태 변경 성공은 정확히 한 번이어야 한다.
- 포인트 차감도 정확히 한 번이어야 한다.
- 뒤늦게 실행된 요청은 `updated = 0`을 받아야 한다.
- 두 작업은 같은 트랜잭션에서 함께 커밋되거나 함께 롤백되어야 한다.

이 테스트를 추가하고 나니 "동시 실행"이라는 막연한 조건이 아니라, 문제가 났던 잠금 순서를 계속 검증할 수 있게 됐다.

## 왜 별도 트랜잭션으로 일찍 커밋하지 않았나

상태 변경만 `REQUIRES_NEW`로 먼저 커밋하면 잠금 점유 시간은 줄일 수 있다. 하지만 포인트 차감이 실패했을 때 상태를 되돌리는 보상 트랜잭션이 필요해진다.

```text
상태 OPEN 커밋
    ↓
포인트 차감 실패
    ↓
상태 CLOSED 복구 시도
    ↓
복구도 실패하면 상태와 포인트가 불일치
```

단일 DB 안에서 끝나는 작은 상태 전이에 보상 로직까지 얹으면 실패 경로가 오히려 늘어난다. 이 사례에서는 조건부 UPDATE와 하나의 로컬 트랜잭션이 더 단순하고 강한 방어였다.

## 재시도는 예외가 아니라 입력이다

처음에는 응답이 늦어진 것이 사건의 원인처럼 보였다. 하지만 지연은 중복 요청을 드러낸 계기일 뿐이다. 모바일 네트워크, 프록시, 사용자의 연속 입력, 클라이언트 재시도 중 어느 하나만 있어도 같은 요청은 다시 올 수 있다.

서버가 "클라이언트가 한 번만 보낼 것"을 전제로 하면 지연이 생긴 날에만 멱등성 문제가 보인다. 반대로 중복 요청을 정상 입력으로 보면 설계 질문이 단순해진다. **이 상태 전이를 DB가 한 번만 허용하게 만들었는가?** 이 사례의 답은 WHERE 절 한 줄에 있었다.
