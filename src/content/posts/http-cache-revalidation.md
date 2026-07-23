---
title: "HTTP 캐시 재검증: ETag와 304의 동작 원리"
slug: "http-cache-revalidation"
description: "max-age 이후 ETag와 If-None-Match로 캐시를 재검증하는 흐름과 Spring·URLSession에서 304가 다르게 보이는 이유를 다룬다."
kind: "tech"
publishedAt: "2025-05-03"
draft: false
deprecated: false
outdated: false
tags: ["http", "cache", "etag", "spring", "ios", "wireshark"]
relatedPosts: ["cloudfront-stale-swagger"]
references:
  - title: "RFC 9110 — 304 Not Modified"
    url: "https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4.5"
  - title: "RFC 9110 — Content-Length"
    url: "https://www.rfc-editor.org/rfc/rfc9110.html#section-8.6"
  - title: "RFC 9111 — Validation"
    url: "https://www.rfc-editor.org/rfc/rfc9111.html#section-4.3"
  - title: "Spring Framework — HTTP Caching"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-caching.html"
  - title: "Spring Framework — ShallowEtagHeaderFilter"
    url: "https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/filter/ShallowEtagHeaderFilter.html"
  - title: "Apple Developer — NSURLRequest.CachePolicy"
    url: "https://developer.apple.com/documentation/foundation/nsurlrequest/cachepolicy-swift.enum"
  - title: "Apple Developer — Accessing cached data"
    url: "https://developer.apple.com/documentation/foundation/accessing-cached-data"
  - title: "Apple Developer — URLCache"
    url: "https://developer.apple.com/documentation/foundation/urlcache"
---

사내 네트워크 스터디에서 HTTP 캐시를 세 번에 걸쳐 살펴봤다. 첫 시간에는 ETag와 조건부 요청의 개념을 정리했고, 다음에는 Spring 서버와 iOS 앱에서 예상과 다르게 보이는 응답을 분석했다. 마지막에는 Wireshark로 실제 패킷을 확인했다.

| 회차 | 질문 | 확인한 내용 |
| --- | --- | --- |
| 1회차 | 캐시는 언제 서버에 다시 묻는가 | `max-age`, ETag, `If-None-Match`, 304의 역할 |
| 2회차 | 서버와 앱에는 왜 계속 200으로 보이는가 | 필터 실행 순서와 URLSession의 캐시 재사용 |
| 3회차 | 네트워크에서도 정말 304가 오가는가 | Wireshark 패킷과 전송량 |

## 캐시를 그대로 쓰는 것과 다시 확인하는 것은 다르다

HTTP 캐시에는 저장된 응답을 그대로 쓰는 구간과 서버에 유효성을 다시 확인하는 구간이 있다.

`Cache-Control: max-age=30`은 응답의 나이가 30초를 넘기 전까지 fresh한 상태로 취급할 수 있다는 뜻이다. 캐시가 이 응답을 재사용하면 원 서버에 다시 요청할 필요가 없다. 응답이 stale해진 뒤에도 ETag가 있다면, 그 값을 `If-None-Match`에 담아 서버에 재검증할 수 있다.

```text
첫 요청
GET → 200 OK + ETag + 응답 본문

캐시가 아직 유효함
저장된 응답 재사용 → 네트워크 요청 없음

캐시 재검증
If-None-Match → 변경됨: 200 OK + 새 본문
                  변경 없음: 304 Not Modified
```

304는 조건부 `GET` 또는 `HEAD` 요청에서 현재 표현이 바뀌지 않았음을 알리는 응답이다. 응답 본문을 다시 보내지 않고, 캐시는 앞서 저장한 응답을 재사용한다.

**`max-age`는 서버에 묻지 않는 시간을 정하고, ETag는 다시 물었을 때 본문을 재전송할지 결정한다.**

## Spring에서는 Shallow ETag로 동작을 확인했다

서버에서는 Spring의 `ShallowEtagHeaderFilter`를 등록했다.

```java
@Bean
public ShallowEtagHeaderFilter shallowEtagHeaderFilter() {
    return new ShallowEtagHeaderFilter();
}
```

적용 자체는 예상보다 단순했다. ETag 생성과 `If-None-Match` 비교를 Spring이 맡아 주니 애플리케이션에서 직접 구현할 코드는 거의 없었다. 조건부 요청은 특정 프레임워크만의 특별한 기능이 아니라 HTTP 표준이어서, 프레임워크가 필터나 미들웨어 형태로 제공하기 좋은 영역이라는 점도 이해됐다.

다만 적용 코드가 짧다는 것과 제대로 사용하는 것은 별개였다. 캐시할 응답을 고르고, `max-age`와 공개 범위를 정하고, 실제 동작을 확인하는 판단은 여전히 애플리케이션에 남는다.

필터는 응답 내용을 바탕으로 ETag를 만들고, 다음 요청의 `If-None-Match`와 비교한다. 두 값이 같으면 본문 대신 304를 반환한다.

이름에 붙은 `Shallow`가 중요한 제한을 알려준다. 이 필터는 컨트롤러가 응답을 만들고 직렬화한 뒤 그 내용을 기준으로 ETag를 계산한다. 따라서 DB 조회나 응답 생성 비용은 이미 발생한 상태다.

**Shallow ETag가 줄이는 것은 응답 본문의 전송량이지, 조회와 직렬화에 드는 서버 연산이 아니다.**

