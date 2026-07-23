---
title: "CloudFront 캐시로 Swagger 문서가 갱신되지 않을 때"
slug: "cloudfront-stale-swagger"
description: "최신 빌드가 배포됐는데도 Swagger 문서만 갱신되지 않은 문제를 CloudFront 응답 헤더로 분리 진단한 과정을 기록한다."
kind: "tech"
category: "web"
publishedAt: "2026-07-02"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["aws", "cloudfront", "swagger", "debugging"]
relatedPosts: ["rest-api"]
references:
  - title: "Amazon CloudFront — Using the managed cache policies"
    url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html"
  - title: "Amazon CloudFront — Manage how long content stays in the cache"
    url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html"
  - title: "RFC 9111 — Calculating Age"
    url: "https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2.3"
---

개발 환경에 새 API를 배포했는데 Swagger 문서에는 보이지 않았다. 빌드와 배포가 실패했다고 생각해 파이프라인부터 다시 확인했다. 빌드도 성공했고 인스턴스의 프로세스도 최신 이미지로 바뀌어 있었다.

결정적인 차이는 같은 문서를 두 경로로 조회했을 때 나왔다.

```text
인스턴스 localhost → 최신 OpenAPI 문서
외부 개발 도메인  → 이전 OpenAPI 문서
```

**애플리케이션은 최신 상태였고, 그 앞 계층이 오래된 응답을 돌려주고 있었다.**

## 먼저 응답 헤더를 봤다

응답 헤더는 다음 명령으로 확인했다.

```bash
curl -sI https://dev.example.com/service-api/docs/openapi/items
```

```text
date: <전날의 오리진 응답 시각>
x-cache: Hit from cloudfront
age: <수만 초>
via: ...cloudfront.net (CloudFront)
```

`x-cache: Hit from cloudfront`는 오리진에 새 요청을 보내지 않고 캐시 객체를 반환했다는 뜻이다. `age`는 응답이 캐시에 머문 시간을 판단할 단서다.[^http-age] `date`, `age`, 조회 시점을 함께 보니 전날 생성된 응답이 계속 반환되고 있었다.

대조군도 만들었다. 캐시하지 않는 헬스체크 경로는 `x-cache: Miss`였고 `date`도 현재 시각이었다. 브라우저 캐시나 Swagger UI 자체 문제보다 CDN 계층을 먼저 의심할 근거가 충분했다.

## 기본 캐시 정책이 문서 응답에 그대로 적용됐다

해당 경로는 별도 behavior 없이 CloudFront의 관리형 캐시 정책을 사용하고 있었다. 오리진의 OpenAPI 응답에는 명시적인 `Cache-Control`이나 `Expires`가 없었다. 결국 정책의 기본 TTL이 적용돼, 배포 후에도 이전 문서가 길게 유지됐다.

서비스 API는 캐시 대상이 아니어서 사용자 요청에는 영향이 없었다. 문제는 GET으로 제공되는 개발용 OpenAPI 문서에 국한됐다. 그렇다고 그냥 기다릴 문제는 아니었다. 다음 배포에서도 같은 혼란이 반복될 수 있기 때문이다.

조치는 두 단계로 나눴다.

1. 즉시 해당 OpenAPI 경로를 invalidation해 오래된 객체를 제거했다.
2. 문서 경로용 behavior를 분리하고 캐시 비활성 정책을 적용했다.

문서가 자주 바뀌지 않는 환경이라 캐시를 유지하고 싶다면 짧은 TTL과 배포 시 invalidation을 조합할 수도 있다. 중요한 건 의도하지 않은 기본 정책에 맡기지 않는 것이다.

## 배포와 반영을 분리해 검증했다

이번 진단에서 유효했던 순서는 다음과 같다.

```text
1. 배포 실행 결과 확인
2. 인스턴스 localhost에서 새 동작 확인
3. 외부 도메인에서 같은 요청 확인
4. 응답 헤더의 x-cache, age, via 비교
5. 캐시 정책과 오리진 Cache-Control 확인
```

처음에는 배포된 JAR에서 새 문구를 찾아 빌드 버전을 판별하려 했다. 하지만 바이너리의 문자열 등장 횟수는 소스 코드와 일치하지 않아 근거로 쓰기 어려웠다.

대신 응답에서 확인 가능한 무해한 문구 하나를 바꿔 localhost와 외부 도메인을 비교했다. 이 방식은 “무엇이 배포됐는지”와 “어느 계층이 무엇을 반환하는지”를 직접 보여줬다.

시크릿 모드도 도움이 되지 않았다. 오래된 값을 보관한 주체가 브라우저가 아니라 CloudFront였기 때문이다. **“배포했는데 안 보인다”면 재배포부터 반복하지 말고, 오리진 응답과 최종 사용자 경로의 응답을 먼저 비교해야 한다.**

[^http-age]: RFC 9111의 age 계산에는 오리진의 `Date`, 전송 지연, 캐시 체류 시간이 함께 반영된다. `date`와 `age`는 독립된 증거라기보다 같은 응답의 나이를 서로 확인하는 값에 가깝다.
