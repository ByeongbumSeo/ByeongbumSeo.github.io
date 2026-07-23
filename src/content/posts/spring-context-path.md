---
title: "URL prefix, 필터로 벗길까 context-path로 올릴까"
slug: "spring-context-path"
description: "전환기 URL prefix 필터를 Spring Boot context-path로 바꾸며 요청 매핑, 헬스체크, 로깅 책임을 검증한 과정을 정리한다."
kind: "tech"
publishedAt: "2026-07-02"
draft: false
deprecated: false
outdated: false
tags: ["spring", "spring-boot", "tomcat", "aws"]
relatedPosts: ["rest-api"]
references:
  - title: "Spring Boot — Common Application Properties"
    url: "https://docs.spring.io/spring-boot/appendix/application-properties/index.html"
  - title: "Jakarta Servlet Specification 6.0 — Use of URL Paths"
    url: "https://jakarta.ee/specifications/servlet/6.0/jakarta-servlet-spec-6.0.html#use-of-url-paths"
  - title: "AWS — Health checks for Application Load Balancer target groups"
    url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html"
---

API 경로 앞에 `/service-api`를 붙이는 전환을 진행했다. 구버전 클라이언트가 prefix 없는 경로를 호출하던 동안에는 필터가 두 형태를 모두 받아줬다.

```java
public class PrefixStripFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, ...) {
        String uri = request.getRequestURI();

        if (uri.startsWith("/service-api")) {
            filterChain.doFilter(wrapWithoutPrefix(request), response);
            return;
        }

        filterChain.doFilter(request, response);
    }
}
```

클라이언트 전환이 끝난 뒤 요구사항은 “prefix 없는 요청을 더는 받지 않는다”로 바뀌었다. 필터의 `else`에서 404를 반환할 수도 있었지만, 모든 경로에 예외 없이 prefix가 붙는다면 애플리케이션의 컨텍스트 자체를 옮기는 편이 구조를 더 정확히 표현한다.

```yaml
server:
  servlet:
    context-path: /service-api
```

## context-path는 컨트롤러 앞에 문자열을 더하는 설정이 아니다

`server.servlet.context-path`를 적용하면 임베디드 서블릿 컨테이너가 웹 애플리케이션을 `/service-api` 아래에 배치한다.

```text
변경 전
요청 → 루트 컨텍스트 → 필터 → Security → 컨트롤러

변경 후
요청 → 컨테이너가 /service-api 컨텍스트와 먼저 매칭
  ├─ 불일치 → 앱에 들어오지 않음(이 단일 애플리케이션 구성에서는 컨테이너가 404 응답)
  └─ 일치   → 필터 → Security → 컨트롤러
```

Jakarta Servlet 명세도 컨테이너가 요청 URL에 맞는 웹 애플리케이션을 먼저 선택한다고 설명한다. 따라서 컨텍스트 밖의 요청은 애플리케이션 필터나 Spring Security에 도달하지 않는다.

이 차이는 차단 코드만 단순하게 만드는 게 아니다. 이전 필터에서 남기던 비정상 경로의 접근 로그도 함께 사라진다. 컨텍스트 밖 요청의 관측이 필요하다면 로드 밸런서, WAF, 컨테이너 액세스 로그처럼 더 앞단에서 맡아야 한다.

컨트롤러의 `@RequestMapping`과 Security matcher는 보통 컨텍스트 상대 경로를 사용하므로 내부 경로를 일괄 수정할 필요가 없었다. 반대로 애플리케이션 밖에서 직접 호출하는 헬스체크와 메트릭 수집 경로는 반드시 따로 확인해야 했다.

## 헬스체크를 먼저 옮겼다

Actuator가 애플리케이션과 같은 포트·서블릿 컨텍스트에서 동작하던 이 환경에서는 context-path 적용 뒤 기존 `/health`가 `/service-api/health`로 이동했다. 로드 밸런서 타깃 그룹이 여전히 `/health`를 호출하면 새 인스턴스는 기동해도 unhealthy로 판정된다. `management.server.port`로 관리 서버를 분리한 구성이라면 별도 management context가 생기므로 같은 결론을 그대로 적용하면 안 된다.

전환 순서를 다음처럼 잡았다.

```text
1. 호환 필터가 살아 있을 때 타깃 그룹 헬스체크를 /service-api/health로 변경
2. 구 인스턴스: 필터가 prefix를 제거해 정상 응답
3. 신 인스턴스: context-path가 네이티브로 매핑해 정상 응답
4. 신 버전 배포가 안정된 뒤 호환 필터 삭제
```

필터가 두 형태를 모두 받는 기간이 무중단 전환을 위한 완충 구간이었다. 순서를 반대로 했다면 신 인스턴스가 헬스체크 404로 트래픽을 받지 못했을 것이다.

ALB의 헬스체크 경로와 포트는 타깃 그룹 설정이 결정한다. 일반 사용자 요청에 적용되는 CDN behavior나 리스너 라우팅만 보고 판단하면 놓치기 쉽다.

## 앞단이 prefix를 제거하는지 직접 확인했다

전환 전에 가장 불안한 질문은 “로드 밸런서나 게이트웨이가 이미 prefix를 벗기고 있지 않은가?”였다. 외부에서 `/service-api/health`가 200인 것만으로는 구분할 수 없다.

```text
가설 A: 앞단이 제거 → 앱은 /health 수신 → 200
가설 B: 필터가 제거 → 앱은 /service-api/health 수신 후 제거 → 200
```

그래서 prefix를 두 번 붙였다.

```text
/service-api/service-api/health

앞단도 한 번 제거한다면:
  앞단 제거 → /service-api/health
  앱 필터 제거 → /health → 200

앞단이 그대로 전달한다면:
  앱 필터가 한 번만 제거 → /service-api/health → 매핑 실패
```

실제 환경에서는 CDN이 일부 오류를 빈 본문의 200으로 바꾸는 설정까지 있어 상태코드만으로 판정할 수 없었다. 정상 헬스체크의 고정 본문을 응답 지문으로 삼았다.

```bash
curl -s https://dev.example.com/service-api/service-api/health \
  -w '\nstatus=%{http_code} size=%{size_download}\n'
```

상태는 200이었지만 정상 본문이 없었다. 애플리케이션의 정상 응답이 아니라 앞단에서 바뀐 오류 응답이었다. 이 결과로 앞단이 prefix를 제거하지 않는다는 쪽에 무게를 둘 수 있었다.

## 필터는 일부가 아니라 전부 삭제했다

context-path를 적용한 뒤 strip 로직을 남기면 컨테이너가 이미 분리한 context path와 애플리케이션 내부 URI 처리가 충돌한다. prefix 없는 요청을 차단하는 브랜치는 그런 요청이 필터에 도달하지 않으므로 데드코드가 된다.

이 필터는 `@Component`와 `FilterRegistrationBean` 양쪽에서 등록된 흔적도 있었다. 빈 이름 덮어쓰기가 허용돼 우연히 하나만 동작하고 있었지만, 설정이 달랐다면 중복 등록으로 이어질 수 있는 구조였다. 전환이 끝난 호환 코드는 재사용 자산이 아니라 다시 켜면 안 되는 코드였고, Git 이력만 남긴 채 파일을 삭제했다.

정리하면 필터는 예외 경로와 구버전 호환이 필요한 전환기에 유용하다. URL prefix가 애플리케이션 전체의 고정된 루트가 됐다면 context-path가 책임을 더 정확히 드러낸다. 다만 그 순간 차단과 관측의 경계도 애플리케이션 밖으로 이동한다는 점까지 함께 설계해야 한다.
