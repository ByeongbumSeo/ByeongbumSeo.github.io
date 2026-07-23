---
title: "Java와 InnoDB 데드락에서 잠금 순서를 통일해야 하는 이유"
slug: "java-db-deadlock"
description: "Java 스레드와 InnoDB 트랜잭션에서 잠금 순서가 엇갈릴 때 생기는 deadlock과 예방·복구 방법을 비교한다."
kind: "tech"
publishedAt: "2026-04-03"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["java", "mysql", "deadlock", "concurrency"]
series:
  slug: "concurrency-locking"
  title: "동시성과 잠금"
  order: 2
relatedPosts: []
references:
  - title: "System Deadlocks — Coffman, Elphick, Shoshani"
    url: "https://dl.acm.org/doi/10.1145/356586.356588"
  - title: "MySQL 8.0 Reference Manual — Deadlock Detection"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlock-detection.html"
  - title: "MySQL 8.0 Reference Manual — Deadlocks in InnoDB"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks.html"
  - title: "MySQL Server Blog — InnoDB Data Locking Part 3: Deadlocks"
    url: "https://dev.mysql.com/blog-archive/innodb-data-locking-part-3-deadlocks/"
  - title: "Java SE 21 API — ThreadMXBean"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.management/java/lang/management/ThreadMXBean.html"
  - title: "Java SE 21 Tools — jstack"
    url: "https://docs.oracle.com/en/java/javase/21/docs/specs/man/jstack.html"
---

여러 잠금을 쓰는 코드는 획득 순서까지 정해야 한다. 경로마다 순서가 다르면 두 작업이 서로를 계속 기다릴 수 있다.

```text
Thread A                    Thread B
────────                    ────────
Lock X 획득                 Lock Y 획득
Lock Y 요청 → 대기          Lock X 요청 → 대기
```

A는 B가 가진 Y를 기다리고, B는 A가 가진 X를 기다린다. 둘 다 기다리는 동안 자신이 가진 락을 놓지 않는다. 이 순환 대기가 deadlock이다.

Java 모니터와 DB 행 잠금은 도구는 다르지만 deadlock을 만드는 구조는 같다. 발견한 뒤의 복구 방식만 다르다.

## 네 조건이 모두 모이면 교착이 생긴다

Deadlock이 생기려면 다음 네 조건이 동시에 성립해야 한다.[^coffman]

| 조건 | 의미 |
|---|---|
| 상호 배제 | 자원을 한 작업만 사용할 수 있다 |
| 점유 대기 | 이미 자원을 가진 채 다른 자원을 기다린다 |
| 비선점 | 다른 작업의 자원을 강제로 빼앗을 수 없다 |
| 순환 대기 | 작업들이 원형으로 서로의 자원을 기다린다 |

실무에서 가장 단순한 예방책은 여러 자원의 획득 순서를 통일해 순환 대기를 없애는 것이다.

## Java에서 역순으로 락을 잡아봤다

```java
private final Object lockA = new Object();
private final Object lockB = new Object();

public void first() throws InterruptedException {
    synchronized (lockA) {
        Thread.sleep(100);
        synchronized (lockB) {
            System.out.println("first done");
        }
    }
}

public void second() throws InterruptedException {
    synchronized (lockB) {
        Thread.sleep(100);
        synchronized (lockA) {
            System.out.println("second done");
        }
    }
}
```

`first()`는 A 다음 B, `second()`는 B 다음 A로 잡는다. 두 스레드의 타이밍이 겹치면 다음 상태가 된다.

```text
Thread 1                         Thread 2
────────                         ────────
lockA 획득
                                 lockB 획득
lockB 요청 → 대기
                                 lockA 요청 → 대기
```

`synchronized`는 락을 얻을 때까지 기다리며, 기다리는 동안 이미 가진 모니터를 자동으로 놓아주지 않는다. 따라서 외부 개입이 없으면 두 스레드는 계속 멈춰 있다.

## 락 순서를 통일하면 순환이 사라진다

두 메서드가 모두 A 다음 B 순서로 획득하게 바꿨다.

