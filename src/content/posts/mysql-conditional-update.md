---
title: "Check-Then-Act 동시성 문제를 조건부 UPDATE로 막은 이유"
slug: "mysql-conditional-update"
description: "일반 SELECT와 UPDATE 사이의 경쟁을 MVCC 문제와 구분하고, 변경 조건을 UPDATE에 넣어 원자적으로 판정한 이유를 설명한다."
kind: "tech"
category: "database"
publishedAt: "2026-03-26"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "innodb", "concurrency", "sql"]
relatedPosts: []
references:
  - title: "MySQL 8.0 Reference Manual — InnoDB Consistent Nonlocking Reads"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html"
  - title: "MySQL 8.0 Reference Manual — InnoDB Locking Reads"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html"
  - title: "MySQL 8.0 Reference Manual — Locks Set by Different SQL Statements"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html"
  - title: "MySQL 8.0 Reference Manual — InnoDB Transaction Isolation Levels"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html"
---

한 리소스에 대해 한 번만 값을 확정할 수 있는 기능이 있었다. 코드는 먼저 현재 값을 읽고, 비어 있으면 UPDATE하는 전형적인 check-then-act 구조였다.

```java
Allocation allocation = repository.findById(resourceId);
if (allocation.getAmount() != null && allocation.getAmount() > 0) {
    throw new AlreadyAllocatedException();
}

repository.allocate(resourceId, amount);
```

```sql
UPDATE resource_allocations
SET amount = COALESCE(amount, 0) + :amount
WHERE resource_id = :resourceId;
```

단독 요청에서는 멀쩡했다. 거의 동시에 들어온 두 요청이 모두 SELECT를 통과하고 UPDATE까지 실행했을 때 처음 문제가 드러났다.

## 처음에는 MVCC 스냅샷을 의심했다

InnoDB의 `REPEATABLE READ`에서 일반 SELECT는 consistent nonlocking read로 동작한다. 그래서 첫 가설은 이랬다.

> 두 번째 요청이 오래된 스냅샷을 봐서 첫 번째 요청의 변경을 놓친 것 아닐까?

그럴듯했지만 타임라인을 그리자 바로 틀린 설명이라는 게 보였다.

```text
트랜잭션 A                         트랜잭션 B
──────────                         ──────────
SELECT amount → 0
                                   SELECT amount → 0
UPDATE amount
                                   UPDATE amount
COMMIT
                                   COMMIT
```

B의 SELECT는 A의 UPDATE보다 먼저 실행됐다. 그 시점에는 스냅샷이든 최신 커밋 상태든 값이 실제로 0이었다. B가 못 본 변경은 아직 존재하지도 않았다. 격리 수준을 `READ COMMITTED`로 낮추거나 스냅샷을 없애도 이 순서에서는 결과가 같다.

가설이 틀렸다. MVCC는 이 경합의 원인이 아니었다.

## 진짜 원인은 잠그지 않은 체크였다

`READ COMMITTED`와 `REPEATABLE READ`의 consistent read는 읽은 인덱스 레코드에 행 잠금을 걸지 않는다. A가 체크를 끝낸 순간 그 결과는 이미 과거 정보가 된다. A의 SELECT와 UPDATE 사이에 B가 똑같이 체크할 수 있다.

```text
check ───────────── act
        ↑
        다른 요청이 끼어들 수 있는 창
```

원인은 스냅샷이 오래된 것이 아니라, 확인과 변경이 서로 다른 SQL 문장이라는 데 있었다.

MVCC가 전혀 무관한 것은 아니다. 순서를 바꿔 A가 먼저 커밋했더라도, B의 트랜잭션이 앞선 SELECT에서 이미 스냅샷을 만들었다면 B는 과거 값을 읽을 수 있다.

```text
트랜잭션 A                         트랜잭션 B
──────────                         ──────────
                                   SELECT 다른 행
                                   → 스냅샷 확정
UPDATE amount
COMMIT
                                   SELECT amount
                                   → 과거 스냅샷의 0
```

이 순서에서도 SELECT 결과만으로 변경 가능 여부를 최종 판단해서는 안 된다.

## 체크를 UPDATE의 WHERE로 옮겼다

**변경 가능 조건을 UPDATE의 WHERE 절에 넣어 조건 확인과 변경을 한 문장으로 처리했다.**

```sql
UPDATE resource_allocations
SET amount = COALESCE(amount, 0) + :amount
WHERE resource_id = :resourceId
  AND (amount IS NULL OR amount <= 0);
```

애플리케이션은 UPDATE 결과를 확인한다.

```java
int updated = repository.allocateIfEmpty(resourceId, amount);
if (updated == 0) {
    throw new AlreadyAllocatedException();
}
```

