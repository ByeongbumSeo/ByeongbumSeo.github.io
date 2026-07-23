---
title: "Chrome DevTools MCP와 Playwright MCP의 세션·재현성 비교"
slug: "browser-mcp-comparison"
description: "Chrome DevTools MCP와 Playwright MCP를 세션, 디버깅 기능, 재현성, 브라우저 지원 관점에서 비교한다."
kind: "tech"
publishedAt: "2026-04-10"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mcp", "browser", "playwright", "chrome-devtools"]
relatedPosts: []
references:
  - title: "ChromeDevTools/chrome-devtools-mcp"
    url: "https://github.com/ChromeDevTools/chrome-devtools-mcp"
  - title: "microsoft/playwright-mcp"
    url: "https://github.com/microsoft/playwright-mcp"
  - title: "Chrome DevTools (MCP) for your AI agent"
    url: "https://developer.chrome.com/blog/chrome-devtools-mcp"
  - title: "Changes to remote debugging switches to improve security"
    url: "https://developer.chrome.com/blog/remote-debugging-port"
---

관리 화면의 UI를 확인할 때 Playwright MCP를 쓰고 있었다. 코드 수정 뒤 페이지를 열고, 클릭하고, 스크린샷을 남기는 흐름은 잘 맞았다. 그러다 Chrome DevTools 팀이 만든 Chrome DevTools MCP를 알게 됐다.

둘 다 AI 에이전트가 브라우저를 조작하게 해주지만 같은 도구의 대체재는 아니었다. 하나는 재현 가능한 브라우저 자동화에 가깝고, 다른 하나는 이미 열어 둔 Chrome과 개발자 도구를 에이전트에게 연결하는 데 강했다.

아래 비교는 원본을 작성한 2026년 4월의 공개 문서와 도구 상태를 기준으로 한다.

## 먼저 구조가 다르다

| | Chrome DevTools MCP | Playwright MCP |
|---|---|---|
| 제작 | Google Chrome DevTools 팀 | Microsoft Playwright 팀 |
| 패키지 | `chrome-devtools-mcp` | `@playwright/mcp` |
| 기반 | Chrome DevTools Protocol | Playwright 브라우저 자동화 |
| 브라우저 | Chrome/Chromium | Chromium, Firefox, WebKit |
| 기본 세션 | 실행 중인 Chrome에 연결 가능 | MCP 전용 브라우저 프로필 |
| 강점 | 실제 세션 탐색과 성능 진단 | 격리와 재현성, 크로스 브라우저 |

처음에는 "기존 로그인 세션을 쓸 수 있느냐"가 가장 큰 차이라고 봤다. 실제로 써보니 세션 차이가 테스트 철학까지 이어졌다.

## 인증이 복잡하면 기존 세션이 편하다

Chrome DevTools MCP는 이미 로그인한 Chrome에 연결해 열어 둔 탭, 쿠키, localStorage를 그대로 사용할 수 있다. 2단계 인증이나 SSO를 매번 통과해야 하는 관리 도구, 이미 열어 둔 기획 문서나 대시보드를 확인할 때 편했다.

Playwright MCP는 기본적으로 전용 프로필을 사용한다. 첫 로그인은 다시 해야 하지만 이후에는 그 프로필에 상태가 유지될 수 있고, `--isolated`를 사용하면 매번 깨끗한 환경에서 시작할 수 있다. 평소 쓰는 브라우저 상태와 테스트 상태가 섞이지 않는다는 것이 오히려 장점이다.

```text
기존 로그인과 열린 탭을 그대로 탐색 → Chrome DevTools MCP
쿠키와 캐시 영향을 지운 채 재현     → Playwright MCP
```

Playwright MCP도 확장 연결 방식으로 기존 브라우저에 붙을 수 있으므로 경계가 완전히 고정된 것은 아니다. 다만 기본 운용 방식이 무엇을 최적화하는지는 다르다.

## 둘 다 클릭하지만 진단의 깊이가 다르다

페이지 이동, 클릭, 입력, 스크린샷, DOM 스냅샷, 콘솔과 네트워크 요청 확인은 두 도구 모두 가능했다. 차이는 DevTools 고유 기능에서 벌어졌다.

