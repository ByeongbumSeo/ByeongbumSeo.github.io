---
title: "Spring Security 필터에서 401 뒤 요청 체인을 종료해야 하는 이유"
slug: "security-filter-response-commit"
description: "setStatus나 sendError가 필터 실행을 끝내지 않는다는 점과 오버로드된 헬퍼의 실제 호출을 추적해, 거절 뒤 return이 필요한 이유를 설명한다."
kind: "tech"
publishedAt: "2026-01-06"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["spring-security", "servlet", "java", "debugging"]
relatedPosts: []
references:
  - title: "Spring Security Reference — Servlet Architecture"
    url: "https://docs.spring.io/spring-security/reference/servlet/architecture.html"
  - title: "Spring Security API — AuthenticationEntryPoint"
    url: "https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/web/AuthenticationEntryPoint.html"
  - title: "Spring Framework API — OncePerRequestFilter"
    url: "https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/filter/OncePerRequestFilter.html"
  - title: "Jakarta Servlet 6.0 API — HttpServletResponse"
    url: "https://jakarta.ee/specifications/servlet/6.0/apidocs/jakarta.servlet/jakarta/servlet/http/httpservletresponse"
  - title: "Java SE 21 Language Specification — Choosing the Most Specific Method"
    url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.12.2.5"
---

커스텀 인증 필터를 점검하다가 이상한 분기를 발견했다. 특정 시점보다 오래된 인증 토큰은 다시 인증하도록 막는 코드였는데, 거절 조건에 들어가도 뒤의 토큰 검증과 컨트롤러가 그대로 실행됐다. 로컬에서 재현해 보니 차단하려던 요청이 최종적으로 `200 OK`를 받았다.

흐름은 이랬다.

```java
if (requiresReauthentication(tokenIssuedAt)) {
    ResponseUtil.unauthorized(response);
}

if (tokenValidator.isValid(token)) {
    SecurityContextHolder.getContext().setAuthentication(authentication);
}

filterChain.doFilter(request, response);
```

처음에는 `unauthorized()`가 401을 만들었으니 요청도 끝났다고 생각하기 쉽다. 하지만 응답의 상태를 바꾸는 일과 현재 필터의 실행을 끝내는 일은 서로 다른 문제였다. `setStatus(401)` 뒤에 본문을 썼다고 상태가 저절로 200으로 바뀌는 것도 아니다. 재현한 경로에서는 뒤까지 도달한 핸들러가 성공 상태를 명시하면서 401을 덮어썼다.

## 401은 제어 흐름이 아니다

당시 `unauthorized()`가 실제로 호출한 메서드는 `response.setStatus(401)`이었다. `setStatus`는 응답의 상태 코드만 설정한다. 현재 Java 메서드에서 빠져나오지도 않고, 아래에 있는 `filterChain.doFilter()` 호출을 생략해 주지도 않는다.

Spring Security 문서에서 설명하는 것처럼 필터는 `filterChain.doFilter()`를 호출해 다음 필터와 서블릿으로 요청을 넘긴다. 반대로 현재 필터가 응답을 직접 만들고 체인을 호출하지 않으면 하위 처리를 막을 수 있다.

문제의 요청은 다음 순서로 흘렀다.

```text
재인증 필요 조건 일치
  ↓
응답 상태를 401로 설정
  ↓
return이 없어 토큰 검증 계속
  ↓
토큰 자체는 유효하므로 Authentication 설정
  ↓
filterChain.doFilter() 호출
  ↓
후속 핸들러가 성공 상태를 명시하며 최종 200
```

같은 형태의 코드가 언제나 200을 만드는 것은 아니다. 다른 분기에서는 토큰 검증도 실패해 인증 객체가 설정되지 않았고, 뒤쪽 보안 필터가 요청을 다시 거절했다. 그 경우에는 먼저 설정한 401이 끝까지 남았다. 코드가 같아 보이는데 어떤 테스트는 실패하고 어떤 테스트는 통과한 이유다.

| 앞선 거절 조건 | 이후 토큰 검증 | 체인 계속 실행 뒤 결과 |
|---|---|---|
| 참 | 성공 | 인증 설정 뒤 성공 상태를 명시한 핸들러까지 실행, 재현 환경에서는 200 |
| 참 | 실패 | 뒤쪽 보안 필터도 거절, 401 유지 |

두 번째 결과는 안전한 구현의 증거가 아니다. 뒤의 검증까지 실패해 주어서 우연히 차단된 것이다. 거절 조건 하나만 참이어도 반드시 끝나는지를 테스트해야 했다.

## 같은 메서드 이름이 서로 다른 응답을 만들고 있었다

분석을 더 헷갈리게 한 것은 응답 헬퍼의 오버로딩이었다. 구조를 일반화하면 다음과 같다.

```java
static void unauthorized(ServletResponse response) throws IOException {
    ((HttpServletResponse) response).sendError(401);
}

static void unauthorized(HttpServletResponse response) {
    response.setStatus(401);
}
```

