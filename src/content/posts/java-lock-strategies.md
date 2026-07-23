---
title: "Java count++ 경쟁 조건과 synchronized·Lock·AtomicInteger 선택"
slug: "java-lock-strategies"
description: "count++의 lost update를 출발점으로 synchronized, ReentrantLock, AtomicInteger와 CAS의 선택 기준을 비교한다."
kind: "tech"
publishedAt: "2026-04-03"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["java", "concurrency", "lock", "cas"]
series:
  slug: "concurrency-locking"
  title: "동시성과 잠금"
  order: 1
relatedPosts: []
references:
  - title: "OpenJDK — AtomicInteger source"
    url: "https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/concurrent/atomic/AtomicInteger.java"
  - title: "Java SE 21 API — AtomicInteger"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicInteger.html"
  - title: "Java SE 21 API — ReentrantLock"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html"
  - title: "JEP 193 — Variable Handles"
    url: "https://openjdk.org/jeps/193"
---

멀티스레드 테스트에서 공유 카운터의 최종값이 실행할 때마다 달라졌다.

```java
private int count = 0;

public void increment() {
    count++;
}
```

여러 스레드가 같은 횟수만큼 호출했으니 결과도 정해져 있어야 한다고 생각했다. 하지만 기대값보다 작은 숫자가 나왔다. `count++`가 한 줄이라서 한 번에 실행될 것처럼 보인 게 함정이었다.

## count++은 세 단계다

개념적으로는 읽기, 계산, 쓰기로 나뉜다.

```text
1. READ   count 값을 읽는다
2. MODIFY 1을 더한다
3. WRITE  결과를 저장한다
```

두 스레드가 같은 값을 읽으면 한 번의 증가가 사라진다.

```text
Thread A                    Thread B
────────                    ────────
READ 42
                            READ 42
MODIFY 43
                            MODIFY 43
WRITE 43
                            WRITE 43
```

두 번 증가했지만 최종값은 44가 아니라 43이다. 이 lost update를 막으려면 read-modify-write 전체를 하나의 원자 연산처럼 만들어야 한다.

간단한 재현 테스트도 결과가 매번 달랐다.

```java
ExecutorService executor = Executors.newFixedThreadPool(16);

for (int i = 0; i < 16; i++) {
    executor.submit(() -> {
        for (int j = 0; j < 10_000; j++) {
            increment();
        }
    });
}

executor.shutdown();
executor.awaitTermination(10, TimeUnit.SECONDS);

System.out.println(count); // 기대한 160,000보다 작고 실행마다 달라짐
```

숫자 자체보다 중요한 것은 재현 조건이다. 여러 스레드가 동기화 없이 같은 mutable state에 read-modify-write를 수행했다.

## 먼저 잠그는 방법: synchronized

가장 직접적인 수정은 임계 영역에 한 스레드만 들어오게 하는 것이다.

```java
private int count = 0;

public synchronized void increment() {
    count++;
}
```

인스턴스 `synchronized` 메서드는 `this`의 모니터를 잠근다.

```java
public void increment() {
    synchronized (this) {
        count++;
    }
}
```

두 코드는 같은 잠금 대상을 사용한다. 정적 synchronized 메서드는 인스턴스가 아니라 해당 `Class` 객체의 모니터를 잠근다.

`synchronized`가 적용되면 뒤의 스레드는 모니터를 얻을 때까지 대기한다.

```text
Thread A                    Thread B
────────                    ────────
monitor 획득
READ 42
MODIFY 43
WRITE 43
monitor 해제
                            monitor 획득
                            READ 43
                            MODIFY 44
                            WRITE 44
                            monitor 해제
```

코드가 짧고 블록을 벗어나면 자동으로 잠금이 풀리는 것이 장점이다. 단순한 임계 영역이라면 우선 `synchronized`로 충분한지부터 본다.

## 잠금을 기다릴지 선택하는 ReentrantLock

`ReentrantLock`도 한 번에 한 스레드만 임계 영역에 들어오게 한다.

```java
private final ReentrantLock lock = new ReentrantLock();
private int count = 0;

public void increment() {
    lock.lock();
    try {
        count++;
    } finally {
        lock.unlock();
    }
}
```

수동 해제가 필요하므로 `finally`를 빠뜨리면 안 된다. 코드가 더 길어지는 대신 `synchronized`에 없는 제어를 제공한다.

| 기능 | `synchronized` | `ReentrantLock` |
|---|---|---|
| 블록 종료 시 자동 해제 | 가능 | 불가 |
| 제한 시간 뒤 포기 | 불가 | `tryLock(timeout)` |
| 공정성 정책 | 지정 불가 | 생성자에서 지정 |
| 여러 대기 조건 | monitor wait set 하나 | 여러 `Condition` |
| 대기 중 인터럽트 | 제한적 | `lockInterruptibly()` 등 |

예를 들어 일정 시간 안에 락을 못 얻으면 다른 경로로 보낼 수 있다.

