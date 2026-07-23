---
title: "Language Server Protocol(LSP)로 자동완성과 정의 이동이 동작하는 방식"
slug: "language-server-protocol"
description: "에디터와 언어 분석기를 JSON-RPC로 분리한 구조를 메시지 예제로 설명하고, IntelliJ와 Claude Code 연동이 LSP 서버가 아닌 이유를 구분한다."
kind: "tech"
category: "ide"
publishedAt: "2026-04-08"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["lsp", "developer-tools", "intellij", "protocol"]
series:
  slug: "claude-code-lsp"
  title: "Claude Code와 LSP"
  order: 3
relatedPosts: ["intellij-shortcuts"]
references:
  - title: "Language Server Protocol Specification 3.18"
    url: "https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/"
  - title: "Language Server Protocol — langserver.org"
    url: "https://langserver.org/"
  - title: "LSP Overview — Microsoft"
    url: "https://microsoft.github.io/language-server-protocol/overviews/lsp/overview/"
  - title: "Red Hat, Codenvy and Microsoft Collaborate on Language Server Protocol"
    url: "https://www.redhat.com/en/about/press-releases/red-hat-codenvy-and-microsoft-collaborate-language-server-protocol"
  - title: "Language Server Protocol — IntelliJ Platform Plugin SDK"
    url: "https://plugins.jetbrains.com/docs/intellij/language-server-protocol.html"
  - title: "Open-Sourcing the LSP Client API in IntelliJ IDEA 2026.2"
    url: "https://blog.jetbrains.com/platform/2026/06/open-sourcing-the-lsp-client-api-in-intellij-idea-2026-2/"
  - title: "Claude Code — JetBrains IDEs"
    url: "https://code.claude.com/docs/en/jetbrains"
  - title: "Claude Code — Plugins reference"
    url: "https://code.claude.com/docs/en/plugins-reference"
---

IDE에서 코드를 쓸 때는 자동완성, 정의 이동, 참조 검색, 이름 변경, 즉시 진단을 당연하게 사용한다. jdtls와 IntelliJ 연동을 비교하다 보니 오히려 더 기본적인 질문이 남았다.

> 이 기능들은 누가 계산하고, 에디터와 분석기는 어떻게 대화할까?

그 사이에 있는 표준이 Language Server Protocol, LSP다.

## LSP 이전에는 조합마다 구현이 필요했다

에디터가 Java 자동완성을 지원하려면 에디터 전용 Java 분석 기능이 필요했다. 언어와 에디터가 늘어나면 조합도 곱으로 늘었다.

```text
          Vim    VS Code   Emacs   Sublime
Java       ×        ×        ×        ×
Python     ×        ×        ×        ×
Go         ×        ×        ×        ×
TypeScript ×        ×        ×        ×
```

에디터가 M개이고 언어가 N개라면 최대 M × N개의 통합이 필요하다. 같은 언어라도 에디터마다 구현과 품질이 달랐다.

## 에디터와 언어 사이에 표준을 둔다

2016년 Microsoft, Red Hat, Codenvy가 함께 공개한 LSP의 핵심은 단순했다. **에디터와 언어 분석 엔진 사이의 통신 규약을 하나로 맞춘다.**

```text
Vim ─────┐                    ┌── jdtls (Java)
VS Code ─┤                    ├── pyright (Python)
Emacs ───┼── [LSP 프로토콜] ──┼── gopls (Go)
Sublime ─┘                    └── TypeScript 서버
```

에디터는 LSP 클라이언트를 한 번 구현하고, 언어 분석기는 LSP 서버를 한 번 구현한다. M × N 문제가 M + N에 가까워진다.

## 실제 메시지는 JSON-RPC로 오간다

LSP는 JSON-RPC 기반의 클라이언트-서버 모델이다. 에디터는 `textDocument/didOpen`과 `textDocument/didChange` 알림으로 문서를 언어 서버에 미리 동기화한다. 사용자가 `orderRepository.`까지 입력해 자동완성을 요청하면, completion 요청에는 문서 URI와 커서 위치가 들어간다. 이때 `line`과 `character`는 모두 0부터 센다.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "textDocument/completion",
  "params": {
    "textDocument": { "uri": "file:///OrderService.java" },
    "position": { "line": 42, "character": 18 }
  }
}
```

언어 서버는 그 위치에서 가능한 메서드 목록을 반환한다.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "isIncomplete": false,
    "items": [
      { "label": "findById", "kind": 2 },
      { "label": "save", "kind": 2 }
    ]
  }
}
```

