---
title: "UPDATE 중인 행을 SELECT하면 기다릴까 — InnoDB 잠금과 MVCC"
slug: "innodb-lock-mvcc"
description: "한 트랜잭션이 행을 수정하는 동안 일반 SELECT와 locking read가 어떻게 다르게 동작하는지 InnoDB의 잠금과 MVCC로 설명한다."
kind: "tech"
publishedAt: "2026-01-20"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "innodb", "mvcc", "concurrency"]
series:
  slug: "concurrency-locking"
  title: "동시성과 잠금"
  order: 3
relatedPosts: []
references:
  - title: "MySQL 8.0 Reference Manual — Consistent Nonlocking Reads"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html"
  - title: "MySQL 8.0 Reference Manual — Locking Reads"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html"
  - title: "MySQL 8.0 Reference Manual — Locks Set by Different SQL Statements"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html"
  - title: "MySQL 8.0 Reference Manual — Transaction Isolation Levels"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html"
  - title: "MySQL 8.0 Reference Manual — InnoDB Multi-Versioning"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-multi-versioning.html"
  - title: "MySQL 8.0 Reference Manual — InnoDB Locking"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html"
  - title: "MySQL 8.0 Reference Manual — The data_locks Table"
    url: "https://dev.mysql.com/doc/refman/8.0/en/performance-schema-data-locks-table.html"
---

한 트랜잭션이 행을 UPDATE하고 아직 커밋하지 않았다. 이때 다른 트랜잭션이 같은 행을 평범한 SELECT로 읽으면 어떻게 될까?

**InnoDB의 일반 SELECT는 UPDATE가 잡은 X-lock을 기다리지 않고, MVCC 스냅샷에 보이는 이전 버전을 읽는다.** 반면 `FOR UPDATE` 같은 locking read는 최신 행의 잠금을 기다린다.

이 글에서 말하는 일반 SELECT는 `READ COMMITTED`나 `REPEATABLE READ`에서 실행하는 consistent read를 뜻한다. `FOR UPDATE`·`FOR SHARE` 같은 locking read는 물론이고, autocommit을 끈 `SERIALIZABLE` 트랜잭션의 SELECT나 스키마 변경과 충돌한 metadata lock 대기는 동작이 다르다.

## S-lock과 X-lock

InnoDB에서 먼저 구분할 잠금은 공유 잠금과 배타 잠금이다.

| 잠금 | 용도 | 다른 S-lock | 다른 X-lock |
|---|---|:---:|:---:|
| S-lock, shared lock | 읽을 행 보호 | 허용 | 대기 |
| X-lock, exclusive lock | 쓸 행 보호 | 대기 | 대기 |

일반 SELECT는 이 표에 바로 들어가지 않는다. 일관된 비잠금 읽기(consistent nonlocking read)로 동작하기 때문이다. 잠금을 명시적으로 요청하는 읽기만 S-lock이나 X-lock을 획득한다.

```sql
-- 일반 SELECT: MVCC 스냅샷 읽기, 행 잠금 없음
SELECT * FROM users WHERE id = 1;

-- 공유 잠금
SELECT * FROM users WHERE id = 1 FOR SHARE;

-- 배타 잠금
SELECT * FROM users WHERE id = 1 FOR UPDATE;
```

UPDATE, DELETE, INSERT는 변경 대상에 배타 잠금을 건다.

```sql
UPDATE users SET point = 100 WHERE id = 1;
DELETE FROM users WHERE id = 1;
```

## 잠금은 SQL이 끝날 때 풀리지 않는다

잠금은 SQL 문장이 끝나도 풀리지 않고 COMMIT이나 ROLLBACK까지 유지된다.

```text
BEGIN
  ↓
UPDATE 또는 SELECT ... FOR UPDATE
  ↓
행 잠금 획득
  ↓
다른 작업 수행
  ↓
COMMIT / ROLLBACK
  ↓
잠금 해제
```

UPDATE 문장이 빠르게 끝났더라도 트랜잭션 안에서 외부 API를 호출하거나 무거운 계산을 계속하면 잠금은 그대로 남는다. 쿼리 시간만 보고 잠금 점유 시간을 판단하면 안 되는 이유다.

```java
// 잠금을 오래 잡을 수 있는 구조
@Transactional
public void process(long userId) {
    userRepository.updateStatus(userId);
    externalClient.call();
    historyRepository.insert(userId);
}
```

외부 호출이 DB 변경과 같은 원자성을 필요로 하지 않는다면 트랜잭션 경계 밖으로 분리하는 편이 낫다.

## 같은 행을 두 트랜잭션이 UPDATE하면

```text
트랜잭션 A                         트랜잭션 B
──────────                         ──────────
BEGIN
UPDATE users
SET point = 100
WHERE id = 1
→ id=1에 X-lock
                                   BEGIN
                                   UPDATE users
                                   SET point = 200
                                   WHERE id = 1
                                   → X-lock 대기
COMMIT
→ 잠금 해제
                                   UPDATE 실행
                                   COMMIT
```

두 번째 UPDATE는 첫 트랜잭션이 끝날 때까지 기다린다. 설정된 `innodb_lock_wait_timeout`을 넘기면 `Lock wait timeout exceeded` 오류를 받는다.

## 잠금 범위는 WHERE 문장보다 인덱스에 가깝다

"행 잠금"이라는 표현 때문에 WHERE에 맞는 행만 잠근다고 생각하기 쉽다. 실제로는 문장을 처리하며 스캔한 인덱스 레코드가 잠금 범위를 결정한다.