```java
public boolean tryIncrement() throws InterruptedException {
    if (!lock.tryLock(100, TimeUnit.MILLISECONDS)) {
        return false;
    }

    try {
        count++;
        return true;
    } finally {
        lock.unlock();
    }
}
```

timeout, interruptible acquisition, 여러 condition이 필요할 때는 긴 코드가 지불할 만한 비용이 된다. 그런 요구가 없다면 `synchronized`가 의도를 더 간단히 드러낸다.

## 먼저 실행하고 충돌하면 다시 하는 AtomicInteger

카운터 하나 때문에 매번 스레드를 막을 필요가 있을까 싶었다. `AtomicInteger`는 잠금을 소유하는 대신 원자적 갱신 연산을 사용한다.

```java
private final AtomicInteger count = new AtomicInteger();

public int increment() {
    return count.incrementAndGet();
}
```

원자 변수는 명시적인 `Lock`을 소유하지 않는다는 점에서 흔히 낙관적 접근에 비유한다. 다만 아래 CAS 반복문은 동작을 이해하기 위한 개념 모델이지, 모든 JVM에서 `incrementAndGet()`이 그대로 이 Java 코드를 실행한다는 뜻은 아니다.

## CAS가 충돌을 알아채는 방법

CAS(compare-and-set)는 현재 값이 기대값과 같을 때만 새 값으로 바꾼다. 비교와 변경은 하나의 원자 연산이다.

```java
int increment() {
    while (true) {
        int current = get();
        int next = current + 1;
        if (compareAndSet(current, next)) {
            return next;
        }
    }
}
```

두 스레드가 동시에 42를 읽어도 한 스레드만 `CAS(42, 43)`에 성공한다.

```text
Thread A                         Thread B
────────                         ────────
READ 42
                                 READ 42
CAS(42, 43) 성공
                                 CAS(42, 43) 실패
                                 READ 43
                                 CAS(43, 44) 성공
```

락을 기다리며 block하지 않지만 충돌한 스레드는 연산을 반복한다. 경합이 심하면 재시도에 CPU를 계속 쓸 수 있다. 구체적인 내부 구현은 JDK에 따라 달라질 수 있다.[^atomic-implementation]

## 원자 변수 하나로 전체 불변식을 지킬 수는 없다

CAS가 안전하게 만드는 범위는 그 원자 연산이 다루는 상태다.

```java
AtomicInteger available = new AtomicInteger(10);
List<History> histories = new ArrayList<>();

void reserve() {
    available.decrementAndGet();
    histories.add(new History());
}
```

`available`의 감소는 원자적이지만 이력 추가와 합쳐진 하나의 불변식은 아니다. 이력 추가가 실패하거나 리스트가 여러 스레드에서 깨질 수 있다. "수량 감소와 이력 추가가 함께 성공해야 한다"면 하나의 AtomicInteger로 해결할 문제가 아니다.

여러 필드를 함께 검사하고 바꾸려면 하나의 임계 영역에서 처리하거나, 상태를 불변 객체 하나로 묶어 CAS해야 한다.

## 경합 빈도만으로 선택하면 충분할까

출발점은 경합 빈도지만 실제 판단은 작업 크기와 실패 비용도 포함한다.

| 상황 | 먼저 검토할 도구 |
|---|---|
| 단순 카운터와 플래그 | `AtomicInteger`, `AtomicBoolean` |
| 짧은 임계 영역과 여러 필드 | `synchronized` |
| timeout·공정성·여러 조건 필요 | `ReentrantLock` |
| 읽기가 많고 쓰기가 드문 복합 상태 | 불변 스냅샷, read-write 계열 잠금 검토 |

CAS는 경합이 낮고 연산이 작은 경우 잘 맞는다. 경합이 높아 실패가 반복되거나 한 번 갱신하기 위한 계산이 비싸면 재시도 비용이 커진다. 잠금은 대기를 만들지만 한 스레드가 임계 영역을 끝내도록 보장하기 쉽다.

**여러 값이 함께 바뀌어야 한다면 `AtomicInteger` 하나로는 부족하다. 성능보다 먼저 원자적으로 묶어야 할 상태의 범위를 정해야 한다.**

## 정리

`count++`은 read-modify-write라서 원자적이지 않다. 단순한 임계 영역은 `synchronized`, 대기 방식을 제어해야 하면 `ReentrantLock`, 단일 값의 원자 갱신에는 원자 변수가 맞는다. **선택 기준은 충돌했을 때 누가 기다리고 다시 계산할지, 그리고 어디까지를 한 번에 바꿔야 하는지다.**

[^atomic-implementation]: Java 9의 `VarHandle`은 메모리 접근과 원자 연산을 표현하는 표준 API다. 다만 OpenJDK 21의 `AtomicInteger.incrementAndGet()`은 내부적으로 `jdk.internal.misc.Unsafe#getAndAddInt`를 사용하고, Javadoc은 메모리 효과를 `VarHandle.getAndAdd()` 기준으로 설명한다. 공개 명세와 내부 구현은 구분해야 한다.
