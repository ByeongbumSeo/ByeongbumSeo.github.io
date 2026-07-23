---
title: "내 쿼리 최적화를 적대적으로 다시 리뷰했다"
slug: "adversarial-query-review"
description: "안전하다고 증명한 상위집합 하한의 숨은 전제와 인덱스 의존을 반박하고, 가드를 읽기보다 쓰기 경계에 둔 의사결정을 정리한다."
kind: "tech"
publishedAt: "2026-07-15"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "code-review", "database", "performance"]
series:
  slug: "slow-query-verification"
  title: "슬로우 쿼리 개선과 검증"
  order: 3
relatedPosts: []
references:
  - title: "MySQL 8.0 Reference Manual — Range Optimization"
    url: "https://dev.mysql.com/doc/refman/8.0/en/range-optimization.html"
  - title: "MySQL 8.0 Reference Manual — Date and Time Functions"
    url: "https://dev.mysql.com/doc/refman/8.0/en/date-and-time-functions.html"
  - title: "MySQL 8.0 Reference Manual — Optimizer Use of Generated Column Indexes"
    url: "https://dev.mysql.com/doc/refman/8.0/en/generated-column-index-optimizations.html"
  - title: "MySQL 8.0 Reference Manual — CREATE TABLE and Generated Columns"
    url: "https://dev.mysql.com/doc/refman/8.0/en/create-table-generated-columns.html"
---

1편의 최적화는 실행 계획도 좋아졌고 응답 동일성 테스트도 통과했다. 그래서 배포 전 마지막으로 반대편에 서서 다시 검토했다.

대상은 이 한 줄이다.

```sql
AND created_at >= DATE_ADD(
    NOW(),
    INTERVAL -(10 + (SELECT MAX(extra_days) FROM content_item)) DAY
)
```

검토는 세 관점으로 나눴다.

- 정확성: “기존 결과를 절대 제거하지 않는다”는 증명을 깨는 입력은 없는가.
- 성능·운영: 지금 빠른 실행 계획이 어떤 인덱스와 데이터 분포에 기대는가.
- 설계: 상위집합 하한이라는 우회 자체를 없앨 수 있는가.

결론부터 말하면 하드코딩을 피한 판단은 타당했지만, 최초의 동일성 증명은 전제가 빠져 있었다. 그리고 그 전제를 SQL 읽기 경로가 아니라 값이 들어오는 쓰기 경계에서 강제해야 했다.

## “MAX는 항상 현재 행 이상”만으로는 부족했다

최초 증명은 이랬다.

```text
MAX(extra_days) >= 현재 행의 extra_days
→ MAX로 만든 하한은 현재 행 하한보다 과거
→ 새 조건은 기존 조건의 상위집합
→ 결과 누락 없음
```

부등식은 맞다. 빠진 전제는 `DATE_ADD`가 어떤 입력에서도 유효한 날짜를 반환한다는 가정이었다.

`extra_days`에 비정상적으로 큰 값이 한 건 들어오면 날짜 연산이 표현 가능한 범위를 벗어나 `NULL`이 될 수 있다.

```sql
DATE_ADD(NOW(), INTERVAL -(10 + very_large_value) DAY) -- NULL 가능
```

SQL에서 `created_at >= NULL`은 참이 아니다. 하한은 행별 값이 아니라 전체 쿼리가 공유하는 하나의 값이므로, 오염된 행 하나가 목록 전체를 비울 수 있다. 오류를 던지는 대신 빈 결과를 반환한다는 점도 위험했다.

즉 증명은 실제로 다음 전제까지 필요했다.

```text
0 <= extra_days <= 도메인이 허용한 유한한 상한
```

현재 데이터가 정상이라는 관측과 앞으로도 정상 값만 들어온다는 보장은 다르다.

## 성능은 두 개의 숨은 의존을 새로 만들었다

### `extra_days` 인덱스

`MAX(extra_days)`가 거의 공짜였던 건 `idx_content_item_extra_days`가 있기 때문이다. 이 인덱스를 저선택도 컬럼이라는 이유로 제거하면 최댓값을 구하기 위해 테이블 전체를 읽을 수 있다.

더 까다로운 점은 바깥 쿼리만 보면 여전히 `idx_content_item_created_at` range scan처럼 보일 수 있다는 것이다. 서브쿼리 계획까지 보지 않으면 최적화가 사실상 원래 비용으로 돌아간 것을 놓친다.

그래서 이 인덱스에는 단순히 “연장일 조회용”이 아니라 날짜 하한 계산이 의존한다는 사실을 남겼다. 회귀 성능 테스트도 바깥 테이블의 access type만 보지 않고 서브쿼리 실행 계획과 전체 시간을 확인하게 했다.

### 과거·삭제 데이터가 만드는 래칫

최댓값 서브쿼리는 삭제 여부로 필터링하지 않는다.

```sql
SELECT MAX(extra_days) FROM content_item
```

과거에 큰 연장값을 가진 삭제 행이 하나라도 있으면 현재 항목들의 값이 작아져도 하한은 다시 좁아지지 않는다. 결과 정확성은 유지되지만 읽는 범위가 넓은 채로 남는다.

그렇다고 다음처럼 고치면 안 됐다.

```sql
SELECT MAX(extra_days)
FROM content_item
WHERE deleted = 0;
```

현재 인덱스는 `(extra_days)`뿐이다. 조건을 추가하면 MIN/MAX 최적화가 깨져 최댓값 서브쿼리 자체가 전체 스캔으로 바뀔 수 있다. 겉보기에 더 정확한 필터가 성능 개선 전체를 무효화하는 유지보수 함정이다.

