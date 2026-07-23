---
title: "MySQL 잠금 대기, 무엇부터 확인할까 — InnoDB 진단 가이드"
slug: "database-locking-guide"
description: "sys.innodb_lock_waits, INNODB_TRX, 실행 계획을 연결해 waiter·blocker·잠긴 인덱스와 트랜잭션 시간을 찾는 순서를 제시한다."
kind: "tech"
publishedAt: "2026-01-20"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "innodb", "lock", "troubleshooting"]
series:
  slug: "concurrency-locking"
  title: "동시성과 잠금"
  order: 4
relatedPosts: []
references:
  - title: "MySQL 8.4 Reference Manual — InnoDB Locking"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-locking.html"
  - title: "MySQL 8.4 Reference Manual — Locks Set by Different SQL Statements"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-locks-set.html"
  - title: "MySQL 8.4 Reference Manual — The innodb_lock_waits and x$innodb_lock_waits Views"
    url: "https://dev.mysql.com/doc/refman/8.4/en/sys-innodb-lock-waits.html"
  - title: "MySQL 8.4 Reference Manual — InnoDB Lock and Lock-Wait Information"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-information-schema-understanding-innodb-locking.html"
  - title: "MySQL 8.4 Reference Manual — The data_locks Table"
    url: "https://dev.mysql.com/doc/refman/8.4/en/performance-schema-data-locks-table.html"
  - title: "MySQL 8.4 Reference Manual — The data_lock_waits Table"
    url: "https://dev.mysql.com/doc/refman/8.4/en/performance-schema-data-lock-waits-table.html"
  - title: "MySQL 8.4 Reference Manual — Deadlocks in InnoDB"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks.html"
  - title: "MySQL 8.4 Reference Manual — InnoDB Error Handling"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-error-handling.html"
---

데이터베이스 잠금을 처음 정리할 때는 S-lock과 X-lock의 호환성 표부터 외웠다. 개념을 이해하는 데는 도움이 됐지만, 실제로 요청이 멈췄을 때 필요한 답은 표 안에 없었다.

- 누가 기다리고 있는가?
- 어떤 트랜잭션이 막고 있는가?
- 한 행을 바꾸는 SQL이 왜 넓은 범위를 잠갔는가?
- 오류가 난 뒤 트랜잭션 전체가 롤백됐는가?

잠금 대기는 기다리는 세션, 막는 세션, 실제 인덱스와 트랜잭션 시작 시각을 함께 봐야 원인을 찾을 수 있다. 이 글은 MySQL 8.4와 InnoDB를 기준으로 그 확인 순서를 정리한다.

## 이 글에서 전제로 두는 잠금 범위

`SELECT ... FOR SHARE`와 `SELECT ... FOR UPDATE`는 locking read이고, `UPDATE`와 `DELETE`도 대상 인덱스 레코드에 잠금을 요구한다. 반면 `READ COMMITTED`와 `REPEATABLE READ`의 일반 SELECT는 보통 MVCC 버전을 읽는 consistent nonlocking read다.

여기서는 InnoDB의 record·gap·next-key lock을 다룬다. `SERIALIZABLE`의 읽기와 metadata lock처럼 별도 규칙을 가진 대기는 같은 증상으로 보일 수 있으므로, 모든 SELECT가 잠기거나 잠기지 않는다고 일반화하지 않는다.

## 1단계: 느린 쿼리인지 잠금 대기인지 구분한다

두 트랜잭션이 같은 행을 바꾸면 뒤의 UPDATE가 기다리는 것은 정상적인 동작이다.

```text
트랜잭션 A                         트랜잭션 B
──────────                         ──────────
BEGIN
UPDATE accounts
SET status = 'ACTIVE'
WHERE id = 1
→ X-lock 획득
                                   BEGIN
                                   같은 행 UPDATE
                                   → X-lock 대기
COMMIT
→ 잠금 해제
                                   UPDATE 실행
```

따라서 응답 시간이 길다는 이유만으로 SQL 자체가 느리다고 결론 내리면 안 된다. 실행 시간 대부분이 다른 트랜잭션을 기다린 시간일 수 있다. MySQL 8.4에서는 먼저 `sys.innodb_lock_waits`를 본다.

```sql
SELECT
    wait_age,
    locked_table_schema,
    locked_table_name,
    locked_index,
    waiting_pid,
    waiting_query,
    blocking_pid,
    blocking_query
FROM sys.innodb_lock_waits
ORDER BY wait_age_secs DESC;
```

이 뷰는 기다리는 세션과 막는 세션을 한 행에서 연결해 준다. 확인할 순서는 단순하다.

1. `waiting_pid`와 `waiting_query`로 실제 대기 중인 요청을 찾는다.
2. `blocking_pid`로 잠금을 가진 세션을 찾는다.
3. `locked_table_name`과 `locked_index`로 어떤 접근 경로에서 충돌했는지 확인한다.
4. `wait_age`와 트랜잭션 시작 시각을 비교해 잠금이 오래 유지된 이유를 찾는다.

