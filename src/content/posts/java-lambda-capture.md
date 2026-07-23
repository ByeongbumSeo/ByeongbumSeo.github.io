---
title: "effectively final인데 컴파일이 안 된다 — 람다 변수 캡처의 두 규칙"
slug: "java-lambda-capture"
description: "Java 람다의 지역변수 캡처에서 effectively final과 definite assignment가 왜 별개의 규칙인지 바이트코드와 예제로 확인한다."
kind: "tech"
publishedAt: "2026-03-26"
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

문제는 finality가 아니라, 람다에 도달하는 모든 경로에서 값이 할당됐는지다. `else`를 추가하면 컴파일된다.

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

첫 번째는 JLS 4.12.4, 두 번째는 JLS 16의 규칙이다. 둘은 서로를 대신하지 않는다.

선언과 할당을 나눴다는 사실만으로 effectively final이 깨지는 것도 아니다.

```java
String code;
code = "A";
items.forEach(item -> use(code)); // 컴파일 성공
```

initializer가 없는 지역변수는 각 할당 시점에 definitely unassigned이고, 증가·감소나 재할당이 없다면 effectively final일 수 있다. `final` 키워드는 definite assignment를 보장하지 않고, 한 번의 지연 할당은 effectively final을 깨지 않는다.

## Java 8이 완화한 것은 무엇인가

"Java 8 이전에는 람다에서 지역변수에 `final`을 붙여야 했다"는 설명을 종종 보는데, 람다 자체가 Java 8에서 도입됐다. 정확히는 익명 내부 클래스가 캡처하는 지역변수에 명시적 `final`이 필요했다.

Java 8은 값이 실제로 재할당되지 않았다면 컴파일러가 `final`과 같은 것으로 인정하도록 완화했다. 이 규칙은 람다뿐 아니라 익명 클래스에도 적용된다.

```java
String id = "123";
Runnable task = new Runnable() {
    @Override
    public void run() {
        System.out.println(id);
    }
};
```

`id`를 다시 할당하면 익명 클래스도 `final or effectively final` 오류로 거부된다.

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

중요한 순서는 "구현상 복사가 필요해서 제약했다"가 아니다. 지역변수의 기존 성질을 보존하고 병렬화하기 쉬운 형태를 유도한다는 언어 설계가 먼저고, 값 캡처 구현이 그 결론을 따른다.

## javac는 람다를 익명 클래스로 바꾸지 않는다

간단한 람다를 컴파일해 클래스 파일을 보면 익명 클래스 파일이 생기지 않는다.

```java
String id = "123";
Consumer<String> consumer = item -> System.out.println(id);
```

```text
$ javac Example.java
$ ls
Example.class
```

`javap -c -p -v`로 열면 `invokedynamic` 호출과 `LambdaMetafactory.metafactory` bootstrap method가 보인다. 람다 본문은 합성 메서드로 내려가고, 런타임에 람다 객체를 만드는 방법은 `invokedynamic`이 연결한다.

```text
invokedynamic #...  // accept:(Ljava/lang/String;)Ljava/util/function/Consumer;

private static void lambda$main$0(java.lang.String, java.lang.String);
```

캡처하는 람다의 런타임 클래스에는 캡처값을 담는 final 필드가 생길 수 있다. 캡처하지 않는 람다는 그런 필드가 없다. 다만 이 필드가 effectively final 규칙의 원인은 아니다. 언어가 값 캡처를 택했기 때문에 구현이 값을 저장하는 것이다.

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

`shared`와 `counter`의 참조는 final이지만 내부 상태는 여러 스레드가 동시에 바꾼다. 값 캡처가 지키는 것은 지역변수 자체를 재할당하지 않는다는 조건이지, 공유 객체의 스레드 안전이 아니다.

배열 holder로 제약을 우회하는 코드도 같은 문제를 숨긴다.

```java
int[] holder = new int[1];
items.forEach(item -> holder[0] += item.length());
```

컴파일은 되지만 병렬 스트림이나 다른 스레드로 넘어가면 처음에 막으려던 경합이 그대로 돌아온다. 이런 코드는 제약을 우회하라는 신호가 아니라 reduction이나 적절한 동시성 도구로 바꾸라는 신호에 가깝다.

## 필드는 왜 자유롭게 바꿀 수 있나

인스턴스 필드를 읽는 람다는 필드 자체를 캡처하지 않는다. `this` 참조를 값으로 캡처한 뒤 실행 시점에 `getfield`로 읽는다. `this`는 재할당할 수 없으므로 effectively final 조건에 자연스럽게 맞는다.

정적 필드는 캡처할 것도 없다. 합성 메서드가 `getstatic`으로 직접 읽는다.

```java
private String instanceValue = "A";
private static String staticValue = "B";

Supplier<String> instanceReader() {
    return () -> instanceValue; // this를 캡처
}

static Supplier<String> staticReader() {
    return () -> staticValue;   // 캡처 없음
}
```

필드가 예외 취급을 받는 것이 아니라, 애초에 캡처 대상이 다르다.

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

- 람다의 지역변수는 effectively final과 definite assignment를 각각 통과해야 한다.
- 선언과 단 한 번의 할당을 나눠 썼다고 effectively final이 깨지는 것은 아니다.
- javac는 람다를 익명 클래스로 바꾸지 않고 `invokedynamic`과 `LambdaMetafactory`를 사용한다.
- 값 캡처는 지역변수의 기존 격리를 보존할 뿐, 공유 객체를 스레드 안전하게 만들지 않는다.
- 인스턴스 필드는 `this`를 캡처하고 정적 필드는 캡처하지 않으므로 지역변수와 같은 제약이 보이지 않는다.

규칙을 하나로 외우고 있을 때는 두 번째 에러 메시지를 만나면 손이 멈췄다. 규칙이 둘이라는 걸 알고 나니, 컴파일러가 어느 문제를 가리키는지부터 보이기 시작했다.