## 하드코딩과 SQL의 `LEAST`도 대칭적인 실패가 있었다

동적 `MAX`가 위험하니 고정 상한으로 돌아가자는 의견도 검토했다.

```sql
AND created_at >= DATE_ADD(NOW(), INTERVAL -17 DAY)
```

도메인 상한이 영원히 7이라고 보장된다면 가장 단순하다. 하지만 운영 설정이 7보다 커지는 순간 합법적으로 살아 있는 오래된 행이 조용히 누락된다. 동적 `MAX`는 오염 시 성능이나 가용성 쪽으로 실패하고, 너무 작은 하드코딩은 정확성 쪽으로 실패한다.

`LEAST(MAX(extra_days), 30)`처럼 SQL에서 값을 자르는 방법도 같은 문제가 있다. 실제 행에 30보다 큰 값이 저장돼 있다면 경계만 잘라 그 행을 누락시킨다.

```text
읽기 경계에서 cap → 데이터와 경계가 어긋날 수 있음
쓰기 경계에서 cap → 저장 데이터 자체가 불변식을 만족
```

실패 모드 중 하나를 선택하는 대신, 값이 유계라는 전제를 실제로 성립시키는 쪽을 택했다.

## 가드는 값이 들어오는 경계에 뒀다

`extra_days`를 변경하는 경로를 모두 추적해 보니 원천은 하나의 관리 설정이었다. 그래서 값을 소비하는 애플리케이션에서 조용히 잘라내는 방식은 택하지 않고, 설정을 저장하는 입력 경계에서 형식과 범위를 검증하기로 했다. 아래 숫자는 공개 예시다.

```java
private static final int MAX_EXTRA_DAYS = 30;

int requested = parseExtraDays(input);
if (requested < 0 || requested > MAX_EXTRA_DAYS) {
    throw new IllegalArgumentException("extraDays is out of range");
}
settings.saveExtraDays(requested);
```

이렇게 하면 다음이 불변식이 된다.

```text
0 <= content_item.extra_days <= MAX_EXTRA_DAYS
```

- 날짜 연산이 비정상 범위로 빠지지 않는다.
- range scan의 최대 폭을 예측할 수 있다.
- `MAX(extra_days)`가 기존 행을 빠뜨리지 않는다는 증명이 완결된다.

DB `CHECK` 제약은 마지막 방어선으로 검토할 수 있다. 다만 제약 위반이 더 큰 비즈니스 트랜잭션 안에서 처음 드러나면 관련 작업 전체가 실패할 수 있다. 그 전에 설정 입력 단계에서 명확한 검증 오류를 돌려주는 편을 택했다.

## 주석에는 결론보다 깨지는 조건을 남겼다

쿼리 옆에 긴 사건 기록을 붙이지는 않았다. 다음 작업자가 “중복 조건”처럼 보여 지우거나 서브쿼리에 필터를 추가하지 않도록 최소한의 제약만 남겼다.

```sql
-- 인덱스 후보를 줄이기 위한 상위집합 하한이다.
-- idx_content_item_extra_days에 의존하며, 아래 실제 노출 조건과 기본 일수를 맞춘다.
AND created_at >= ...
```

상세 근거와 실행 계획은 이 글과 회귀 테스트가 맡는다. 주석은 왜 존재하는지보다 어떤 변경이 위험한지를 빠르게 알려주는 쪽이 유용했다.

## 근본 해결은 종료 시각을 물화하는 것이다

현재 쿼리는 `created_at + 기본일 + extra_days`라는 도메인 개념을 읽을 때마다 계산한다. 종료 시각을 생성 컬럼이나 명시적 컬럼으로 만들고 인덱스를 걸면 상위집합 하한이 필요 없다.

```sql
ALTER TABLE content_item
  ADD COLUMN expires_at DATETIME
    GENERATED ALWAYS AS (
      DATE_ADD(created_at, INTERVAL (10 + extra_days) DAY)
    ) VIRTUAL;

CREATE INDEX idx_content_item_expires_at
  ON content_item (expires_at);
```

조회는 정확한 조건 하나로 단순해진다.

```sql
WHERE deleted = 0
  AND expires_at >= NOW()
  AND created_at <= NOW()
```

생성 컬럼 식의 허용 범위, 인덱스 사용 여부, DDL의 잠금과 빌드 비용은 사용하는 MySQL 버전과 데이터 규모에서 따로 검증해야 한다. 이 선택은 읽기를 단순하게 만드는 대신 쓰기 비용과 인덱스 저장 공간을 추가한다.

당장은 `MAX` 하한을 유지하고 설정 입력 경계에 상한을 두기로 했으며, 인덱스 의존 문서와 회귀 테스트를 남겼다. 생성 컬럼은 스키마 변경 비용을 측정한 뒤 진행할 근본안으로 남겼다.

적대적 리뷰 중에는 이번 쿼리와 직접 관련 없는 고위험 문제도 하나 발견했다. 성능 변경에 슬쩍 섞어 처리하지 않고 별도의 즉시 수정 항목으로 분리했다. 리뷰 범위 밖이라는 말은 무시해도 된다는 뜻이 아니다. 반대로 긴급도와 검증 방법이 다르면 추적 가능한 별도 작업으로 바로 넘겨야 한다.

이번 리뷰에서 가장 크게 바뀐 건 코드가 아니라 증명의 태도였다. “현재 데이터에서 결과가 같았다”에서 멈추지 않고, 그 증명이 어떤 입력 범위와 인덱스에 기대는지 적어야 했다. 최적화가 만든 새 전제는 코드와 운영에서 실제 불변식으로 강제해야 한다.
