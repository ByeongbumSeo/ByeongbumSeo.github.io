---
title: "IntelliJ에서 사용처가 없는 Jackson getter, 삭제 전에 확인할 것"
slug: "jackson-reflection-usage"
description: "IDE가 사용처를 찾지 못한 getter도 Jackson이 런타임에 직렬화할 수 있어, 삭제 전 응답 경로·Lombok·JSON 테스트를 확인해야 함을 보여준다."
kind: "tech"
category: "java"
publishedAt: "2026-04-30"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["java", "spring", "jackson", "intellij"]
relatedPosts: ["intellij-shortcuts"]
references:
  - title: "Jackson Databind — POJOPropertiesCollector"
    url: "https://github.com/FasterXML/jackson-databind/blob/2.x/src/main/java/com/fasterxml/jackson/databind/introspect/POJOPropertiesCollector.java"
  - title: "Jackson Databind — BeanPropertyWriter"
    url: "https://github.com/FasterXML/jackson-databind/blob/2.x/src/main/java/com/fasterxml/jackson/databind/ser/BeanPropertyWriter.java"
  - title: "Spring Framework — MappingJackson2HttpMessageConverter"
    url: "https://docs.spring.io/spring-framework/docs/6.2.x/javadoc-api/org/springframework/http/converter/json/MappingJackson2HttpMessageConverter.html"
  - title: "IntelliJ IDEA — Find Usages"
    url: "https://www.jetbrains.com/help/idea/find-highlight-usages.html"
  - title: "Java SE — Method.invoke"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/Method.html"
---

응답 모델을 정리하다 IntelliJ가 회색으로 표시한 getter 두 개를 발견했다. `Find Usages`도 비어 있었고 메서드 이름으로 검색해도 직접 호출은 한 건도 없었다. 안 쓰는 코드라고 판단해 지웠다.

그 뒤 API 응답에서 노출 여부 필드가 사라졌고, 상태에 따라 가려져야 할 이미지 주소가 원본 그대로 내려갔다.

```java
@Getter
public class ApiCardResponse {
    private String thumbnailUrl;
    private boolean active;

    public boolean isVisible() {
        return active;
    }

    public String getThumbnailUrl() {
        if (!active) {
            return null;
        }
        return sign(thumbnailUrl);
    }
}
```

코드 어디에서도 `isVisible()`이나 `getThumbnailUrl()`을 호출하지 않았다. 그런데 JSON에는 `visible`과 `thumbnailUrl`이 계속 들어가고 있었다. 호출자는 소스 코드 안이 아니라 직렬화 과정에 있었다.

## Jackson은 호출 그래프 밖에서 getter를 찾는다

Spring MVC는 `@RestController`가 반환한 객체를 `MappingJackson2HttpMessageConverter`와 Jackson `ObjectMapper`로 JSON으로 바꾼다. Jackson은 클래스를 살펴보고 JavaBean 규칙에 맞는 메서드를 프로퍼티로 수집한다.

| 메서드 | JSON 프로퍼티 |
|---|---|
| `getThumbnailUrl()` | `thumbnailUrl` |
| `isVisible()` | `visible` |

이 과정은 대략 다음 순서로 이어진다.

```text
컨트롤러가 ApiCardResponse 반환
  → HttpMessageConverter
  → ObjectMapper
  → 프로퍼티 수집과 serializer 생성
  → getter 접근
  → JSON 작성
```

애플리케이션 코드에 `response.getThumbnailUrl()`이라는 호출문이 없어도 Jackson은 이 메서드를 사용한다. 일반적인 Databind 경로에서는 리플렉션으로 접근한다. 최적화 모듈을 쓰면 실제 호출 방식은 달라질 수 있지만, 어느 방식이든 IDE의 정적 호출 그래프에는 보이지 않을 수 있다.

## IntelliJ가 놓친 게 아니라 볼 수 없는 호출이었다

`Find Usages`는 소스와 바이트코드에서 정적으로 연결할 수 있는 참조를 찾는다. 직접 호출, 오버라이드, 인터페이스 구현처럼 컴파일 시점에 관계를 알 수 있는 코드는 잘 잡는다. 반면 런타임에 메서드 이름과 규칙으로 선택되는 호출은 완전히 추적하기 어렵다.

```text
obj.getThumbnailUrl()       → 정적 참조를 찾을 수 있음
method.invoke(obj)          → 어떤 method인지 런타임 전에는 모를 수 있음
Jackson의 getter 규칙       → 프레임워크가 런타임에 프로퍼티로 해석
```

**`no usage`는 실행되지 않는다는 뜻이 아니라, IDE가 정적으로 찾은 사용처가 없다는 뜻이다.**

## 삭제가 더 위험했던 이유

예시 클래스에는 Lombok `@Getter`가 붙어 있었다. 명시적으로 작성한 `getThumbnailUrl()`을 지우자 Lombok이 단순 필드 반환 getter를 생성했다. 그래서 필드가 사라지는 대신 마스킹과 서명 URL 변환만 사라졌다.

```text
삭제 전: custom getter → 상태 검사 → null 또는 서명 URL
삭제 후: Lombok getter → 원본 필드 그대로 반환
```

겉으로는 getter 하나를 정리했지만, 실제로는 직렬화 정책을 제거한 셈이다. 이 구조는 로직이 getter 안에 숨어 있다는 점에서도 좋지 않다. 당장 삭제할 수 없다면 직렬화 계약임을 테스트와 주석으로 드러내고, 장기적으로는 응답 생성 단계의 명시적 매핑으로 옮기는 편이 안전하다.

## 이제는 이렇게 확인한다

응답 모델의 `get*()` 또는 `is*()`를 지우기 전에는 다음을 본다.

1. 이 클래스가 컨트롤러 응답 타입에 직접 또는 중첩해서 포함되는가.
2. `@JsonIgnore`, `@JsonProperty`, 가시성 설정이 직렬화 대상을 바꾸고 있는가.
3. getter 본문에 마스킹, 권한 판단, 지연 계산, 값 변환이 들어 있는가.
4. Lombok이 메서드 삭제 뒤 다른 getter를 생성하는가.
5. 실제 JSON 스냅샷이나 통합 테스트에서 필드의 존재와 값을 확인했는가.

`*Response`, `*Dto`, `*Model` 같은 이름은 단서일 뿐 보장은 아니다. 반대로 내부 클래스처럼 보여도 다른 응답 안에 들어가면 직렬화될 수 있다. 이름보다 반환 경로를 따라가야 한다.

IntelliJ가 찾지 못한 호출을 Jackson이 런타임에 만들고 있었다. **회색 코드는 삭제 후보일 뿐이다. 프레임워크 규약에 걸린 메서드라면 실제 실행 경로와 응답 테스트부터 확인해야 한다.**
