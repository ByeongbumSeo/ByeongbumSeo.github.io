---
title: "페이징 중복·누락, OFFSET보다 ORDER BY를 먼저 본 이유"
slug: "deterministic-pagination"
description: "OFFSET 페이징에서 같은 행이 다시 보일 수 있던 원인을 비결정적 정렬에서 찾고, 고유한 tie-breaker와 커서 페이징의 경계를 정리한다."
kind: "tech"
publishedAt: "2026-01-21"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "sql", "pagination", "debugging"]
relatedPosts: []
references:
  - title: "MySQL 8.4 Reference Manual — LIMIT Query Optimization"
    url: "https://dev.mysql.com/doc/refman/8.4/en/limit-optimization.html"
  - title: "MySQL 8.4 Reference Manual — ORDER BY Optimization"
    url: "https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html"
---

운영 도구의 스크롤 목록을 살펴보다가, 페이지를 넘길 때 같은 항목이 다시 나오거나 일부 항목을 건너뛸 수 있는 쿼리를 발견했다. 처음에는 `OFFSET` 방식 자체의 문제라고 생각하기 쉽지만, 이 경우에는 그보다 먼저 `ORDER BY`가 완전한 순서를 만들지 못하고 있었다.

쿼리는 날짜와 생성 시각을 내림차순으로 정렬했다. 날짜는 하루 단위였고 생성 시각도 같은 값을 가진 행이 여럿 존재할 수 있었다.

```sql
SELECT id, event_date, created_at
FROM activity_log
WHERE owner_id = ?
ORDER BY event_date DESC, created_at DESC
LIMIT 40 OFFSET 0;
```

정렬 컬럼의 값이 모두 같은 두 행 중 무엇이 먼저 와야 하는지는 이 SQL에 적혀 있지 않다. MySQL 문서도 `ORDER BY` 컬럼 값이 같은 행은 어떤 순서로든 반환할 수 있고, 실행 계획에 따라 그 순서가 달라질 수 있다고 설명한다.

## 정렬했는데도 순서가 정해지지 않았다

다음 네 행이 페이지 경계에 걸쳐 있다고 해보자.

| `event_date` | `created_at` | `id` |
|---|---|---:|
| 2026-01-20 | 2026-01-20 10:00:00 | 104 |
| 2026-01-20 | 2026-01-20 10:00:00 | 103 |
| 2026-01-20 | 2026-01-20 10:00:00 | 102 |
| 2026-01-20 | 2026-01-20 10:00:00 | 101 |

현재 `ORDER BY`만 보면 네 행은 모두 동률이다. 첫 번째 요청에서는 `104, 103, 102, 101` 순서로 읽고, 두 번째 요청에서는 `102, 104, 101, 103` 순서로 읽어도 SQL 계약을 어기지 않는다.

OFFSET 페이징은 요청마다 쿼리를 다시 실행한다.

```sql
-- 첫 페이지
LIMIT 40 OFFSET 0

-- 다음 페이지
LIMIT 40 OFFSET 40
```

첫 요청과 다음 요청에서 동률 행의 내부 순서가 달라지면 페이지 경계도 달라진다. 첫 페이지의 마지막 행이 다음 페이지에 다시 들어오거나, 경계 밖으로 밀린 행을 어느 페이지에서도 받지 못할 수 있다.

여기서 비결정적이라는 말은 실행할 때마다 반드시 무작위로 섞인다는 뜻이 아니다. 같은 데이터와 같은 실행 계획에서는 수백 번 같은 순서가 나올 수도 있다. 다만 그 순서를 SQL이 보장하지 않으므로 인덱스, 통계, `LIMIT` 유무나 실행 계획이 달라졌을 때 애플리케이션이 의존할 수 없다는 뜻이다.

## 페이지 경계를 고유한 값으로 닫았다

수정은 `ORDER BY`의 마지막에 기본 키를 추가하는 것이었다.

```sql
SELECT id, event_date, created_at
FROM activity_log
WHERE owner_id = ?
ORDER BY event_date DESC, created_at DESC, id DESC
LIMIT 40 OFFSET ?;
```

앞의 두 값이 같아도 `id`가 마지막 순서를 결정한다. 정렬 컬럼 전체 조합이 결과 집합에서 고유해야 페이지 경계가 하나로 고정된다. 단순히 컬럼을 하나 더 붙이는 것이 아니라 **더는 동률이 남지 않게 만드는 것**이 핵심이다.

처음에는 LEFT JOIN으로 가져오는 상세 테이블의 식별자를 tie-breaker로 쓰는 선택지도 있었다. 하지만 상세 행이 삭제됐거나 존재하지 않으면 그 값은 `NULL`이 된다. 여러 행이 다시 `NULL`로 묶여 같은 문제가 남는다.