`OncePerRequestFilter#doFilterInternal`의 `response` 매개변수는 `HttpServletResponse`다. 따라서 `unauthorized(response)`에는 더 구체적인 `HttpServletResponse` 오버로드가 선택되고, 실제 동작은 `sendError`가 아니라 `setStatus`가 된다.

이는 런타임 객체를 보고 임의로 고르는 동적 분기가 아니다. Java 컴파일러는 호출 지점에서 적용 가능한 메서드 가운데 가장 구체적인 메서드를 선택한다. 같은 객체라도 변수의 선언 타입이 `ServletResponse`인 테스트 코드에서는 다른 오버로드가 호출될 수 있다.

오버로딩이 필터를 계속 실행시킨 원인은 아니었다. `filterChain.doFilter()`에 도달할 수 있게 둔 제어 흐름이 먼저 잘못됐다. 다만 이름이 같은 두 메서드가 서로 다른 응답 생명주기를 가져 실제 부수 효과를 오판하기 쉬웠다.

## setStatus와 sendError도, return과는 역할이 다르다

Jakarta Servlet API에서 두 메서드의 계약은 분명히 다르다.

| 호출 | 응답에 미치는 영향 | 현재 필터 실행 |
|---|---|---|
| `setStatus(401)` | 상태 코드 설정, 오류 페이지 처리나 commit은 하지 않음 | 계속됨 |
| `sendError(401)` | 버퍼를 비우고 오류 응답 처리, 이후 응답은 commit된 것으로 간주 | 계속됨 |
| `return` | 현재 필터 메서드 종료 | 종료됨 |

`sendError`를 호출하면 응답을 더 쓰지 않아야 한다. 그렇다고 Java가 다음 줄을 건너뛰는 것은 아니다. 뒤에서 체인을 호출하면 commit된 응답에 다시 쓰려다 예외가 나거나, 컨테이너와 래퍼에 따라 후속 출력이 무시되는 식의 또 다른 문제가 생길 수 있다.

**필터가 거절 응답을 직접 쓴다면 응답을 만든 직후 `return`해야 한다.** `setStatus`를 `sendError`로 바꾸는 것만으로는 제어 흐름이 끝나지 않는다.

```java
if (requiresReauthentication(tokenIssuedAt)) {
    response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
    return;
}

if (!tokenValidator.isValid(token)) {
    response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
    return;
}

SecurityContextHolder.getContext().setAuthentication(authentication);
filterChain.doFilter(request, response);
```

JSON 오류 본문을 직접 쓴다면 `setStatus`, content type, body 작성을 한곳에서 마치고 반환한다. 헬퍼도 `sendUnauthorizedError`와 `setUnauthorizedStatus`처럼 차이를 이름에 드러내거나 인증 실패 응답 방식을 하나로 통일해야, commit 여부와 제어 흐름을 호출부에서 구분할 수 있다.

## 빈 AuthenticationEntryPoint는 별도의 문제였다

점검 중에는 잘못된 토큰에 `200 OK`와 빈 본문이 오는 다른 경로도 발견했다. 등록된 `AuthenticationEntryPoint#commence()`가 비어 있어 상태·헤더·본문을 아무것도 만들지 않은 경우였다.

이 문제는 `return` 누락과 별도로 고쳐야 했다. 커스텀 필터는 거절 응답을 쓴 뒤 반환하고, entry point는 앞에서 설정된 상태가 없어도 스스로 401 응답을 완성해야 한다.

## 상태 코드만 확인하는 테스트로는 부족했다

초기 테스트는 최종 상태가 401인지에 집중했다. 그 방식으로는 요청이 체인을 계속 탔지만 뒤에서 다시 401이 된 경우를 잡지 못한다.

필터 단위 테스트에서는 적어도 두 가지를 함께 확인해야 한다.

```java
filter.doFilter(request, response, filterChain);

assertThat(response.getStatus()).isEqualTo(401);
verifyNoInteractions(filterChain);
```

단위 테스트에서는 `filterChain.doFilter()` 미호출과 비어 있는 `SecurityContext`를 함께 확인한다. 통합 테스트에서는 보호된 컨트롤러에 도달하지 않았는지 보고, entry point 테스트에서는 상태 코드뿐 아니라 헤더와 본문도 확인한다. `SecurityContextHolder`는 테스트 사이에 비워야 한다.

특히 이 사례처럼 거절 조건과 일반 토큰 검증이 따로 있다면 다음 조합을 고정해야 한다.

- 재인증 조건은 참이지만 토큰 자체는 유효한 경우
- 토큰 검증도 실패하는 경우
- 거절 조건이 없고 정상 인증되는 경우
- entry point가 직접 응답해야 하는 경우

실패 뒤의 검증이 성공하는 첫 번째 조합이 빠지면, 우연히 정상인 두 번째 조합만 보고 수정됐다고 판단하기 쉽다.

**필터에서 상태 코드를 정했다면, 그다음에 누가 실행되는지도 확인해야 한다. 보안 분기의 종료는 응답 코드가 아니라 제어 흐름으로 보장한다.**
