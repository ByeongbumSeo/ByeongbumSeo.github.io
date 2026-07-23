---
title: "MySQL 드라이빙 테이블을 필터 결과와 반복 횟수로 판단하기"
slug: "mysql-driving-table"
description: "원본 테이블 크기보다 필터 후 행 수·안쪽 인덱스 비용·EXPLAIN ANALYZE의 loops로 nested-loop 조인 순서를 판단한다."
kind: "tech"
category: "database"
publishedAt: "2026-04-01"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "sql", "database", "performance"]
relatedPosts: []
references:
  - title: "MySQL 8.4 Reference Manual — Nested-Loop Join Algorithms"
    url: "https://dev.mysql.com/doc/refman/8.4/en/nested-loop-joins.html"
  - title: "MySQL 8.4 Reference Manual — EXPLAIN Output Format"
    url: "https://dev.mysql.com/doc/refman/8.4/en/explain-output.html"
  - title: "MySQL 8.4 Reference Manual — EXPLAIN Statement"
    url: "https://dev.mysql.com/doc/refman/8.4/en/explain.html"
  - title: "MySQL 8.4 Reference Manual — Hash Join Optimization"
    url: "https://dev.mysql.com/doc/refman/8.4/en/hash-joins.html"
  - title: "MySQL 8.4 Reference Manual — ANALYZE TABLE Statement"
    url: "https://dev.mysql.com/doc/refman/8.4/en/analyze-table.html"
  - title: "MySQL 8.4 Reference Manual — Optimizer Hints"
    url: "https://dev.mysql.com/doc/refman/8.4/en/optimizer-hints.html"
---

드라이빙 테이블을 처음 접하면 보통 “작은 테이블을 먼저 읽는다”라고 외우게 된다. 방향은 맞지만 이 문장만으로 실행 계획을 판단하면 금방 예외를 만난다. 원본 테이블의 전체 행 수보다 WHERE를 통과한 행 수가 중요하고, 다음 테이블을 어떤 방식으로 찾는지도 함께 봐야 한다.

더구나 현재 MySQL에는 nested-loop join뿐 아니라 hash join도 있다. 드라이빙 테이블이라는 용어가 어느 실행 방식에서 무엇을 뜻하는지부터 범위를 좁힐 필요가 있다.

## 드라이빙 테이블은 반복의 바깥쪽 입력이다

단순한 nested-loop join은 첫 번째 입력에서 행을 하나 읽고, 그 행과 맞는 데이터를 다음 입력에서 찾는 과정을 반복한다.

```text
for each row in outer_input:
    find matching rows in inner_input
```

여기서 먼저 읽어 반복을 시작하는 `outer_input`을 흔히 드라이빙 테이블, 나중에 조회하는 `inner_input`을 드리븐 테이블이라고 부른다.[^outer-input]

예를 들어 대상자 목록은 1천 행이고, 활동 이력은 5천만 행인 쿼리를 단순화해 보자.

```sql
SELECT t.user_id, a.created_at
FROM campaign_target AS t
JOIN activity_log AS a
  ON a.user_id = t.user_id
WHERE t.campaign_id = ?;
```

`campaign_target`에서 조건을 만족하는 1천 행을 먼저 읽고 `activity_log.user_id` 인덱스를 조회한다면, 안쪽 인덱스 탐색은 대략 1천 번에서 시작한다. 반대로 활동 이력 5천만 행을 먼저 훑고 대상자 여부를 확인하면 반복 횟수의 출발점부터 크게 달라진다.

```text
대상자 1천 행 → 활동 이력 인덱스 탐색 약 1천 회
활동 이력 5천만 행 → 대상자 탐색이 최대 수천만 회
```

이 숫자는 nested loop의 비용 차이를 이해하기 위한 단순화다. 실제 읽은 행은 조건의 선택도, 한 키에 매칭되는 행 수, 캐시, 인덱스 구조와 MySQL이 고른 조인 알고리즘에 따라 달라진다.

## “작은 테이블”은 필터링 뒤의 크기다

테이블 전체가 작다고 항상 좋은 드라이빙 입력은 아니다.

```sql
-- 전체로는 큰 테이블이지만 오늘 데이터만 남으면 수백 행일 수 있다.
WHERE created_at >= CURRENT_DATE
```

반대로 전체 행 수는 작아도 조건이 거의 걸러내지 못하고, 조인 키 하나마다 여러 행이 붙는다면 중간 결과가 커질 수 있다. 조인 순서를 볼 때 비교할 값은 테이블의 명목상 크기보다 다음에 가깝다.

```text
접근 방식으로 읽는 행 수
× 조건을 통과하는 비율
× 다음 입력에서 한 번에 매칭되는 행 수
```

`EXPLAIN`의 `rows`는 읽을 것으로 예상한 행 수이고 `filtered`는 테이블 조건을 통과할 것으로 예상한 비율이다. 둘 다 추정치다. 첫 입력의 예상 결과가 작더라도 안쪽 테이블을 매번 전체 스캔한다면 좋은 계획이 아니다.

**바깥쪽 입력에서 적은 행을 만들고, 각 행으로 안쪽 입력을 인덱스로 찾을 수 있는지가 더 중요하다.**

안쪽 입력의 조인 컬럼에 적절한 인덱스가 중요한 이유도 여기에 있다. 반복할 때마다 전체 테이블을 읽는 것과 인덱스로 필요한 범위만 찾는 것은 비용이 전혀 다르다.

## 현재 MySQL에서 FROM 순서는 실행 순서가 아니다