```java
public void first() {
    synchronized (lockA) {
        synchronized (lockB) {
            System.out.println("first done");
        }
    }
}

public void second() {
    synchronized (lockA) {
        synchronized (lockB) {
            System.out.println("second done");
        }
    }
}
```

두 번째 스레드는 A 앞에서 기다릴 수 있지만 B를 가진 채 기다리지는 않는다. 대기는 있어도 순환은 없다.

객체를 동적으로 여러 개 잠가야 한다면 안정적인 정렬 기준이 필요하다. 예를 들어 두 계정 객체를 잠글 때 작은 ID부터 잡는 규칙을 모든 경로에서 사용한다. ID가 같거나 비교 기준이 충돌하는 예외까지 처리해야 규칙이 완전하다.

## 순서를 고정할 수 없다면 기다림을 포기한다

`ReentrantLock.tryLock()`은 제한 시간 안에 락을 얻지 못하면 실패를 돌려준다. 두 번째 락을 못 얻었을 때 첫 번째 락도 놓으면 "점유한 채 영원히 대기"하는 조건을 깨뜨릴 수 있다.

```java
public boolean tryWork() throws InterruptedException {
    if (!lockA.tryLock(100, TimeUnit.MILLISECONDS)) {
        return false;
    }

    try {
        if (!lockB.tryLock(100, TimeUnit.MILLISECONDS)) {
            return false;
        }

        try {
            doWork();
            return true;
        } finally {
            lockB.unlock();
        }
    } finally {
        lockA.unlock();
    }
}
```

재시도한다면 같은 타이밍에 다시 충돌하지 않도록 횟수를 제한하고 지연 시간을 둬야 한다. 무한 재시도는 작업을 끝내지 못한 채 CPU만 쓰는 반복으로 이어질 수 있다.

## Java deadlock은 어떻게 찾나

프로세스가 살아 있는데 특정 작업만 멈췄고 관련 로그도 더 나오지 않는다면 thread dump를 확인한다.

```bash
jstack <pid>
```

JVM은 dump를 만드는 시점에 monitor deadlock을 탐지해 어떤 스레드가 무엇을 보유하고 기다리는지 보여준다.

```text
Found one Java-level deadlock:
"worker-1":
  waiting to lock object B
  which is held by "worker-2"
"worker-2":
  waiting to lock object A
  which is held by "worker-1"
```

애플리케이션 안에서도 deadlock에 빠진 스레드를 찾을 수 있다.[^thread-mxbean] 하지만 탐지는 복구와 다르다. JVM이 임의의 스레드를 죽이거나 이미 수행한 상태 변경을 되돌려주지는 않는다.

## DB에서도 같은 순환이 생긴다

두 계정 사이의 이동을 예로 들면 구조가 그대로 보인다.

```text
트랜잭션 A: 1 → 2               트랜잭션 B: 2 → 1
────────────────               ────────────────
계정 1 UPDATE, X-lock
                                 계정 2 UPDATE, X-lock
계정 2 UPDATE → 대기
                                 계정 1 UPDATE → 대기
```

공개용 예시 SQL은 다음과 같다.

```sql
-- 트랜잭션 A
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- 트랜잭션 B
UPDATE accounts SET balance = balance - 200 WHERE id = 2;
UPDATE accounts SET balance = balance + 200 WHERE id = 1;
```

각 트랜잭션이 첫 번째 행의 X-lock을 가진 채 상대 행을 기다리므로 순환 대기가 완성된다.

## InnoDB는 한 트랜잭션을 희생시킨다

`innodb_deadlock_detect`가 활성화되어 있으면 InnoDB는 잠금 대기 관계에서 순환을 찾고, 한 트랜잭션을 골라 롤백한다.

```text
ERROR 1213 (40001):
Deadlock found when trying to get lock; try restarting transaction
```

**InnoDB가 한 트랜잭션을 자동으로 롤백해도 요청이 성공한 것은 아니므로, 호출자는 트랜잭션 전체를 안전하게 재시도해야 한다.**

재시도에는 몇 가지 조건이 붙는다.