요청과 응답의 `id`가 같으므로 에디터는 둘을 연결할 수 있다. completion item의 `kind`는 정수 enum이며, `kind: 2`는 메서드를 뜻한다. 에디터는 Java 타입 시스템을 직접 구현하지 않고 받은 후보를 UI에 그린다. 실제 문법과 타입 분석은 jdtls 같은 언어 서버의 몫이다.

| LSP 메시지 | 유형 | 개발자가 보는 기능 |
|---|---|---|
| `textDocument/completion` | 클라이언트 → 서버 요청 | 자동완성 |
| `textDocument/definition` | 클라이언트 → 서버 요청 | 정의 이동 |
| `textDocument/references` | 클라이언트 → 서버 요청 | 사용처 검색 |
| `textDocument/hover` | 클라이언트 → 서버 요청 | 타입과 문서 표시 |
| `textDocument/rename` | 클라이언트 → 서버 요청 | 심볼 이름 변경 |
| `textDocument/publishDiagnostics` | 서버 → 클라이언트 알림 | 서버가 밀어주는 진단 |
| `textDocument/diagnostic` | 클라이언트 → 서버 요청 | 클라이언트가 당겨오는 진단 |

`textDocument/diagnostic` 같은 pull 방식 진단도 이후 사양에 추가됐다.[^pull-diagnostic] 프로토콜은 한 번 완성되고 멈춘 규격이 아니다.

## 개발자가 체감하는 변화

### 에디터 선택이 쉬워졌다

같은 언어 서버를 여러 에디터에서 재사용할 수 있다. 특정 에디터를 벗어날 때 언어 분석 전체를 포기하지 않아도 된다. 다만 "같은 서버"가 곧 "완전히 같은 경험"을 뜻하지는 않는다. 클라이언트가 어떤 기능을 구현하고 UI로 어떻게 보여주는지도 품질에 영향을 준다.

### 새 도구도 기존 분석기를 쓸 수 있다

새로운 에디터나 AI 코딩 도구는 LSP 클라이언트를 구현해 기존 언어 서버와 연결할 수 있다. Claude Code가 jdtls 플러그인으로 정의 이동과 참조 검색을 사용하는 것도 이 분리 덕분이다.

### 언어 지원의 개선이 여러 클라이언트로 퍼진다

언어 서버의 분석 품질이 좋아지면 이를 사용하는 여러 도구가 함께 혜택을 받는다. 에디터마다 언어 분석기를 처음부터 다시 만드는 것보다 개선이 집중된다.

## IntelliJ는 어디에 놓일까

IntelliJ는 LSP가 널리 쓰이기 전부터 자체 언어 분석 엔진을 개발해 왔다. Java 지원도 기본적으로 LSP 서버에 의존하지 않는다.

JetBrains가 제공하는 LSP 지원의 방향을 헷갈리기 쉽다. IntelliJ가 외부에 언어 서버로 열리는 것이 아니라, 플러그인이 외부 언어 서버를 IntelliJ에 붙일 수 있도록 클라이언트 API를 제공한다.

이 글을 처음 정리한 것은 2026년 4월이고, 다음 내용은 같은 해 6월 JetBrains 발표를 확인한 뒤 보충했다. JetBrains는 2026.2 릴리스 주기에 LSP 클라이언트 API를 오픈소스로 공개할 계획이라고 밝혔다.[^jetbrains-lsp-update] 이 발표도 IntelliJ가 외부 언어 서버를 받아들이는 클라이언트라는 방향을 분명히 보여줬다.

Claude Code의 `/ide` 연결 역시 LSP가 아니다. JetBrains 플러그인의 별도 로컬 연동을 통해 IDE 진단을 읽는다. IntelliJ의 자체 분석 엔진을 LSP 서버처럼 외부에 노출하는 구조로 보면 안 된다.

## M × N을 줄였다는 것의 의미

**LSP가 줄인 것은 에디터와 언어 분석기의 강한 결합이지, 모든 에디터 경험의 차이가 아니다.** 이 분리 덕분에 기존 언어 분석기를 에디터뿐 아니라 터미널 도구와 AI 에이전트에서도 재사용할 수 있다. 내가 jdtls를 별도 도구로 설치해 쓸 수 있었던 배경도 여기에 있었다.

[^pull-diagnostic]: 클라이언트가 진단을 요청하는 pull 방식은 LSP 3.17에서 추가됐다.
[^jetbrains-lsp-update]: JetBrains는 관련 작업을 2026.1.4 안정 버전에도 반영할 계획이며, 공개 전 `LspServer` 계열 이름을 `LspClient`로, provider를 `LspIntegrationProvider`로 바꿀 예정이라고 설명했다.
