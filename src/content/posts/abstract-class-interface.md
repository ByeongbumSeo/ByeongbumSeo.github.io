---
title: "추상 클래스와 인터페이스"
slug: "abstract-class-interface"
description: "Java에서 추상 클래스와 인터페이스를 언제 어떻게 구분해서 쓰는지 정리한다."
kind: "tech"
category: "java"
publishedAt: "2024-01-31"
updatedAt: "2026-07-08"
draft: false
deprecated: false
outdated: false
tags: ["java", "oop"]
relatedPosts: ["strategy-pattern"]
references:
  - title: "Oracle Java Tutorial - Abstract Methods and Classes"
    url: "https://docs.oracle.com/javase/tutorial/java/IandI/abstract.html"
  - title: "Java Language Specification 21 - Classes"
    url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html"
  - title: "Java Language Specification 21 - Interfaces"
    url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-9.html"
  - title: "JDK 21 API - AbstractMap"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/AbstractMap.html"
  - title: "JDK 21 API - Map"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Map.html"
  - title: "JDK 21 API - Runnable"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Runnable.html"
---

## 한 줄 정리

추상 클래스와 인터페이스는 둘 다 "아직 완성되지 않은 타입"을 표현할 수 있다.

하지만 실무에서의 선택 기준은 다르다.

- **추상 클래스**는 같은 계열의 클래스들이 공유할 상태와 기본 구현이 있을 때 쓴다.
- **인터페이스**는 어떤 객체가 제공해야 하는 동작의 약속을 타입으로 표현할 때 쓴다.

예를 들어 결제 시스템에서 `PaymentProcessor`는 인터페이스로 두는 편이 자연스럽다. 카드 결제, 계좌 이체, 간편 결제는 서로 같은 부모 클래스를 가져야 하는 관계라기보다 "결제할 수 있다"는 동작을 공유하는 구현체들이기 때문이다.

반대로 여러 결제 구현체가 공통으로 쓰는 `merchantId`, `validateAmount()`, `recordHistory()` 같은 상태와 흐름이 있다면 그 부분은 추상 클래스로 뽑을 수 있다.

## Java 기준 사실 정리

Oracle Java Tutorial은 추상 클래스를 `abstract`로 선언된 클래스라고 설명한다. 추상 클래스는 직접 인스턴스화할 수 없고, 하위 클래스로 확장해서 사용한다. 추상 메서드가 하나라도 있으면 클래스도 `abstract`여야 한다.

```java
abstract class Payment {
    abstract void pay(long amount);
}

// new Payment(); // 컴파일 불가
```

인터페이스의 추상 메서드는 기본적으로 구현체가 반드시 구현해야 하는 동작이다. Java 8 이후 인터페이스에도 `default` 메서드와 `static` 메서드를 둘 수 있고, Java 9 이후에는 `private` 메서드도 둘 수 있다. 그래서 "인터페이스는 무조건 구현이 없는 껍데기"라고 외우면 현재 Java 기준으로는 틀리다.

```java
interface PaymentProcessor {
    void pay(long amount);

    default boolean supportsInstallment() {
        return false;
    }
}
```

다만 인터페이스의 필드는 여전히 인스턴스 상태가 아니다. 인터페이스에 선언한 필드는 암묵적으로 `public static final` 상수다. 구현체마다 달라지는 상태를 인터페이스가 직접 들고 있을 수는 없다.

## 핵심 차이

| 기준 | 추상 클래스 | 인터페이스 |
| --- | --- | --- |
| 선언 | `abstract class` | `interface` |
| 사용 | `extends` | `implements` |
| 다중 사용 | 클래스는 하나만 상속 가능 | 여러 인터페이스 구현 가능 |
| 인스턴스 상태 | 인스턴스 필드 가능 | 인스턴스 필드 불가 |
| 생성자 | 가질 수 있음 | 가질 수 없음 |
| 구현 코드 | 일반 메서드, 추상 메서드 모두 가능 | 추상 메서드, default/static/private 메서드 가능 |
| 접근 제어 | `public`, `protected`, package-private, `private` 등 클래스 규칙 사용 | 일반적인 인터페이스 메서드는 기본적으로 `public` 성격 |
| 실무 의미 | 같은 계열의 공통 골격 제공 | 구현체가 지켜야 할 동작 계약 제공 |