- 트랜잭션 전체를 처음부터 다시 실행해야 한다.
- 외부 API 호출이나 메시지 발행 같은 부수 효과가 이미 나갔다면 무작정 재시도하면 안 된다.
- 횟수를 제한하고 무작위 지연을 둔다.
- 먼저 잠금 순서를 고쳐 재발 확률을 줄인다.

deadlock detection을 끈 환경에서는 즉시 순환을 끊지 못하고 lock wait timeout까지 기다릴 수 있다. 감지에도 비용이 있으므로 고경합 환경에서는 설정과 증상을 함께 봐야 한다.

## DB도 접근 순서를 통일한다

두 트랜잭션 모두 작은 계정 ID부터 잠그면 순환을 만들 수 없다. 애플리케이션에서 두 ID를 먼저 정렬하고, 기본 키 단건 조회를 같은 순서로 실행하면 잠금 획득 순서가 코드에 드러난다.

```sql
-- 애플리케이션에서 먼저 계산
-- firstId = min(fromId, toId), secondId = max(fromId, toId)
SELECT id FROM accounts WHERE id = :firstId FOR UPDATE;
SELECT id FROM accounts WHERE id = :secondId FOR UPDATE;

-- 잠금을 확보한 뒤 변경
UPDATE accounts SET balance = balance - :amount WHERE id = :fromId;
UPDATE accounts SET balance = balance + :amount WHERE id = :toId;
```

같은 계정끼리의 요청은 별도로 처리하고, 두 단건 조회가 실제로 기본 키 인덱스를 쓰는지도 확인해야 한다. `ORDER BY`를 붙인 한 문장의 결과 순서만으로 잠금 획득 순서까지 증명되지는 않는다. 실행 계획에 따라 정렬이 레코드를 읽고 잠근 뒤 수행될 수도 있기 때문이다.

애플리케이션의 분기마다 SQL 순서가 달라지지 않는지, 배치와 API가 같은 테이블을 다른 순서로 갱신하지 않는지도 같이 봐야 한다. 한 메서드만 정리해도 다른 경로가 역순이면 교착은 남는다.

## InnoDB deadlock 기록을 확인한다

최근 탐지된 교착은 다음 명령으로 확인할 수 있다.

```sql
SHOW ENGINE INNODB STATUS;
```

`LATEST DETECTED DEADLOCK` 섹션에는 각 트랜잭션이 보유한 잠금, 기다린 인덱스 레코드, 롤백된 트랜잭션이 나온다. 여기서 중요한 것은 SQL 문장만 읽고 추측하지 않는 것이다. 실행 계획과 실제 잠금 인덱스, 트랜잭션 안에서 앞서 실행한 문장까지 봐야 획득 순서를 복원할 수 있다.

## Java와 DB는 어디가 다른가

| 구분 | Java | InnoDB |
|---|---|---|
| 경쟁 단위 | 스레드 | 트랜잭션 |
| 잠금 대상 | 모니터, `Lock` 객체 | 인덱스 레코드와 범위 |
| 감지 | thread dump 또는 `ThreadMXBean` | 대기 그래프를 감지 |
| 자동 복구 | 없음 | 선택된 트랜잭션 롤백 |
| 호출자 책임 | 원인 제거 | 원인 제거 + 롤백 재시도 정책 |

여러 자원을 잠그면서 획득 순서를 일관되게 정하지 않으면 Java와 DB 모두 순환 대기가 생긴다. DB가 자동 롤백하더라도 사용자는 실패를 보고 재시도 비용도 생긴다.

**잠금 대상을 정렬하고 모든 경로에서 같은 순서로 접근하는 것이 첫 번째 예방책이다.** timeout과 재시도는 그 규칙을 지키고도 남는 경쟁을 다루는 다음 단계다.

[^coffman]: 이 네 조건은 Coffman, Elphick, Shoshani가 1971년 논문에서 정리한 deadlock의 필요조건이다.

[^thread-mxbean]: Java에서는 `ThreadMXBean.findDeadlockedThreads()`로 모니터와 ownable synchronizer의 deadlock을 찾을 수 있다.