```sql
UPDATE users SET status = 'ACTIVE' WHERE id = 1;
```

`id`가 기본 키라면 한 레코드를 정확히 찾는다. 반면 아래 조건에 인덱스가 없다면 전체 스캔 과정에서 훨씬 많은 레코드가 잠길 수 있다.

```sql
UPDATE users
SET status = 'ACTIVE'
WHERE email = 'reader@example.com';
```

범위 조건에서는 격리 수준과 인덱스에 따라 gap lock과 next-key lock도 등장한다.

```sql
UPDATE users
SET status = 'ACTIVE'
WHERE age BETWEEN 20 AND 30;
```

`REPEATABLE READ`에서 `age` 인덱스를 범위 스캔하면 레코드뿐 아니라 사이 구간도 잠글 수 있다. `READ COMMITTED`에서는 검색과 인덱스 스캔에 대한 gap locking이 대부분 비활성화된다. 같은 SQL도 격리 수준과 실행 계획을 빼고는 잠금 범위를 말할 수 없다.

## 그런데 일반 SELECT는 왜 기다리지 않나

InnoDB는 행을 수정할 때 이전 값을 undo log에 남기고, 행의 숨겨진 메타데이터[^internal-row-id]로 버전 체인을 연결한다.

| 숨겨진 필드 | 역할 |
|---|---|
| `DB_TRX_ID` | 마지막으로 행을 수정한 트랜잭션 식별자 |
| `DB_ROLL_PTR` | undo log의 이전 버전을 가리키는 포인터 |

```text
현재 행: id=1, point=100, DB_TRX_ID=200
  └─ DB_ROLL_PTR
       ↓
undo: id=1, point=50, DB_TRX_ID=150
  └─ DB_ROLL_PTR
       ↓
undo: id=1, point=30, DB_TRX_ID=100
```

일반 SELECT는 현재 행의 버전이 자기 read view에 보이는지 확인한다. 보이지 않으면 `DB_ROLL_PTR`를 따라가며 읽을 수 있는 이전 버전을 찾는다. 그래서 쓰는 트랜잭션이 최신 행에 X-lock을 들고 있어도 읽는 트랜잭션은 과거의 커밋된 버전을 즉시 얻을 수 있다.

```text
트랜잭션 A                         트랜잭션 B
──────────                         ──────────
BEGIN                              BEGIN
UPDATE users SET point=100
WHERE id=1
→ 이전 값 50을 undo에 기록
→ X-lock 획득
                                   SELECT point FROM users WHERE id=1
                                   → 기다리지 않음
                                   → 스냅샷에 보이는 point=50 반환
COMMIT
                                   SELECT를 다시 실행
                                   → REPEATABLE READ라면 여전히 50
```

`READ COMMITTED`는 SELECT마다 새 스냅샷을 만든다. `REPEATABLE READ`는 트랜잭션 안의 첫 consistent read가 만든 스냅샷을 이후 읽기에서도 사용한다. `BEGIN` 순간이 아니라 첫 읽기 순간이라는 점이 자주 헷갈리는 지점이다.

## MVCC가 잠금을 없애는 것은 아니다

MVCC 덕분에 "일반 읽기"와 "쓰기"는 대체로 서로를 막지 않는다. **최신 값을 바탕으로 변경해야 한다면 일반 SELECT가 아니라 locking read나 조건부 UPDATE를 써야 한다.**

또 오래 열린 트랜잭션은 과거 버전을 계속 필요로 한다. InnoDB purge thread는 어떤 활성 트랜잭션도 참조하지 않는 undo 버전만 정리할 수 있으므로, 긴 트랜잭션은 undo 누적과 성능 저하로 이어질 수 있다.

## 잠금이 의심될 때 확인할 곳

MySQL 8.0에서는 다음 뷰를 함께 본다.[^legacy-lock-views]

```sql
SELECT * FROM performance_schema.data_locks;
SELECT * FROM performance_schema.data_lock_waits;
SELECT * FROM information_schema.INNODB_TRX;
SHOW PROCESSLIST;
```

## 정리

- UPDATE와 DELETE는 대상 인덱스 레코드에 X-lock을 잡고 트랜잭션 종료까지 유지한다.
- 다른 UPDATE나 locking read는 그 잠금과 충돌하면 기다린다.
- `READ COMMITTED`와 `REPEATABLE READ`의 consistent read는 행 잠금을 요청하지 않고 MVCC 스냅샷에서 읽으므로 보통 기다리지 않는다.
- 잠금 범위는 WHERE의 문장 모양보다 인덱스와 실행 계획, 격리 수준에 좌우된다.
- 최신 상태를 확인하며 변경해야 한다면 일반 SELECT의 스냅샷이 아니라 잠금 읽기나 조건부 DML을 선택해야 한다.

[^internal-row-id]: 기본 키나 모든 컬럼이 `NOT NULL`인 적절한 유니크 인덱스가 없으면 InnoDB는 내부 행 식별자인 `DB_ROW_ID`를 만든다. 버전 체인을 따라갈 때 핵심이 되는 필드는 `DB_TRX_ID`와 `DB_ROLL_PTR`다.

[^legacy-lock-views]: MySQL 5.7의 `INNODB_LOCKS`와 `INNODB_LOCK_WAITS`는 8.0.1에서 제거됐다. `data_locks`는 대기 중인 잠금뿐 아니라 현재 보유한 잠금도 보여주므로 이전 뷰와 결과가 같지는 않다.
