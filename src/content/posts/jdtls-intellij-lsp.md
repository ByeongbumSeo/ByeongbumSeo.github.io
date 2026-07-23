---
title: "Claude Code Java 코드 분석에서 jdtls와 IntelliJ /ide 비교"
slug: "jdtls-intellij-lsp"
description: "IntelliJ /ide는 IDE 진단을 재사용하고 jdtls는 정의·참조·호출 계층까지 별도 인덱싱한다는 차이로 선택 기준을 세운다."
kind: "note"
category: "ide"
publishedAt: "2026-04-08"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["claude-code", "java", "intellij", "lsp"]
series:
  slug: "claude-code-lsp"
  title: "Claude Code와 LSP"
  order: 2
relatedPosts: ["intellij-shortcuts"]
references:
  - title: "Claude Code — JetBrains IDEs"
    url: "https://code.claude.com/docs/en/jetbrains"
  - title: "Claude Code — Discover and install prebuilt plugins"
    url: "https://code.claude.com/docs/en/discover-plugins"
  - title: "jdtls-lsp — Claude Plugins Official"
    url: "https://github.com/anthropics/claude-plugins-official/tree/main/plugins/jdtls-lsp"
  - title: "Eclipse JDT Language Server"
    url: "https://github.com/eclipse-jdtls/eclipse.jdt.ls"
  - title: "IntelliJ Platform Plugin SDK — Language Server Protocol"
    url: "https://plugins.jetbrains.com/docs/intellij/language-server-protocol.html"
---

IntelliJ와 Claude Code를 `/ide`로 연결해 진단을 공유할 수 있다는 사실을 알고 나니 다음 질문이 생겼다. Claude Code에는 Java용 `jdtls` 플러그인도 있는데, IntelliJ를 쓰는 상황에서 이것까지 설치해야 할까?

처음에는 `/ide`가 IntelliJ의 언어 기능을 모두 넘겨주므로 jdtls는 중복이라고 생각했다. 공식 문서를 읽고 나서 이 전제가 틀렸다는 것을 알았다.

## jdtls가 제공하는 것

jdtls는 Eclipse JDT Language Server다. Java 프로젝트를 직접 읽고 인덱싱한 뒤 LSP로 진단과 코드 탐색 기능을 제공한다.

- 편집 뒤 오류와 경고 수집
- 정의와 구현으로 이동
- 참조 검색
- hover 타입 정보
- 심볼과 호출 계층 탐색

Claude Code의 code intelligence 플러그인은 언어 서버 실행 방법을 연결하고, 모델이 이 탐색 기능을 사용할 수 있게 한다.

## IntelliJ /ide는 LSP가 아니었다

`/ide`로 IntelliJ에 연결하면 IDE의 언어 기능 전체가 들어올 것이라고 생각했다. 2026년 4월 당시 공식 문서에서 모델에 노출된 도구를 확인하니 읽기 전용 진단 조회 하나였다.

```text
mcp__ide__getDiagnostics
```

정의 이동, 참조 검색, 호출 계층은 모델에 노출되지 않았다. 연결 방식도 LSP가 아니었다. JetBrains 플러그인이 로컬 MCP 서버를 띄우고 Claude Code CLI가 인증해 접속하는 별도의 통로였다.

IntelliJ 자체도 "언어 서버"로 동작하는 것이 아니다. IDE 내부의 인덱싱과 정적 분석 엔진을 사용한다. JetBrains가 제공하는 LSP API는 외부 언어 서버를 IntelliJ 플러그인에 붙이는 **클라이언트 방향**이다.

둘을 같은 기능의 구현체로 비교한 것부터 잘못이었다.

| | jdtls 플러그인 | IntelliJ `/ide` |
|---|---|---|
| 프로토콜 | LSP | JetBrains 연동용 로컬 MCP |
| 분석 엔진 | Eclipse JDT LS | IntelliJ 자체 엔진 |
| 모델이 받는 기능 | 진단과 코드 탐색 | IDE 진단 조회 |
| 실행 | 별도 프로세스 | 실행 중인 IDE 활용 |
| 인덱싱 | 프로젝트를 별도로 인덱싱 | IDE의 기존 인덱스 사용 |

## jdtls를 하나 더 띄우는 비용

jdtls는 설치 파일로 끝나지 않는다. Java 프로젝트를 메모리에 올리고 계속 인덱싱하는 별도 프로세스다. 당시 런처는 초기 힙을 1GB로 잡고 시작 대기 시간도 120초로 두고 있었다.[^jdtls-resource]

IntelliJ가 이미 같은 프로젝트를 인덱싱한 상태라면 분석 엔진을 하나 더 띄우는 셈이다.

```text
IntelliJ                   jdtls
Java 인덱싱                Java 인덱싱
Gradle 모델 해석           Gradle 모델 해석
기존 IDE 메모리             별도 JVM 메모리
```

이 비용은 무조건 낭비일까? 코드 탐색이 필요하다면 그렇지 않다.

## /ide는 싸지만 주는 것도 다르다

IntelliJ가 이미 열려 있다면 `/ide` 연결의 추가 인덱싱 비용은 거의 없다. IDE가 계산해 둔 진단을 가져오기 때문이다. MyBatis처럼 IntelliJ 플러그인이 만들어 낸 진단도 함께 볼 수 있다는 장점이 있다.

반면 Claude Code가 참조를 역추적하거나 호출 계층을 따라가야 한다면 `/ide`만으로는 부족했다. 이때 jdtls의 별도 인덱싱은 중복 비용이 아니라 코드 탐색 기능을 얻기 위한 비용이다.

| 필요한 것 | 선택 |
|---|---|
| IntelliJ의 진단만 확인 | `/ide` |
| 정의·참조·호출 계층 탐색 | jdtls |
| IDE 없는 터미널에서 Java 분석 | jdtls |
| 간단한 검색으로 충분 | `/ide`와 텍스트 검색 |

## "중복인가"보다 "무엇이 필요한가"

겹치는 기능은 진단뿐이었다. **진단만 필요하면 `/ide`, 정의·참조·호출 계층까지 찾아야 하면 jdtls를 선택한다.** IDE가 없는 환경에서는 jdtls가 언어 분석을 맡는다.

[^jdtls-resource]: 당시 옵션은 최대 힙을 뜻하는 `-Xmx1G`가 아니라 초기 힙을 뜻하는 `-Xms1G`였다.
