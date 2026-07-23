---
title: "MySQL 조건부 MAX 풀스캔과 ORDER BY DESC LIMIT 1의 적용 조건"
slug: "mysql-max-vs-limit"
description: "published가 인덱스 밖에 있어 조건부 MAX 최적화가 깨진 원인과, 역순 인덱스 탐색이 유효한 데이터 분포 조건을 설명한다."
kind: "tech"
category: "database"
publishedAt: "2026-04-06"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "database", "sql", "performance"]
relatedPosts: []
references:
  - title: "MySQL 8.0 Reference Manual — WHERE Clause Optimization"
    url: "https://dev.mysql.com/doc/refman/8.0/en/where-optimization.html"
  - title: "MySQL 8.0 Reference Manual — LIMIT Query Optimization"
    url: "https://dev.mysql.com/doc/refman/8.0/en/limit-optimization.html"
  - title: "MySQL 8.0 Reference Manual — EXPLAIN Output Format"
    url: "https://dev.mysql.com/doc/refman/8.0/en/explain-output.html"
  - title: "MySQL source — sql/opt_sum.cc"
    url: "https://github.com/mysql/mysql-server/blob/8.0/sql/opt_sum.cc"
---

배치 결과 중 가장 최근에 공개된 회차를 찾는 쿼리가 있었다. 당장은 빠르게 끝났지만, 데이터가 계속 쌓이는 테이블이라 `EXPLAIN`을 열어봤다. 예상과 달리 전체 테이블을 읽고 있었다.

```sql
SELECT MAX(batch_id)
FROM release_item
WHERE published = 1;
```

`batch_id`에는 인덱스가 있었다. 그래서 처음에는 당연히 인덱스의 마지막 값만 읽을 거라고 생각했다. 문제는 `MAX()`가 아니라 그 옆의 `WHERE`였다.

## 조건 없는 MAX와 조건 있는 MAX는 다르다

공개용으로 단순화한 테이블은 다음과 같다.

```sql
CREATE TABLE release_item (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    batch_id   BIGINT      NOT NULL,
    item_id    BIGINT      NOT NULL,
    rank_no    INT         NOT NULL,
    published  TINYINT(1)  NOT NULL DEFAULT 0,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_release_item_batch (batch_id)
);
```

데이터는 배치마다 수십 건씩 누적되고 삭제하지 않는다. 대부분은 `published = 1`이고, 아직 공개되지 않은 최신 배치만 0이다.

MySQL은 조건 없는 `MAX(batch_id)`를 인덱스 끝에서 바로 구할 수 있다. 이때 `EXPLAIN`에는 `Select tables optimized away`가 나타난다.[^optimized-away] 하지만 조건이 붙은 MIN/MAX를 같은 방식으로 처리하려면 조건이 대상 인덱스의 선행 키와 맞아야 한다.

현재 인덱스는 `(batch_id)`뿐인데 조건은 인덱스 밖의 `published`에 걸려 있다. MySQL은 인덱스 끝의 값이 조건을 만족한다고 보장할 수 없고, MIN/MAX 전용 최적화 경로를 포기했다.

```text
MAX(batch_id)                                  → 인덱스 끝 조회
MAX(batch_id) WHERE published = 1              → 전체 스캔
MAX(batch_id) WHERE indexed_prefix = constant  → 인덱스 구성에 따라 최적화 가능
```

처음에는 “`batch_id` 인덱스를 뒤에서 읽다가 `published = 1`인 첫 행에서 멈추면 되지 않나?”라고 생각했다. 그 생각 자체는 맞다. 다만 MySQL의 조건부 `MAX()` 최적화가 그 실행 계획으로 자동 전환해 주지는 않았다.

## 집계 대신 정렬과 조기 종료를 썼다

쿼리의 뜻을 직접 표현해 봤다.

```sql
SELECT batch_id
FROM release_item
WHERE published = 1
ORDER BY batch_id DESC
LIMIT 1;
```