단일 UPDATE 안에서는 조건 평가와 변경 사이에 다른 트랜잭션이 끼어들 수 없다. 먼저 실행한 요청이 행을 바꾸면 뒤의 UPDATE는 최신 상태에서 WHERE를 다시 평가하고 `0`을 반환한다.

```text
요청 A                              요청 B
──────                              ──────
UPDATE ... WHERE amount <= 0
→ 조건 일치, updated = 1
→ X-lock
                                    같은 UPDATE 시도
                                    → 필요하면 잠금 대기
COMMIT
                                    WHERE 재평가
                                    → amount가 이미 양수
                                    → updated = 0
```

문제가 난 경로는 UPDATE 한 문장이 autocommit으로 끝나는 구조였다. 이 경우 A가 즉시 커밋되므로 B는 최신 값을 보고 곧바로 실패한다. 명시적 트랜잭션 안에서도 원리는 같다. 다만 A가 커밋할 때까지 B가 잠금을 기다릴 수 있다.

앞단 SELECT는 단독 요청에서 더 이른 오류를 주기 위해 남겼다. 동시 요청의 최종 판단은 조건부 UPDATE 결과로만 한다.

## SELECT FOR UPDATE를 쓰지 않은 이유

처음에는 `SELECT ... FOR UPDATE`를 "잠금 경합이 커질 것 같다"는 이유로 기각했다. 이 설명도 틀렸다. `FOR UPDATE`와 UPDATE는 모두 검색한 인덱스 레코드에 배타 잠금을 건다. 조건부 UPDATE라고 잠금이 가벼워지는 것은 아니다.

선택지를 다시 비교하면 이렇다.

| 방법 | 장점 | 이 사례에서의 비용 |
|---|---|---|
| `SELECT ... FOR UPDATE` | 읽은 뒤 복잡한 결정을 할 수 있음 | DB 왕복이 늘고 명시적 트랜잭션 경계가 필요 |
| 조건부 UPDATE | check와 act가 한 문장 | 행이 이미 존재해야 함 |
| 유니크 제약 | INSERT 경합도 DB가 보장 | 문제의 단위에 맞는 스키마 제약 필요 |
| 분산 락 | DB 밖 자원까지 조율 가능 | 인프라와 예외 처리 대상이 늘어남 |

조건부 UPDATE도 행에 배타 잠금을 건다. 이를 고른 이유는 기존 UPDATE에 조건을 추가하고 affected rows만 검사하면 됐기 때문이다.

## 이 패턴이 해결하지 못하는 것

### 행이 아직 없으면 쓸 수 없다

UPDATE는 존재하지 않는 행의 상태 전이를 지킬 수 없다. 두 요청이 각각 INSERT하려는 문제라면 유니크 제약이 필요하다. 조건부 UPDATE와 유니크 키는 대체재가 아니라 서로 다른 경합을 막는다.

### 잠금 범위는 인덱스에 달려 있다

`resource_id`가 유니크 인덱스라면 한 행을 정확히 찾는다. 적절한 인덱스가 없으면 InnoDB는 넓은 범위를 스캔하고 그만큼 많은 인덱스 레코드를 잠글 수 있다. WHERE에 조건 한 줄을 더했다고 잠금 범위가 자동으로 좁아지지 않는다.

### 기다리다 예외가 날 수도 있다

앞선 트랜잭션이 오래 X-lock을 유지하면 뒤 요청은 `updated == 0`까지 도달하지 못하고 lock wait timeout 예외를 받을 수 있다. 중복 비즈니스 오류와 DB 잠금 예외는 서로 다른 경로로 처리해야 한다.

### SERIALIZABLE은 별도 검토가 필요하다

autocommit이 꺼진 `SERIALIZABLE`에서는 평범한 SELECT가 암묵적인 공유 잠금 읽기로 바뀔 수 있다. 두 트랜잭션이 각각 S-lock을 가진 뒤 X-lock으로 전환하려 하면 데드락이 날 수 있다. 이 글의 흐름은 일반적으로 많이 쓰는 `READ COMMITTED`와 `REPEATABLE READ`를 전제로 한다.

## 원인 설명도 고쳤다

조건부 UPDATE 자체는 처음부터 잘 동작했다. 문제는 내가 그 이유를 MVCC로 설명하고 있었다는 데 있었다. 원인을 어렵게 짚으니 `FOR UPDATE`를 배제한 이유도 함께 틀어졌다.

**동시성 문제가 생기면 먼저 확인 쿼리가 어떤 잠금을 잡는지, 확인과 변경이 한 SQL 문장인지부터 본다.** 이 사례에서는 일반 SELECT가 잠그지 않는다는 점과 WHERE 절의 조건이 답이었다.