## 추상 클래스가 어울리는 경우

추상 클래스는 "같은 종류"의 객체들이 공통 상태와 공통 로직을 공유할 때 적합하다.

예를 들어 알림 발송 기능을 만든다고 해보자. 이메일, SMS, 푸시 알림은 모두 발송 전 검증, 발송 이력 기록, 실패 처리 같은 공통 흐름을 가질 수 있다. 이때 공통 흐름은 부모 클래스가 잡고, 실제 발송 방식만 하위 클래스에 맡길 수 있다.

```java
abstract class NotificationSender {
    private final NotificationHistoryRepository historyRepository;

    protected NotificationSender(NotificationHistoryRepository historyRepository) {
        this.historyRepository = historyRepository;
    }

    public final void send(NotificationMessage message) {
        validate(message);
        doSend(message);
        historyRepository.save(message);
    }

    protected void validate(NotificationMessage message) {
        if (message.recipient() == null || message.recipient().isBlank()) {
            throw new IllegalArgumentException("recipient is required");
        }
    }

    protected abstract void doSend(NotificationMessage message);
}
```

```java
class EmailSender extends NotificationSender {
    EmailSender(NotificationHistoryRepository historyRepository) {
        super(historyRepository);
    }

    @Override
    protected void doSend(NotificationMessage message) {
        // SMTP, 외부 메일 API 호출 등
    }
}
```

이 예시에서 중요한 점은 `NotificationSender`가 단순히 메서드 이름만 강제하는 것이 아니라는 것이다.

- `historyRepository`라는 상태를 가진다.
- `send()`라는 공통 처리 흐름을 제공한다.
- `validate()`라는 기본 구현을 제공한다.
- `doSend()`만 하위 클래스에 위임한다.

이런 구조는 템플릿 메서드 패턴과도 잘 맞는다. 공통 흐름은 상위 클래스에 두고, 바뀌는 부분만 하위 클래스가 구현한다.

JDK에도 이런 예가 있다. `java.util.AbstractMap`은 `Map` 인터페이스의 골격 구현을 제공한다. JDK 문서는 `AbstractMap`이 `Map` 인터페이스를 구현하는 데 필요한 노력을 줄이기 위한 skeletal implementation이라고 설명한다. `HashMap`, `TreeMap`, `ConcurrentHashMap` 같은 클래스들이 `AbstractMap` 계열의 구현을 활용한다.

## 인터페이스가 어울리는 경우

인터페이스는 "이 객체가 무엇을 할 수 있는가"를 표현할 때 적합하다.

실무 예시로 주문 생성 후 여러 후속 작업을 실행한다고 해보자.

- 쿠폰 사용 처리
- 포인트 적립
- 알림 발송
- 검색 색인 요청

이 작업들은 같은 부모 클래스를 가져야 할 정도로 같은 종류의 객체는 아니다. 하지만 모두 "주문 생성 이벤트를 처리한다"는 동작을 제공할 수 있다.

```java
interface OrderCreatedHandler {
    void handle(OrderCreatedEvent event);
}
```

```java
class CouponUseHandler implements OrderCreatedHandler {
    @Override
    public void handle(OrderCreatedEvent event) {
        // 쿠폰 사용 처리
    }
}

class PointSaveHandler implements OrderCreatedHandler {
    @Override
    public void handle(OrderCreatedEvent event) {
        // 포인트 적립
    }
}

class OrderNotificationHandler implements OrderCreatedHandler {
    @Override
    public void handle(OrderCreatedEvent event) {
        // 알림 발송
    }
}
```

서비스는 구체 클래스를 몰라도 된다.