| 기능 | Chrome DevTools MCP | Playwright MCP |
|---|:---:|:---:|
| 탐색·클릭·입력 | O | O |
| 스크린샷과 DOM 스냅샷 | O | O |
| 콘솔·네트워크 확인 | O | O |
| Lighthouse 감사 | O | - |
| 성능 프로파일링 | O | - |
| 힙 스냅샷 | O | - |
| 크로스 브라우저 | - | O |
| headless 자동화 | O | O |

Playwright의 tracing은 자동화 실행을 추적하고 재생하는 데 유용하다. Chrome DevTools의 performance trace는 렌더링, 스크립트 실행, 긴 작업처럼 페이지 성능을 분석하는 도구다. 이름은 비슷해도 목적이 다르다.

Chrome DevTools MCP는 "개발자 도구를 AI가 대신 조작한다"는 표현이 잘 맞았다. Playwright MCP는 "사용자 동작을 반복 가능한 방식으로 자동화한다"에 더 가까웠다.

## 기존 로그인 세션은 편한 만큼 조심해야 한다

로그인된 브라우저에 연결하면 인증을 다시 거치지 않아도 되지만, 그 브라우저의 탭과 저장된 상태를 MCP 클라이언트가 읽고 바꿀 수 있다. Chrome DevTools MCP도 공식 문서에서 이 범위를 명시한다. Playwright MCP의 origin 제한이나 secrets 치환 역시 실수를 줄이는 장치일 뿐 보안 경계는 아니다.

따라서 기존 세션이 꼭 필요해도 평소 쓰는 프로필 전체를 넘기기보다, 필요한 계정과 탭만 둔 별도 프로필을 사용하는 편이 낫다. 재현 확인에는 `--isolated`를 우선하고, 운영 화면처럼 권한이 큰 세션은 연결 범위를 더 좁혀야 한다. 편의성 비교에서 이 조건을 빼면 Chrome 쪽 장점만 과장된다.

## 연결 편의와 재현성은 반대 방향으로 움직인다

Playwright MCP는 자체 브라우저를 실행하므로 사용 중인 Chrome 상태에 덜 의존한다. CI에서 headless로 돌리기도 쉽고, 같은 초기 상태를 반복하기 좋다.

Chrome DevTools MCP는 실행 중인 Chrome과 연결 상태에 의존한다. 내가 보고 있던 페이지를 그대로 넘겨받는 편리함만큼 환경의 영향도 받는다. Chrome 136부터는 평소 쓰는 프로필을 원격 디버깅 포트로 그대로 여는 방식도 제한됐다.[^chrome-remote-debugging]

| 관점 | Chrome DevTools MCP | Playwright MCP |
|---|---|---|
| 환경 재현성 | 사용자 환경에 따라 달라짐 | 격리하기 쉬움 |
| 실제 세션 관찰 | 강함 | 기본 프로필과 분리 |
| CI 통합 | 까다로움 | headless에 적합 |
| 탐색적 디버깅 | 적합 | 초기 세팅이 필요할 수 있음 |
| 회귀 E2E | 환경 일관성이 약함 | 적합 |

## 내가 나눈 역할

두 도구 중 하나를 지우기보다 역할을 나눴다.

- UI 변경 결과를 동일 조건과 여러 브라우저에서 비교한다: Playwright MCP
- 로그인된 화면과 실제 네트워크 흐름을 탐색한다: Chrome DevTools MCP
- Lighthouse와 성능 트레이스를 본다: Chrome DevTools MCP
- CI에서 반복 실행한다: Playwright MCP

화면 하나를 확인하는 데 어느 쪽이든 쓸 수 있다. 선택 기준은 "브라우저를 조작할 수 있나"가 아니라 **실제 세션을 관찰하려는가, 재현 가능한 환경을 만들려는가**였다. 이 기준으로 나누니 두 도구는 경쟁보다 보완 관계에 가까웠다.

[^chrome-remote-debugging]: Chrome 136부터 기본 사용자 데이터 디렉터리에는 `--remote-debugging-port`와 `--remote-debugging-pipe`가 적용되지 않는다. 기존 세션이 필요하면 별도 프로필이나 도구가 안내하는 auto-connect 방식을 확인해야 한다.
