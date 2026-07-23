---
title: "MySQL 날짜 조건 최적화에서 MAX(extra_days)의 전제 검증하기"
slug: "adversarial-query-review"
description: "비정상적인 extra_days 하나가 날짜 계산을 NULL로 만들거나 조회 범위를 넓힐 수 있어, 입력 검증과 인덱스 회귀 확인을 함께 둔 이유를 설명한다."
kind: "tech"
publishedAt: "2026-07-15"
updatedAt: "2026-07-23"
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

1편의 최적화는 실행 계획도 좋아졌고 수정 전후의 응답도 같았다. 그래도 배포 전에는 이 조건이 어떤 입력에서 깨질 수 있는지 다시 검토했다.

대상은 이 한 줄이다.

```sql
AND created_at >= DATE_ADD(
    NOW(),
    INTERVAL -(10 + (SELECT MAX(extra_days) FROM content_item)) DAY
)
```

검토할 것은 세 가지였다.

- 정확성: “기존 결과를 절대 제거하지 않는다”는 증명을 깨는 입력은 없는가.
- 성능·운영: 지금 빠른 실행 계획이 어떤 인덱스와 데이터 분포에 기대는가.
- 설계: 후보를 넓게 읽는 우회 조건 자체를 없앨 수 있는가.

하드코딩을 피한 판단은 맞았지만, 같은 결과가 나온다는 설명에는 입력값의 범위 조건이 빠져 있었다. **쿼리에서 값을 잘라내기보다 설정을 저장할 때 허용 범위를 검사해야 했다.**

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

## 성능 개선은 두 가지 조건에 의존했다

### `extra_days` 인덱스

`MAX(extra_days)`가 거의 공짜였던 건 `idx_content_item_extra_days`가 있기 때문이다. 값 종류가 적은 컬럼이라는 이유로 이 인덱스를 제거하면 최댓값을 구하기 위해 테이블 전체를 읽을 수 있다.

더 까다로운 점은 바깥 쿼리만 보면 여전히 `idx_content_item_created_at` range scan처럼 보일 수 있다는 것이다. 서브쿼리 계획까지 보지 않으면 최적화가 사실상 원래 비용으로 돌아간 것을 놓친다.

그래서 이 인덱스에는 단순히 “연장일 조회용”이 아니라 날짜 하한 계산이 의존한다는 사실을 남겼다. 회귀 성능 테스트도 바깥 테이블의 access type만 보지 않고 서브쿼리 실행 계획과 전체 시간을 확인하게 했다.

### 삭제된 큰 값 때문에 조회 범위가 계속 넓게 남는다

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

## 하드코딩과 `LEAST`도 각각 문제가 있었다

동적 `MAX`가 위험하니 고정 상한으로 돌아가자는 의견도 검토했다.

```sql
AND created_at >= DATE_ADD(NOW(), INTERVAL -17 DAY)
```

도메인 상한이 영원히 7이라고 보장된다면 가장 단순하다. 하지만 운영 설정이 7보다 커지는 순간 아직 노출돼야 할 오래된 행이 빠진다. 동적 `MAX`는 비정상 값이 들어오면 느려지거나 결과가 비게 될 수 있고, 너무 작은 하드코딩은 정상 행을 누락시킨다.

`LEAST(MAX(extra_days), 30)`처럼 SQL에서 값을 자르는 방법도 같은 문제가 있다. 실제 행에 30보다 큰 값이 저장돼 있다면 경계만 잘라 그 행을 누락시킨다.

```text
조회할 때 30으로 제한 → 이미 저장된 값과 조건이 어긋날 수 있음
저장할 때 30을 초과하지 못하게 함 → 모든 저장값이 허용 범위 안에 있음
```

둘 중 덜 나쁜 문제를 고르기보다, 저장되는 값이 허용 범위를 벗어나지 않게 했다.

## 값은 저장하기 전에 검증했다

`extra_days`를 변경하는 경로를 모두 추적해 보니 원천은 하나의 관리 설정이었다. 값을 조회할 때 잘라내지 않고, 설정을 저장하기 전에 형식과 범위를 검증했다. 아래 숫자는 공개 예시다.

```java
private static final int MAX_EXTRA_DAYS = 30;

int requested = parseExtraDays(input);
if (requested < 0 || requested > MAX_EXTRA_DAYS) {
    throw new IllegalArgumentException("extraDays is out of range");
}
settings.saveExtraDays(requested);
```

이제 저장되는 값은 항상 다음 범위 안에 있다.

```text
0 <= content_item.extra_days <= MAX_EXTRA_DAYS
```

- 날짜 연산이 비정상 범위로 빠지지 않는다.
- range scan의 최대 폭을 예측할 수 있다.
- `MAX(extra_days)`로 만든 조건이 기존 행을 빠뜨리지 않는다.

DB `CHECK` 제약도 추가로 검토할 수 있다. 다만 제약 위반이 더 큰 비즈니스 트랜잭션 안에서 처음 드러나면 관련 작업 전체가 실패할 수 있다. 그 전에 설정 입력 단계에서 명확한 검증 오류를 돌려주는 편을 택했다.

## 주석에는 지우면 깨지는 조건을 남겼다

쿼리 옆에 긴 사건 기록을 붙이지는 않았다. 다음 작업자가 “중복 조건”처럼 보여 지우거나 서브쿼리에 필터를 추가하지 않도록 최소한의 제약만 남겼다.

```sql
-- 기존 결과를 모두 포함하면서 인덱스 후보를 줄이는 날짜 조건이다.
-- idx_content_item_extra_days에 의존하며, 아래 실제 노출 조건과 기본 일수를 맞춘다.
AND created_at >= ...
```

상세 근거와 실행 계획은 이 글과 회귀 테스트가 맡는다. 주석은 왜 존재하는지보다 어떤 변경이 위험한지를 빠르게 알려주는 쪽이 유용했다.

## 장기적으로는 종료 시각을 컬럼으로 만들 수 있다

현재 쿼리는 `created_at + 기본일 + extra_days`로 종료 시각을 읽을 때마다 계산한다. 종료 시각을 생성 컬럼이나 일반 컬럼으로 만들고 인덱스를 걸면 후보를 줄이기 위한 날짜 조건이 필요 없다.

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

당장은 `MAX`로 만든 날짜 조건을 유지하고 설정 저장 시 상한을 검사하기로 했다. 이 조건이 인덱스에 의존한다는 문서와 회귀 테스트도 남겼다. 생성 컬럼은 스키마 변경 비용을 측정한 뒤 진행할 장기 개선안으로 두었다.

**결과가 같다는 확인만으로는 부족했다. 같은 결과와 성능이 유지되는 입력 범위와 인덱스까지 함께 기록해야 했다.**