```java
class OrderService {
    private final List<OrderCreatedHandler> handlers;

    OrderService(List<OrderCreatedHandler> handlers) {
        this.handlers = handlers;
    }

    public void createOrder(CreateOrderCommand command) {
        Order order = save(command);
        OrderCreatedEvent event = OrderCreatedEvent.from(order);

        for (OrderCreatedHandler handler : handlers) {
            handler.handle(event);
        }
    }
}
```

이 구조의 장점은 새 후속 작업이 생겨도 `OrderService`의 핵심 흐름을 크게 건드리지 않아도 된다는 점이다. 새로운 구현체가 `OrderCreatedHandler`를 구현하면 된다.

이런 방식은 Spring을 쓰는 백엔드 코드에서도 자주 나온다. `PaymentClient`, `MessageSender`, `OrderValidator`, `EventHandler` 같은 이름의 인터페이스를 두고, 실제 구현은 `KakaoPayClient`, `NaverPayClient`, `EmailMessageSender`, `SmsMessageSender`처럼 나누는 식이다.

## Java 표준 라이브러리 예시

`Runnable`은 인터페이스의 대표적인 예다. JDK 문서에서 `Runnable`은 값을 반환하지 않는 작업을 표현하며, 함수형 인터페이스라서 람다식이나 메서드 참조의 대상이 될 수 있다고 설명한다.

```java
Runnable job = () -> System.out.println("run background job");
new Thread(job).start();
```

여기서 중요한 것은 `Thread`가 `Runnable`의 구체 클래스를 몰라도 된다는 점이다. `Thread`는 `run()`이라는 동작만 알면 된다.

`Map`도 인터페이스다. `HashMap`, `TreeMap`, `LinkedHashMap`은 내부 구조가 다르지만 모두 `Map`으로 다룰 수 있다.

```java
Map<String, Integer> scores = new HashMap<>();
scores.put("kim", 10);

Map<String, Integer> sortedScores = new TreeMap<>();
sortedScores.put("kim", 10);
```

반면 `AbstractMap`은 추상 클래스다. `Map`이라는 동작 계약을 구현하기 위한 공통 골격을 제공한다. 그래서 JDK 안에서도 인터페이스와 추상 클래스는 경쟁 관계가 아니라 함께 쓰인다.

```text
Map: 무엇을 할 수 있어야 하는가
AbstractMap: Map 구현체들이 공유할 수 있는 기본 구현
HashMap: 실제 동작하는 구체 구현
```

## default 메서드가 있어도 인터페이스와 추상 클래스는 다르다

Java 8 이후 인터페이스에 `default` 메서드가 생기면서 둘의 경계가 흐릿해 보일 수 있다.

예를 들어 `Map` 인터페이스에는 `getOrDefault`, `forEach` 같은 default 메서드가 있다. 기존 `Map` 구현체가 모두 새 메서드를 직접 구현하지 않아도, 인터페이스가 기본 동작을 제공할 수 있게 된 것이다.

```java
Map<String, Integer> scores = new HashMap<>();

int kimScore = scores.getOrDefault("kim", 0);
scores.forEach((name, score) -> System.out.println(name + ": " + score));
```

하지만 default 메서드가 있다고 해서 인터페이스가 추상 클래스를 대체하는 것은 아니다.

인터페이스의 default 메서드는 구현체의 인스턴스 필드에 직접 접근할 수 없다. 반면 추상 클래스는 상태를 가질 수 있고, 그 상태를 사용하는 공통 로직을 제공할 수 있다. 즉 default 메서드는 "인터페이스에 부가 동작을 제공하는 장치"에 가깝고, 추상 클래스는 "공통 상태와 흐름을 가진 부모 타입"에 가깝다.

## 선택 기준

실무에서는 아래 기준으로 고르면 된다.

### 1. 상태와 공통 흐름이 필요하면 추상 클래스

다음 조건이 많을수록 추상 클래스가 어울린다.

- 하위 클래스들이 같은 계열이다.
- 공통 필드가 필요하다.
- 생성자를 통해 공통 의존성을 주입받아야 한다.
- 공통 처리 흐름을 상위 클래스에서 고정하고 싶다.
- 일부 단계만 하위 클래스가 바꾸게 하고 싶다.

