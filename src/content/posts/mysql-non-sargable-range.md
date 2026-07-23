---
title: "MySQL 행별 날짜 조건을 고정 범위로 바꿔 range scan 만들기"
slug: "mysql-non-sargable-range"
description: "행마다 달라지는 날짜 하한 때문에 created_at 인덱스를 쓰지 못한 쿼리에, 기존 결과를 보존하는 고정 후보 범위를 추가한 근거를 보여준다."
kind: "tech"
category: "database"
publishedAt: "2026-07-16"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "database", "sql", "performance"]
series:
  slug: "slow-query-verification"
  title: "슬로우 쿼리 개선과 검증"
  order: 1
relatedPosts: []
references:
  - title: "MySQL 8.0 Reference Manual — Range Optimization"
    url: "https://dev.mysql.com/doc/refman/8.0/en/range-optimization.html"
  - title: "MySQL 8.0 Reference Manual — EXPLAIN Output Format"
    url: "https://dev.mysql.com/doc/refman/8.0/en/explain-output.html"
  - title: "MySQL 8.0 Reference Manual — Date and Time Functions"
    url: "https://dev.mysql.com/doc/refman/8.0/en/date-and-time-functions.html"
---

목록 조회 API가 어느 순간부터 1초 안팎을 넘기기 시작했다. 날짜 조건에 쓰는 컬럼에는 분명 인덱스가 있었다. `EXPLAIN ANALYZE`를 열어보니 테이블의 대부분을 읽고 있었다.

문제를 공개 가능한 형태로 줄이기 위해 이 시리즈에서는 같은 합성 스키마를 사용한다.

```sql
CREATE TABLE content_item (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    title             VARCHAR(200) NOT NULL,
    created_at        DATETIME     NOT NULL,
    extra_days        INT          NOT NULL DEFAULT 0,
    deleted           TINYINT(1)   NOT NULL DEFAULT 0,
    available         TINYINT(1)   NOT NULL DEFAULT 1,
    category          VARCHAR(30)  NOT NULL,
    region_code       VARCHAR(20)  NOT NULL,
    ranking_score     INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    INDEX idx_content_item_created_at (created_at),
    INDEX idx_content_item_extra_days (extra_days)
);
```

실제 이름과 규모는 바꿨지만 쿼리의 구조, 실패 원인, 검증 순서는 그대로다.

## 인덱스가 있어도 날짜 조건이 행마다 바뀌면 못 탄다

공개용 예시의 규칙은 “등록 후 기본 10일에 `extra_days`를 더한 기간 동안 노출”이다. 실제 숫자는 바꿨지만 행마다 하한이 달라지는 구조는 같다.

```sql
SELECT id, title, created_at
FROM content_item
WHERE deleted = 0
  AND created_at BETWEEN
      DATE_ADD(NOW(), INTERVAL -(10 + extra_days) DAY)
      AND NOW()
ORDER BY created_at DESC, id DESC
LIMIT 30;
```

느린 이유는 인덱스 컬럼 `created_at` 자체가 아니라 비교 경계에 있었다.

```sql
DATE_ADD(NOW(), INTERVAL -(10 + extra_days) DAY)
```

`extra_days`는 지금 검사하는 행의 값이다. 첫 행은 10일 전, 다음 행은 13일 전처럼 하한이 계속 달라질 수 있다. B-Tree range scan이 시작점을 찾으려면 “이 시각 이후”라는 고정된 경계가 필요하다. 행을 읽기 전에는 경계를 알 수 없으니 MySQL은 모든 후보 행을 읽고 표현식을 계산했다.

```text
고정 경계: created_at >= '2026-07-01'              → range 탐색 가능
행별 경계: created_at >= NOW() - (10 + extra_days)일 → 먼저 행을 읽어야 함
```

이런 조건은 인덱스에서 검색을 시작할 범위를 정하기 어렵다.[^functional-index] 인덱스가 존재하는지와 그 인덱스로 검색 범위를 만들 수 있는지는 다른 문제다.

```sql
DATE(created_at) = CURDATE()        -- 인덱스 컬럼을 함수로 감쌈
title LIKE '%database%'             -- 선행 와일드카드
created_at >= other_column          -- 경계가 다른 행 값에 의존
```

쿼리는 처음부터 같은 형태였다. 데이터가 적을 때는 풀스캔 비용이 작아 드러나지 않았고, 누적량이 커지며 기존 문제가 임계점을 넘었을 뿐이었다.

## 기존 조건 앞에 후보를 줄이는 날짜 조건을 추가했다

원래 날짜 조건은 비즈니스 규칙이라 상수로 바꿀 수 없었다. 대신 기존 조건을 만족하는 행을 모두 포함하는 고정 날짜 조건을 하나 더 붙였다.