그래서 페이지를 자르는 원본 테이블 안에서 항상 존재하고 고유한 값을 골랐다. 공개 예시에서는 `activity_log.id`가 그 역할을 한다. 복합 키를 쓴다면 WHERE 조건으로 일부 키가 이미 고정됐는지까지 포함해, 남은 정렬 키 조합이 실제로 고유한지 확인해야 한다.

## tie-breaker가 모든 중복과 누락을 막지는 않는다

고유한 tie-breaker는 **같은 데이터 집합을 정렬할 때** 순서를 결정한다. 두 페이지를 읽는 사이에 데이터가 바뀌는 문제까지 없애지는 않는다.

예를 들어 첫 페이지를 읽은 뒤 목록 맨 앞에 새 행이 추가되면 기존 행들의 OFFSET이 하나씩 밀린다. 다음 페이지가 여전히 `OFFSET 40`에서 시작하면 첫 페이지의 마지막 행을 다시 읽을 수 있다. 반대로 앞쪽 행이 삭제되면 아직 읽지 않은 행 하나를 건너뛸 수 있다.

따라서 두 문제를 구분해야 한다.

| 원인 | tie-breaker로 해결되는가 |
|---|---|
| 정렬 키가 같은 행들의 순서가 정해지지 않음 | 해결됨 |
| 페이지 요청 사이 INSERT·DELETE로 위치가 이동함 | 해결되지 않음 |

두 번째 문제가 중요하거나 OFFSET이 깊어지는 목록이라면 keyset pagination을 검토할 수 있다. 마지막으로 본 정렬 키를 다음 요청의 커서로 넘기는 방식이다. 아래 예시는 원리를 보기 위해 정렬 키를 `created_at`, `id` 두 개로 줄였다. 실제 쿼리가 `event_date`, `created_at`, `id`를 정렬한다면 커서와 다음 페이지 조건에도 세 값을 모두 포함해야 한다.

```sql
-- 첫 페이지
SELECT id, created_at
FROM activity_log
WHERE owner_id = ?
ORDER BY created_at DESC, id DESC
LIMIT 40;
```

```sql
-- 다음 페이지: 직전 페이지의 마지막 created_at과 id를 함께 전달한다.
SELECT id, created_at
FROM activity_log
WHERE owner_id = ?
  AND (
      created_at < ?
      OR (created_at = ? AND id < ?)
  )
ORDER BY created_at DESC, id DESC
LIMIT 40;
```

새 행이 목록 앞에 들어와도 이미 받은 마지막 키보다 뒤에 있는 행부터 이어서 읽는다. 큰 OFFSET만큼 앞부분을 계속 건너뛰지 않아도 된다는 장점도 있다.

다만 커서 방식도 데이터 전체를 얼려두지는 않는다. 이미 읽은 행의 정렬 키가 바뀌거나 행이 삭제될 때 무엇을 보여줄지는 별도 정책이 필요하다. 정렬 방향이 섞이거나 컬럼이 `NULL`을 허용한다면 커서 조건도 그 순서를 정확히 반영해야 한다.

## 반복 실행만으로는 검증이 부족하다

비결정적 정렬이 로컬에서 우연히 늘 같은 결과를 낼 수 있으므로, 같은 쿼리를 여러 번 실행하는 것만으로는 충분하지 않다. 페이지 크기보다 많은 행에 같은 정렬 값을 넣고 경계 자체를 검증해야 한다.

- 첫 페이지와 다음 페이지 ID의 교집합이 비어 있는지 확인한다.
- 두 페이지 ID의 합집합이 기대한 연속 구간과 같은지 확인한다.
- 정렬 키가 같은 행을 페이지 경계 양쪽에 의도적으로 배치한다.
- 페이지 사이에 INSERT나 DELETE를 넣어 OFFSET과 커서 방식의 차이를 확인한다.
- 정렬과 조회 조건에 맞는 복합 인덱스가 사용되는지는 `EXPLAIN`으로 별도 확인한다.

이번 수정에서 SQL의 모양은 `ORDER BY` 컬럼 하나가 늘어난 정도였다. 하지만 확인해야 했던 것은 OFFSET 계산이 아니라 목록의 순서가 정말 하나로 결정되는가였다. 페이징 쿼리를 볼 때는 먼저 이 질문을 하게 됐다.

> 정렬 컬럼의 값이 전부 같아도, 이 두 행의 앞뒤를 SQL만 보고 결정할 수 있는가?
