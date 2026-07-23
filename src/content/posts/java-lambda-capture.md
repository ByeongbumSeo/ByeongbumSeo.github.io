---
title: "Java 람다 캡처의 effectively final과 definite assignment"
slug: "java-lambda-capture"
description: "Java 람다의 지역변수 캡처에서 effectively final과 definite assignment가 왜 별개의 규칙인지 바이트코드와 예제로 확인한다."
kind: "tech"
publishedAt: "2026-03-26"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["java", "lambda", "jvm", "concurrency"]
relatedPosts: []
references:
  - title: "Java Language Specification 4.12.4 — final Variables"
    url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.12.4"
  - title: "Java Language Specification 16 — Definite Assignment"
    url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-16.html"
  - title: "Java Language Specification 17.4 — Memory Model"
    url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html"
  - title: "JEP 126 — Lambda Expressions and Virtual Extension Methods"
    url: "https://openjdk.org/jeps/126"
  - title: "Brian Goetz — Translation of Lambda Expressions"
    url: "https://cr.openjdk.org/~briangoetz/lambda/lambda-translation.html"
---

```java
Member member = new Member();
member = repository.find(member);
items.forEach(item -> use(member.getId()));
```

이 코드를 컴파일하면 익숙한 메시지가 나온다.

```text
local variables referenced from a lambda expression must be final or effectively final
```

그래서 나도 한동안 "람다에서 못 쓰는 변수는 effectively final이 아닌 변수"라고 외웠다. 이 문장은 절반만 맞다. effectively final인데도 람다에서 쓸 수 없는 지역변수가 있기 때문이다.

## effectively final인데 거부되는 코드

```java
String name;
if (condition) {
    name = "Alice";
}
items.forEach(item -> use(name));
```

이번 에러는 다르다.

```text
variable name might not have been initialized
```

`name`은 다시 할당되지 않았다. 명시적으로 `final`을 붙여도 에러는 그대로다.

```java
final String name;
if (condition) {
    name = "Alice";
}
items.forEach(item -> use(name));
```

**문제는 finality가 아니라, 람다에 도달하는 모든 경로에서 값이 할당됐는지다.** `else`를 추가하면 컴파일된다.

```java
String name;
if (condition) {
    name = "Alice";
} else {
    name = "Bob";
}
items.forEach(item -> use(name));
```

## 규칙은 하나가 아니라 둘이다

람다에서 지역변수를 읽으려면 독립된 두 검사를 모두 통과해야 한다.

| 규칙 | 묻는 것 | 대표 에러 |
|---|---|---|
| effectively final | 최초 할당 뒤 다시 바뀌는가 | `must be final or effectively final` |
| definite assignment | 이 지점에 도달할 때 값이 반드시 들어 있는가 | `might not have been initialized` |

첫 번째는 JLS 4.12.4, 두 번째는 JLS 16의 규칙이다. 둘은 서로를 대신하지 않는다.[^java8-history]

선언과 할당을 나눴다는 사실만으로 effectively final이 깨지는 것도 아니다.

```java
String code;
code = "A";
items.forEach(item -> use(code)); // 컴파일 성공
```

initializer가 없는 지역변수는 각 할당 시점에 definitely unassigned이고, 증가·감소나 재할당이 없다면 effectively final일 수 있다. `final` 키워드는 definite assignment를 보장하지 않고, 한 번의 지연 할당은 effectively final을 깨지 않는다.

## 왜 가변 지역변수를 캡처하지 못하게 했나

지역변수는 원래 선언된 메서드를 실행하는 스레드에서만 접근할 수 있다. 다른 스레드가 직접 공유하지 않으므로 가시성과 경합 문제에서 비교적 단순하다. 하지만 람다는 생성된 메서드보다 오래 살 수 있고 다른 스레드에서 실행될 수도 있다.

가변 지역변수를 그대로 공유하도록 허용하면 이런 코드가 자연스러운 관용구가 된다.

```java
int sum = 0;
items.forEach(item -> sum += item.length()); // 컴파일되지 않음
```

이 누적은 병렬 실행으로 바꾸는 순간 경합한다. Java는 가변 지역변수 캡처를 막고 reduction을 쓰는 방향으로 유도한다.

```java
int sum = items.stream()
    .mapToInt(String::length)
    .sum();
```

지역변수의 성질을 유지하고 병렬화하기 쉬운 형태를 유도한다는 언어 설계가 먼저고, 값 캡처 구현이 그 결론을 따른다.[^lambda-bytecode]

## 값 캡처는 스레드 안전을 보장하지 않는다

참조 타입에서 복사되는 것은 참조값이다. 참조가 가리키는 객체까지 복제되는 것은 아니다.

```java
final List<Integer> shared = new ArrayList<>();
final int[] counter = new int[1];

for (int t = 0; t < 8; t++) {
    pool.submit(() -> {
        for (int i = 0; i < 1_000; i++) {
            shared.add(i);
            counter[0]++;
        }
    });
}
```

`shared`와 `counter`의 참조는 final이지만 내부 상태는 여러 스레드가 동시에 바꾼다. **값 캡처는 지역변수 재할당을 막을 뿐, 공유 객체를 스레드 안전하게 만들지 않는다.** 필드가 지역변수와 다른 이유도 캡처 대상에 있다.[^field-capture]

배열 holder로 제약을 우회하는 코드도 같은 문제를 숨긴다.

```java
int[] holder = new int[1];
items.forEach(item -> holder[0] += item.length());
```

컴파일은 되지만 병렬 스트림이나 다른 스레드로 넘어가면 처음에 막으려던 경합이 그대로 돌아온다. 이런 코드는 제약을 우회하라는 신호가 아니라 reduction이나 적절한 동시성 도구로 바꾸라는 신호에 가깝다.

## 에러별로 고치는 방법도 다르다

재할당 때문에 effectively final을 어겼다면 입력과 결과 변수를 나누는 것이 가장 읽기 쉽다.

```java
Member query = new Member();
Member result = repository.find(query);
items.forEach(item -> use(result.getId()));
```

definite assignment 문제라면 모든 경로에서 값을 채워야 한다.

```java
String name = condition ? "Alice" : "Bob";
```

두 컴파일 오류를 "final 붙이기" 하나로 해결하려 하면 엉뚱한 코드를 고치게 된다. 에러 메시지가 변수가 다시 바뀐다고 말하는지, 아직 값이 없을 수 있다고 말하는지를 먼저 보면 된다.

## 정리

**람다의 지역변수를 읽으려면 effectively final과 definite assignment를 모두 통과해야 한다.** 에러 메시지가 재할당을 말하는지, 초기화되지 않은 경로를 말하는지부터 구분하면 고칠 코드도 달라진다.

[^java8-history]: 람다는 Java 8에서 도입됐다. 그 이전에는 익명 내부 클래스가 캡처하는 지역변수에 명시적 `final`이 필요했고, Java 8부터 실제로 재할당되지 않은 변수도 effectively final로 인정한다. 이 규칙은 익명 클래스에도 적용된다.
[^lambda-bytecode]: `javac`는 람다를 익명 클래스 파일로 바꾸지 않는다. 람다 본문을 합성 메서드로 내리고 `invokedynamic`과 `LambdaMetafactory`를 통해 런타임 객체 생성을 연결한다.
[^field-capture]: 인스턴스 필드를 읽는 람다는 필드가 아니라 `this`를 캡처하고 실행 시점에 필드를 읽는다. 정적 필드는 합성 메서드가 직접 읽으므로 캡처할 값이 없다.