```sql
SELECT id, title, created_at
FROM content_item
WHERE deleted = 0
  AND created_at >= DATE_ADD(
      NOW(),
      INTERVAL -(10 + (SELECT MAX(extra_days) FROM content_item)) DAY
  )
  AND created_at BETWEEN
      DATE_ADD(NOW(), INTERVAL -(10 + extra_days) DAY)
      AND NOW()
ORDER BY created_at DESC, id DESC
LIMIT 30;
```

추가 조건은 모든 행의 `extra_days` 이상인 최댓값으로 가장 과거의 시작점을 만들고, 인덱스로 1차 후보만 줄인다. 실제 노출 여부는 기존 `BETWEEN`이 그대로 판단한다.

```text
과거 ←──────────────────────────────→ 현재
      │ MAX(extra_days)로 만든 하한
             │ 현재 행의 실제 하한
             [ 실제 노출 가능 구간 ]
```

`MAX(extra_days) >= 현재행.extra_days`라면 추가 조건의 시작점은 현재 행의 실제 시작점과 같거나 더 과거다. 따라서 정상 범위의 값에서는 기존 조건을 만족하는 행을 새 조건이 제거하지 않는다. **추가한 날짜 조건은 후보만 줄이고, 실제 노출 여부는 기존 `BETWEEN`이 판단한다.**

## 왜 상수 하드코딩을 하지 않았나

최대 연장일을 알고 있다면 `NOW() - INTERVAL 17 DAY`처럼 숫자를 박는 쪽이 가장 단순하다. 하지만 그 값은 운영 설정으로 바뀔 수 있었다. 코드의 상수보다 큰 값이 합법적으로 들어오면 아직 노출돼야 할 오래된 항목이 아무 오류 없이 빠진다.

```text
설정은 커졌는데 SQL 하한은 그대로
  → 실제 유효 구간이 SQL 하한보다 과거까지 늘어남
  → 그 사이 항목이 조용히 누락
```

데이터의 `MAX(extra_days)`를 쓰면 이미 저장된 값까지 포함해 시작점이 자동으로 따라간다. 정상 행을 누락시키기보다, 값이 커졌을 때 읽는 범위가 넓어지는 쪽을 택했다. 다만 이 선택에도 조건이 있으며 3편에서 다시 검토한다.

## 바깥 행과 관계없는 서브쿼리는 한 번만 계산됐다

처음에는 `MAX` 서브쿼리가 바깥 행마다 다시 실행될까 걱정했다. 추측하지 않고 실행 계획에서 확인했다.

```text
PRIMARY   type=range     key=idx_content_item_created_at
SUBQUERY                 Select tables optimized away
```

JSON 실행 계획에서는 서브쿼리가 바깥 행에 의존하지 않고 cacheable한 것으로 표시됐고, `EXPLAIN ANALYZE`에서도 한 번 실행된 뒤 구체적인 날짜 경계로 range scan에 쓰였다.

MySQL의 range 최적화 문서는 비상관 서브쿼리의 결과를 상수 값으로 취급할 수 있다고 설명한다. 여기서는 다음 두 조건이 함께 맞았다.

1. `SELECT MAX(extra_days)`가 바깥 행을 참조하지 않는다.
2. `idx_content_item_extra_days` 덕분에 최댓값 조회 자체도 인덱스 끝에서 해결된다.

`DEPENDENT SUBQUERY`나 `UNCACHEABLE SUBQUERY`였다면 이야기가 달라진다. **서브쿼리라는 이유로 느리다고 단정하지 말고, 바깥 행마다 다시 실행되는지 확인해야 한다.**

## 성능과 결과를 따로 검증했다

수치를 공개 가능한 범위로 바꾸면 결과는 다음과 같았다.

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| 접근 | 전체 스캔 | `created_at` range scan |
| 읽은 행 | 백만 건 단위 | 수천 건 단위 |
| DB 실행 시간 | 1초 안팎 | 100ms 미만 |

같은 스냅샷에서 기존 조건과 새 조건의 결과 ID 집합을 비교했고, 여러 필터와 페이징 조합에서도 수정 전후 API 응답을 대조했다. 이 비교 과정은 2편에서 따로 다룬다.

여기서 얻은 기준은 다음과 같다.

- 기존 조건이 왜 인덱스 검색 범위를 만들지 못하는지 먼저 찾는다.
- 기존 조건을 바꿀 수 없다면 더 넓은 고정 조건으로 후보를 줄일 수 있다.
- 추가 조건이 정상 행을 누락시키지 않는지 논리와 테스트 데이터로 확인한다.
- 서브쿼리가 상수화되는지, 그 최댓값 조회가 어떤 인덱스에 기대는지 실행 계획으로 확인한다.

이 방식은 `MAX(extra_days)`가 정상 범위이고 `idx_content_item_extra_days`가 유지된다는 조건에 의존한다. 그래서 첫 성능 개선 뒤에 반대 입장에서 다시 검토했다.

[^functional-index]: 함수식에 맞춘 생성 컬럼이나 함수 기반 인덱스를 별도로 두면 같은 표현식도 인덱스로 찾을 수 있다.