`blocking_query`가 `NULL`이라고 해서 blocker가 사라진 것은 아니다. UPDATE를 마친 세션이 커밋하지 않은 채 idle 상태라면 현재 실행 중인 문장은 없지만, 트랜잭션은 여전히 잠금을 가질 수 있다.

```sql
SELECT
    trx_id,
    trx_state,
    trx_started,
    trx_wait_started,
    trx_mysql_thread_id,
    trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started;
```

잠금 정보는 계속 바뀌는 순간의 스냅샷이다. 조회한 직후 트랜잭션이 끝날 수도 있으므로 여러 뷰의 결과가 항상 완벽하게 맞아떨어진다고 기대해서는 안 된다. 재현하기 어려운 간헐적 대기라면 애플리케이션의 트랜잭션 시작·종료 시점과 오류 코드를 함께 남겨야 한다.

## 2단계: 무엇을 잠갔는지 인덱스 기준으로 본다

InnoDB의 "행 잠금"은 논리적인 행 이름보다 스캔한 인덱스 레코드에 가깝다. locking read, UPDATE, DELETE는 문장을 처리하며 스캔한 인덱스 레코드에 일반적으로 잠금을 설정한다.

예를 들어 한 행을 바꾸는 조건이라도 검색 컬럼에 적절한 인덱스가 없어 전체 테이블을 스캔하면 모든 행이 잠길 수 있다. WHERE 절의 최종 결과 행 수와 잠금을 얻기 위해 읽은 레코드 수는 같은 개념이 아니다.

그래서 잠금 대기에서는 SQL 텍스트만 보지 않고 실행 계획을 확인한다.

```sql
EXPLAIN
UPDATE accounts
SET status = 'ACTIVE'
WHERE email = 'reader@example.com';
```

`key`, `type`, 예상 스캔 행 수를 보고, 실제 대기 정보의 `locked_index`와 연결한다. 보조 인덱스를 통해 변경 대상을 찾으면 해당 보조 인덱스 레코드뿐 아니라 대응하는 clustered index 레코드에도 잠금이 설정될 수 있다.

더 자세한 잠금 모드와 상태가 필요하면 Performance Schema를 본다.

```sql
SELECT
    engine_transaction_id,
    thread_id,
    object_schema,
    object_name,
    index_name,
    lock_type,
    lock_mode,
    lock_status,
    lock_data
FROM performance_schema.data_locks;
```

`data_lock_waits`는 요청한 잠금과 그것을 막는 보유 잠금의 관계를 제공한다.

```sql
SELECT *
FROM performance_schema.data_lock_waits;
```

MySQL 8.x에서는 `performance_schema.data_locks`, `data_lock_waits` 또는 이를 읽기 쉽게 정리한 `sys.innodb_lock_waits`를 사용한다.[^legacy-lock-views]

운영 결과를 공유할 때는 `LOCK_DATA`와 쿼리에 실제 키 값이나 업무 데이터가 들어갈 수 있다는 점도 주의해야 한다.

범위 잠금은 SQL 모양만 보고 단정하지 않는다. `REPEATABLE READ`의 범위 인덱스 스캔에서는 next-key lock이 사용될 수 있고, 유니크 인덱스의 완전한 동등 조건은 보통 해당 레코드만 잠근다.

`READ COMMITTED`에서는 검색과 인덱스 스캔의 gap locking이 대부분 비활성화되지만 외래 키와 중복 키 검사 같은 예외가 남는다. 진단할 때는 다음 네 가지를 한 묶음으로 기록한다.

- 격리 수준
- 실제 선택된 인덱스
- 유니크 동등 조건인지 범위 스캔인지
- `data_locks`에서 관찰한 `lock_mode`와 `lock_data`

## 3단계: 쿼리 시간이 아니라 트랜잭션 시간을 본다

UPDATE가 빨리 끝나도 그 문장이 얻은 잠금은 일반적으로 COMMIT이나 ROLLBACK까지 유지된다. 트랜잭션 안의 외부 호출이나 긴 계산이 이어지면 잠금도 그 시간만큼 길어진다.

따라서 SQL 한 문장보다 첫 DML부터 COMMIT까지 걸린 시간을 본다. `INNODB_TRX.trx_started`와 애플리케이션 로그를 맞춰 열린 트랜잭션, 예외를 잡고 종료하지 않은 경로, 불필요하게 큰 변경 단위를 찾는다.

외부 호출을 무조건 트랜잭션 밖으로 옮기는 것도 답은 아니다. DB 변경과 외부 작업 사이에 필요한 일관성을 먼저 정한다. 트랜잭션 안에는 함께 성공해야 할 일만 남기거나, DB 변경과 발행할 메시지를 함께 기록한 뒤 전달하는 방식을 검토한다.