## 스터디 중에는 서버와 앱 모두 200을 보여줬다

필터를 적용한 뒤에도 서버 응답 로그에는 200이 기록됐다. iOS 앱의 completion handler에서도 200과 응답 본문을 받았다. 처음에는 ETag가 동작하지 않는다고 생각했다.

### 서버 로그는 ETag 처리 전 상태를 기록했다

당시 로그 필터는 `ShallowEtagHeaderFilter`가 응답 상태를 최종 확정하기 전에 상태 코드를 기록하고 있었다. 그 시점에는 응답 본문이 만들어졌고 상태 코드도 아직 200이었다. 이후 바깥쪽 필터가 ETag를 비교하면서 실제 응답을 304로 바꿨다.

필터는 등록 순서대로 요청을 처리하지만, `chain.doFilter()` 뒤의 응답 처리는 반대 순서로 돌아온다. 로그 필터의 순서를 조정해 ETag 처리가 끝난 상태를 기록하도록 하자 로그와 실제 응답이 일치했다.

### URLSession은 저장된 응답을 앱에 전달했다

앱은 기본 캐시 정책인 `.useProtocolCachePolicy`를 사용하고 있었다. 이번 실험에서는 네트워크에 304가 기록됐지만 completion handler에는 200과 저장된 본문이 전달됐다. URL Loading System이 `URLCache`에 있던 응답을 재사용한 결과로 해석했다.

```text
서버가 보낸 응답        URL Loading System        앱에서 받은 결과
304 + 본문 없음   →     저장된 응답 재사용   →   200 + 캐시된 본문
```

`.reloadIgnoringLocalCacheData`로 로컬 캐시를 무시하면 당시 실험에서는 304도 재현되지 않았다. 확인하려는 캐시 동작 자체가 달라지므로 검증 방법으로 쓰기 어려웠다.

## 그래서 패킷을 직접 확인했다

MacBook에서 Spring 서버를 로컬로 실행하고, 같은 Wi-Fi에 연결한 iPhone에서 직접 빌드한 앱을 호출했다.

자주 조회되고 변경이 적은 목록 응답을 한 번씩 캡처한 결과는 다음과 같았다.

| 응답 | 캡처된 전체 통신량 | 확인한 내용 |
| --- | ---: | --- |
| 200 OK | 약 16KB | 약 14KB의 본문이 여러 TCP 세그먼트로 전송됨 |
| 304 Not Modified | 약 1.1KB | 응답 본문 없이 하나의 응답 프레임으로 끝남 |

이 수치는 특정 응답을 한 차례 측정한 결과다. 모든 API에서 같은 비율로 줄어든다는 뜻은 아니다.

![Wireshark에서 확인한 HTTP 200 응답 헤더. Content-Length가 포함되어 있다.](/assets/img/posts/etag-304-study-200.png)

*200 응답 캡처. 날짜·ETag·본문 크기는 가렸으며, `Content-Length` 헤더가 포함되어 있다.*

![Wireshark에서 확인한 HTTP 304 응답 헤더. 캡처 당시 Content-Length가 없었다.](/assets/img/posts/etag-304-study-304.png)

*304 응답 캡처. 같은 ETag의 실제 값과 날짜는 가렸으며, 이 캡처에는 `Content-Length`가 없었다.*

요청의 `If-None-Match`와 두 응답의 ETag가 같다는 것, 그리고 실제 네트워크 응답이 304라는 것을 함께 확인했다. RFC상 304에는 응답 본문이 없다. 다만 304에 `Content-Length` 헤더가 반드시 없어야 하는 것은 아니다. 이번 캡처에서 없었다는 관측과 HTTP 규칙은 구분해야 한다.

## 적용할 응답은 따로 골라야 했다

전송량이 줄었다고 모든 GET 응답에 같은 캐시 정책을 적용할 수는 없다. 스터디에서는 다음 기준으로 후보를 좁혔다.

- 자주 요청되는가
- 데이터가 자주 바뀌지 않는가
- 저장된 응답을 재사용해도 안전한가
- 일정 시간 이전의 데이터를 보여줘도 문제가 없는가

실험에서 사용한 `public` 지시자는 공유 캐시도 응답을 저장할 수 있게 한다. 사용자별 정보나 민감한 데이터가 포함된 응답에 그대로 복사해서는 안 된다. 데이터 성격에 따라 `private`, `no-store` 또는 별도의 정책을 선택해야 한다.

Shallow ETag만으로 서버 조회 비용이 줄었다고 말해서도 안 된다. 이번에 확인한 것은 로컬 환경에서 조건부 요청이 성립했고, 바뀌지 않은 응답 본문이 다시 전송되지 않았다는 사실까지다. 운영 환경의 트래픽이나 서버 부하는 따로 측정하지 않았다.

## 로그·앱·패킷에서 보이는 응답은 달랐다

이번 스터디는 ETag를 붙이는 방법보다 HTTP 캐시가 어느 단계에서 어떤 결과를 보여주는지 이해하는 데 더 도움이 됐다.

서버 로그는 기록한 시점의 상태를 보여주고, URLSession은 캐시 처리를 마친 결과를 앱에 전달한다. 둘 다 200이라고 해도 실제 네트워크의 응답까지 200이라고 단정할 수는 없었다.

**캐시 문제를 확인할 때는 상태 코드만 보지 않고, 서버 로그·클라이언트 캐시·실제 패킷 중 어디에서 본 결과인지 함께 확인해야 한다.**