이 테이블에는 공개된 배치가 항상 하나 이상 있어 두 쿼리로 얻는 `batch_id`는 같았다. 다만 일반적으로 반환 형태까지 같지는 않다.

조건을 만족하는 행이 없으면 `MAX()`는 `NULL` 한 행을 반환하지만, `ORDER BY ... LIMIT 1`은 행을 반환하지 않는다. 호출부가 이 차이를 처리할 수 있는지 먼저 확인해야 한다.

이 전제 아래에서 실행 경로는 달랐다.

- `MAX() + WHERE`는 조건부 집계 최적화가 성립하지 않으면 전체 스캔으로 갔다.
- `ORDER BY ... DESC LIMIT 1`은 `batch_id` 인덱스를 역순으로 읽고, 각 행의 `published`를 검사한 뒤 첫 일치에서 멈췄다.

실제 `EXPLAIN`에서도 `type=index`, `Backward index scan`, `Using where`를 확인했다. `rows=1` 같은 값은 어디까지나 옵티마이저 추정치다. `published`는 인덱스에 없으므로 실제로는 미공개 행을 지나 공개 행을 만날 때까지 테이블 행을 확인한다.

이 테이블에서는 미공개 행이 최신 배치 하나에만 있고 배치 크기에도 상한이 있었다. 따라서 새 쿼리가 최대로 읽는 행 수는 “최신 미공개 배치 크기 + 1”이었다. 데이터가 두 배로 늘었을 때 기존 쿼리의 예상 스캔 행은 거의 두 배가 됐지만, 새 쿼리가 훑는 범위는 그대로였다.

## 복합 인덱스보다 이 방법을 택한 이유

`(published, batch_id)` 복합 인덱스를 추가해도 조건부 최댓값을 빠르게 찾을 수 있다. 다만 이 테이블에서 `published`는 거의 모든 행이 1인 저선택도 컬럼이고, 쓰기가 계속 발생한다. 이미 존재하는 인덱스로 고정된 소수 행만 읽을 수 있었기 때문에 새 인덱스의 저장 공간과 쓰기 비용을 추가하지 않았다.

이 선택은 데이터 분포에 기대고 있다. 다음 상황에서는 복합 인덱스가 더 낫다.

- 조건에 맞는 행이 드물어 역순으로 아주 멀리 읽어야 한다.
- 미공개 배치의 크기에 상한이 없다.
- `published`와 `batch_id` 조합을 쓰는 조회가 여러 곳에 반복된다.

`ORDER BY ... LIMIT 1`이 언제나 `MAX()`보다 빠른 것은 아니다. **첫 일치 행까지 훑을 최대 범위가 작다고 확인했을 때만 이 방법이 유효하다.**

## 전체 쿼리에서도 다시 확인했다

최신 회차를 구하는 서브쿼리는 실제로 다른 테이블과 조인된다.

```sql
SELECT r.item_id, r.rank_no
FROM release_item r
JOIN content_item i ON i.id = r.item_id
WHERE r.batch_id = (
    SELECT batch_id
    FROM release_item
    WHERE published = 1
    ORDER BY batch_id DESC
    LIMIT 1
)
  AND i.visible = 1
ORDER BY r.rank_no
LIMIT 50;
```

서브쿼리가 상수로 정리된 뒤에는 `batch_id` 인덱스로 해당 배치만 읽고, 콘텐츠 테이블은 기본 키로 조회했다. 서브쿼리뿐 아니라 전체 쿼리의 조인 순서와 접근 방식도 함께 확인했다.

**인덱스가 있다는 사실만으로 실행 계획을 추측하지 말고, 새 쿼리가 빠른 상태를 유지하는 데이터 조건까지 확인해야 한다.**

[^optimized-away]: MIN/MAX 전용 최적화가 적용돼 테이블 접근이 실행 계획에 남지 않았을 때 볼 수 있는 `EXPLAIN` 표시다.