현재 MySQL은 통계와 비용 모델을 이용해 접근 방식과 조인 순서를 고른다.[^rbo] 같은 SQL도 데이터 분포, 인덱스, 통계와 서버 버전에 따라 다른 계획이 나올 수 있다. 일반적인 inner join에서는 SQL에 테이블을 적은 순서만 보고 드라이빙 테이블을 판단할 수 없다.

예외도 있다. `LEFT JOIN`은 결과 의미를 지키기 위해 왼쪽 입력을 오른쪽보다 먼저 읽어야 하는 의존성이 생길 수 있다. 옵티마이저가 outer join을 inner join으로 바꿀 수 있는 조건이라면 선택지가 다시 넓어진다. 조인 종류까지 보지 않고 테이블 크기만 비교해서는 안 되는 이유다.

## EXPLAIN에서는 순서보다 반복을 본다

전통적인 `EXPLAIN` 표는 MySQL이 테이블을 읽을 순서대로 행을 보여준다. 첫 행만 확인하면 어떤 입력이 먼저인지 볼 수 있지만, 그것만으로 비용을 설명하기는 부족하다.

```sql
EXPLAIN
SELECT ...;
```

함께 볼 값은 다음과 같다.

- `type`: 전체 스캔인지, range나 ref 같은 인덱스 접근인지
- `key`: 실제 선택한 인덱스
- `rows`, `filtered`: 읽고 남길 것으로 추정한 행 수
- `Extra`: 추가 필터, 정렬, join buffer 사용 여부

테스트 가능한 SELECT라면 `EXPLAIN ANALYZE`가 더 직접적이다. 이 명령은 쿼리를 실제로 실행하고 각 iterator의 실제 행 수와 반복 횟수를 보여준다.

```text
-> Nested loop inner join
    -> Index lookup on campaign_target ... (actual rows=1000 loops=1)
    -> Index lookup on activity_log ...    (actual rows=3 loops=1000)
```

위 출력은 읽는 법을 보여주기 위한 형태다. 안쪽 `activity_log` 조회의 `loops=1000`은 바깥 입력의 1천 행마다 한 번씩 실행됐다는 뜻이다. 반복 iterator의 `actual rows`는 loop당 평균이므로 전체 작업량은 대략 `rows × loops`로 읽는다. 위 예시라면 안쪽 조회가 반환한 행은 약 3천 건이다.

예상 행 수와 실제 행 수가 크게 다르면 조인 순서를 고정하기 전에 통계와 선택도 추정부터 확인한다.

MySQL은 인덱스의 key distribution과 cardinality 추정치를 조인 순서 결정에 사용한다. 통계가 오래됐다고 판단되면 `ANALYZE TABLE`을 검토할 수 있다. 다만 이 명령은 통계를 실제로 변경하고 실행 중 잠금과 운영 부하를 고려해야 하므로, 운영 환경에서 확인 없이 실행할 진단 명령은 아니다.

## hash join에서는 같은 비유가 충분하지 않다

적용할 조인 인덱스가 없는 동등 조인에서 MySQL은 hash join을 선택할 수 있다. 한 입력으로 해시 테이블을 만들고 다른 입력으로 이를 탐색하므로, “바깥 행마다 안쪽 인덱스를 몇 번 조회한다”는 nested-loop 설명이 그대로 맞지 않는다.

`EXPLAIN FORMAT=TREE`에서는 `Inner hash join`, `Hash`, `Table scan` 구조를 통해 `Hash` 아래의 build 입력과 다른 쪽의 probe 입력을 구분할 수 있다. `EXPLAIN ANALYZE`를 사용하면 실제 시간과 행 수도 확인할 수 있다. 메모리 사용량과 디스크 사용 여부는 별도의 운영 지표에서 확인해야 한다.[^hash-memory]

모든 조인을 드라이빙·드리븐 두 단어로만 설명하면 hash join의 실행 방식이 빠진다.

## 조인 순서 힌트는 마지막에 쓴다

MySQL에는 FROM 절 순서대로 조인하도록 하는 `STRAIGHT_JOIN`과 `JOIN_ORDER`, `JOIN_PREFIX` 같은 optimizer hint가 있다. 잘못된 계획을 즉시 피하는 데는 쓸 수 있지만, 먼저 순서를 고정하면 통계와 데이터가 바뀐 뒤 더 나은 계획으로 갈 선택지도 막는다. `STRAIGHT_JOIN`은 semijoin transformation을 제한할 수도 있다.

그래서 조인 성능을 볼 때는 다음 순서로 확인한다.

1. WHERE를 적용한 뒤 각 입력에서 실제로 몇 행이 남는지 본다.
2. 안쪽 입력이 조인 키로 index lookup을 하는지 확인한다.
3. `EXPLAIN ANALYZE`의 실제 `rows`와 `loops`가 추정과 얼마나 다른지 비교한다.
4. nested loop인지 hash join인지, outer join 때문에 순서 제약이 있는지 확인한다.
5. 통계와 인덱스를 바로잡아도 계획이 좋지 않을 때만 힌트를 검토한다.

**전체 테이블 크기보다 필터링 뒤의 행 수와 안쪽 조회 비용을 보고, `EXPLAIN ANALYZE`의 실제 반복 횟수로 확인해야 한다.**

[^outer-input]: 여기서 outer와 inner는 nested-loop join의 바깥쪽·안쪽 입력을 뜻한다. `LEFT OUTER JOIN`의 outer와는 다른 구분이다.
[^rbo]: 과거 규칙 기반 설명에서 쓰던 인덱스 유무나 FROM 절 순서는 현재 MySQL의 고정된 조인 순서 규칙이 아니다.
[^hash-memory]: 해시가 `join_buffer_size` 안에 들어가지 않으면 MySQL이 디스크를 사용할 수 있지만, 해당 여부가 `EXPLAIN FORMAT=TREE`에 직접 표시되지는 않는다.