예시는 이런 것들이다.

- `NotificationSender`
- `AbstractPaymentProcessor`
- `BaseEntity`
- `AbstractAuditable`
- `AbstractMap`

단, `BaseService`, `BaseController`처럼 너무 넓은 추상 클래스는 조심해야 한다. 상속은 결합이 강하다. 공통 코드 몇 줄을 아끼려고 부모 클래스를 만들면 나중에 모든 하위 클래스가 부모의 변경에 묶일 수 있다.

### 2. 동작 계약만 필요하면 인터페이스

다음 조건이 많을수록 인터페이스가 어울린다.

- 구현체들이 같은 계열일 필요는 없다.
- 호출하는 쪽이 구체 구현을 몰라도 된다.
- 여러 구현체를 쉽게 바꿔 끼우고 싶다.
- 테스트에서 fake/mock 구현으로 대체하고 싶다.
- 한 클래스가 여러 역할을 동시에 표현해야 한다.

예시는 이런 것들이다.

- `PaymentClient`
- `OrderCreatedHandler`
- `MessageSender`
- `Validator<T>`
- `Repository`
- `Runnable`
- `Comparable<T>`
- `Map<K, V>`

백엔드 개발에서는 인터페이스가 특히 자주 쓰인다. 외부 API, 메시지 발송, 파일 저장소, 결제, 알림처럼 바뀔 가능성이 있는 경계에 인터페이스를 두면 서비스 코드는 구체 구현에 덜 묶인다.

## 흔한 오해

### 인터페이스는 다중 상속을 해결하기 위해 생긴 것일까?

반만 맞는 말이다.

Java 클래스는 한 클래스만 상속할 수 있다. JLS는 `Object`를 제외한 각 클래스가 하나의 기존 클래스를 확장한다고 설명한다. 반면 클래스는 여러 인터페이스를 구현할 수 있다. 그래서 인터페이스가 "여러 타입으로 취급될 수 있게 해준다"는 점은 맞다.

하지만 인터페이스의 핵심은 여러 부모의 구현을 물려받는 것이 아니다. 핵심은 타입이 지켜야 할 동작 계약을 분리하는 것이다.

```java
class ReportJob implements Runnable, Comparable<ReportJob> {
    @Override
    public void run() {
        // 리포트 생성
    }

    @Override
    public int compareTo(ReportJob other) {
        return 0;
    }
}
```

이 클래스는 `Runnable`이기도 하고 `Comparable`이기도 하다. 하지만 두 인터페이스가 공통 부모 구현을 물려주는 것은 아니다. 각각 "실행 가능하다", "비교 가능하다"는 역할을 부여한다.

### 추상 클래스는 무조건 인터페이스보다 구식일까?

아니다.

추상 클래스는 여전히 필요하다. `AbstractMap`처럼 JDK에서도 적극적으로 쓰인다. 공통 상태와 골격 구현이 필요한 상황에서는 추상 클래스가 더 명확하다.

다만 새 코드를 작성할 때는 먼저 인터페이스로 계약을 분리할 수 있는지 보고, 공통 상태와 흐름이 실제로 필요할 때 추상 클래스를 도입하는 편이 안전하다.

## 마무리

추상 클래스와 인터페이스를 단순히 "메서드 구현이 있느냐 없느냐"로 구분하면 Java 8 이후부터는 설명이 부족하다.

더 실용적인 기준은 이것이다.

```text
인터페이스: 호출하는 쪽이 기대하는 동작 계약
추상 클래스: 하위 클래스들이 공유하는 상태와 기본 구현
```

같은 계열의 객체들이 공통 상태와 처리 흐름을 공유한다면 추상 클래스가 자연스럽다. 서로 다른 객체들이 같은 역할을 수행해야 한다면 인터페이스가 자연스럽다.

상속은 강한 관계다. 그래서 실무에서는 인터페이스로 역할을 먼저 분리하고, 정말 공유할 상태와 흐름이 생겼을 때 추상 클래스를 선택하는 쪽이 유지보수에 유리하다.
