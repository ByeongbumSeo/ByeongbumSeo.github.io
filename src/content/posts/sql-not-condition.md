---
title: "SQL NOT으로 반대 조건을 읽기 쉽게 표현하기"
slug: "sql-not-condition"
description: "서로 반대되는 조회 옵션을 구현할 때 NOT으로 조건의 관계를 명확하게 표현하는 방법을 정리한다."
kind: "tech"
publishedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["sql", "database"]
relatedPosts: ["jdbc"]
references:
  - title: "PostgreSQL 18 Documentation - Logical Operators"
    url: "https://www.postgresql.org/docs/18/functions-logical.html"
  - title: "PostgreSQL 18 Documentation - Comparison Functions and Operators"
    url: "https://www.postgresql.org/docs/18/functions-comparison.html"
  - title: "PostgreSQL 18 Documentation - The WHERE Clause"
    url: "https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-WHERE"
  - title: "MySQL 8.4 Reference Manual - Logical Operators"
    url: "https://dev.mysql.com/doc/refman/8.4/en/logical-operators.html"
---

## 조건 전체를 뒤집는 NOT

`NOT`은 뒤에 오는 조건을 논리적으로 부정하는 표준 SQL 연산자다. 괄호를 사용하면 여러 조건을 하나로 묶어 부정할 수 있다.

```sql
WHERE NOT (A AND B)
```

드모르간 법칙에 따라 아래 조건과 논리적으로 같다.

```sql
WHERE (NOT A) OR (NOT B)
```

두 표현의 결과는 같지만, 읽는 방식은 다르다. `NOT (A AND B)`는 "A와 B를 모두 만족하는 경우가 아닌 것"이라는 의도를 그대로 보여준다.

## 서로 반대되는 조회 옵션

조회 옵션을 "특정 조건에 해당하는 항목"과 "그 외 항목"으로 나눌 일이 있었다. 예를 들어 기준 조건이 다음과 같다고 해보자.

```sql
-- 기준 조건에 해당
WHERE status = 'READY'
  AND source = 'AUTO'
```

반대 옵션은 기준 조건 전체를 `NOT`으로 감싸 표현할 수 있다.

```sql
-- 기준 조건에 해당하지 않음
WHERE NOT (
  status = 'READY'
  AND source = 'AUTO'
)
```

반대 조건을 직접 풀어 쓰는 것도 가능하다.

```sql
WHERE status <> 'READY'
   OR source <> 'AUTO'
```

하지만 이렇게 쓰면 원래 어떤 조건의 반대인지 다시 조합해서 읽어야 한다. `NOT (...)`을 사용하면 두 옵션이 같은 기준의 정방향과 역방향이라는 관계가 바로 보인다. 이 경우에는 SQL을 줄이는 것보다 조건의 의도를 드러내는 데 의미가 있었다.

## NULL은 별도로 판단해야 한다

`NOT`이 모든 행을 정확히 두 그룹으로 나눠 주는 것은 아니다. 비교 대상이 `NULL`이면 조건 결과가 `UNKNOWN`이 될 수 있고, `NOT UNKNOWN`도 `UNKNOWN`이다. `NULL`인 행을 반대 옵션에 포함해야 한다면 `IS NULL`이나 `COALESCE` 등으로 그 의미를 먼저 명시해야 한다.

`NOT`은 새로운 동작을 만드는 특별한 문법이 아니다. 서로 반대되는 옵션을 같은 조건을 기준으로 읽게 해주는, 작지만 유용한 표현 방법이다.