## 4단계: timeout과 deadlock을 같은 실패로 처리하지 않는다

잠금 대기가 길어져 `innodb_lock_wait_timeout`을 넘으면 다음 오류가 발생한다.

```text
ERROR 1205 (HY000):
Lock wait timeout exceeded; try restarting transaction
```

**MySQL 8.4의 기본 설정에서 lock wait timeout은 대기하던 문장만 롤백하지만, deadlock으로 선택된 트랜잭션은 전체가 롤백된다.**

timeout이 나도 트랜잭션 전체가 자동으로 끝났다고 가정하면 안 된다. 단, `innodb_rollback_on_timeout=ON`으로 시작한 서버는 timeout 때 트랜잭션 전체를 롤백한다. 실제 설정과 프레임워크의 rollback 규칙을 확인하고, 불확실한 상태로 다음 문장을 계속 실행하지 않도록 트랜잭션을 명시적으로 종료하는 편이 안전하다.

deadlock은 다르다.

```text
ERROR 1213 (40001):
Deadlock found when trying to get lock; try restarting transaction
```

InnoDB가 순환 대기를 감지하면 한 트랜잭션을 골라 전체를 롤백한다. 가장 최근 deadlock은 다음 명령으로 확인한다.

```sql
SHOW ENGINE INNODB STATUS\G
```

`LATEST DETECTED DEADLOCK`에서 각 트랜잭션이 보유한 잠금, 기다린 인덱스와 실행 문장을 본다. 재시도가 필요하다면 실패한 문장 하나가 아니라 트랜잭션 전체를 처음부터 실행해야 한다.

외부 호출이나 메시지 발행처럼 이미 나간 작업이 있다면 재시도 전에 멱등성도 갖춰야 한다. 접근 순서를 통일하는 방법은 앞선 deadlock 글에서 다뤘으므로 여기서는 진단 결과를 읽는 데만 집중한다.

## 먼저 하지 않는 대응

잠금 대기를 발견하면 설정부터 바꾸고 싶어진다. 다음 대응은 원인을 확인한 뒤에 판단한다.

### timeout을 늘린다

일시적인 긴 트랜잭션을 버틸 수는 있지만 잠금 범위나 트랜잭션 경계가 잘못됐다면 대기 시간만 늘린다. 요청 스레드와 커넥션이 더 오래 묶일 수도 있다.

### 격리 수준을 낮춘다

`READ COMMITTED`가 일부 gap locking을 줄일 수는 있다. 하지만 같은 레코드를 수정하는 X-lock 충돌은 사라지지 않으며, 읽기 일관성의 의미가 달라진다. 실행 계획과 실제 lock mode를 확인하기 전에 적용할 만능 해법이 아니다.

### SELECT FOR UPDATE를 추가한다

경합을 없애는 문장이 아니라 경합 시 기다리게 만드는 locking read다. 최신 값을 잠근 뒤 애플리케이션에서 판단해야 할 때는 맞지만, 단순한 상태 변경이라면 한 UPDATE에서 조건 확인과 변경을 함께 처리하거나 유니크 제약을 쓰는 편이 낫다.

### blocker를 바로 종료한다

긴급 복구로 세션 종료가 필요할 수는 있다. 그래도 먼저 blocker가 어떤 작업을 수행 중인지, 롤백 비용이 얼마나 되는지, 자동 재시도로 같은 트랜잭션이 다시 시작되는지 확인해야 한다.

## 내가 남기는 진단 순서

잠금 문제를 다시 만났을 때는 다음 순서를 따른다.

1. `sys.innodb_lock_waits`에서 waiter와 blocker를 연결한다.
2. `INNODB_TRX`에서 blocker의 시작 시각과 열린 트랜잭션을 확인한다.
3. `locked_index`와 실행 계획을 비교해 실제 스캔 범위를 찾는다.
4. 필요하면 `data_locks`와 `data_lock_waits`로 lock mode와 대기 관계를 좁힌다.
5. 1205 timeout인지 1213 deadlock인지 구분한다.
6. 트랜잭션 경계, 인덱스, 접근 순서 순으로 원인을 고친다.

**누가 누구를 기다리는지, 왜 그 인덱스 범위를 잠갔는지, 잠금을 언제부터 들고 있는지를 연결해야 원인을 고칠 수 있다.** 이 세 가지를 확인한 뒤에 timeout이나 격리 수준 변경을 판단한다.

[^legacy-lock-views]: 예전 가이드의 `INFORMATION_SCHEMA.INNODB_LOCKS`와 `INNODB_LOCK_WAITS`는 MySQL 8.0.1에서 제거됐다. `data_locks`는 대기 중인 잠금뿐 아니라 현재 보유한 잠금도 보여주므로 이전 뷰와 결과가 같지는 않다.
