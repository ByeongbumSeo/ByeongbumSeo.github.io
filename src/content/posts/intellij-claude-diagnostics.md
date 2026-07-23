---
title: "Claude Code와 IntelliJ 진단 연결 — 내장 터미널 자동 연결과 /ide"
slug: "intellij-claude-diagnostics"
description: "내장 터미널에서는 IDE 연결이 자동이고 외부 터미널에서는 /ide가 필요한 차이를 진단 공유 동작으로 풀어낸다."
kind: "note"
publishedAt: "2026-03-26"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["claude-code", "intellij", "developer-tools"]
series:
  slug: "claude-code-lsp"
  title: "Claude Code와 LSP"
  order: 1
relatedPosts: ["intellij-shortcuts"]
references:
  - title: "Claude Code — JetBrains IDEs"
    url: "https://code.claude.com/docs/en/jetbrains"
  - title: "Claude Code — Permissions"
    url: "https://code.claude.com/docs/en/permissions#read-and-edit"
---

## IntelliJ에서만 보이던 진단

Claude Code를 iTerm, Ghostty, IntelliJ 내장 터미널에서 번갈아 사용하던 중 이상한 차이를 발견했다. IntelliJ 터미널에서 실행했을 때만 파일 수정 뒤 IDE의 진단 오류가 자동으로 전달됐다.

```text
<new-diagnostics>
ExampleService.java:
  ✘ [Line 153:7] Cannot resolve symbol 'ExampleType'
</new-diagnostics>
```

별도 프롬프트를 쓰지 않아도 import 누락 같은 오류를 바로 보고 고쳤다. 외부 터미널에서는 같은 프로젝트를 열어두고도 이 동작이 보이지 않았다. 처음에는 IntelliJ 터미널만 특별한 분석 기능을 제공한다고 생각했다.

## 원인은 JetBrains 플러그인의 연결 방식이었다

2026년 3월 당시 Claude Code의 JetBrains 문서를 확인하니, 플러그인은 IDE의 진단 오류를 Claude Code에 공유하는 기능을 제공하고 있었다. IDE의 diff 뷰어를 사용하고, 현재 선택 영역을 문맥으로 전달하는 기능도 같은 연동에 포함됐다.

핵심은 터미널의 종류가 아니라 **IDE와 CLI가 연결됐는지**였다.

### IDE 내장 터미널

```bash
claude
```

IDE의 통합 터미널에서 실행하면 연동이 자동으로 활성화됐다. 내가 본 "IntelliJ 터미널에서만 되는 기능"은 사실 자동 연결의 결과였다.

### 외부 터미널

```text
/ide
```

iTerm이나 Ghostty 같은 외부 터미널에서도 `/ide`로 실행 중인 JetBrains IDE에 연결하면 같은 진단 공유를 사용할 수 있었다. 나는 이 명령을 모르고 있었기 때문에 터미널 자체의 차이라고 잘못 짚었다.

## 연결할 때 확인할 것

- Claude Code CLI와 JetBrains 플러그인은 별도 설치다. 플러그인을 설치한 뒤 IDE를 완전히 다시 시작해야 할 수 있다.
- 외부 터미널에서는 IDE가 연 프로젝트와 같은 루트에서 Claude Code를 실행해야 파일 문맥이 맞는다.
- 선택 영역이나 열린 파일을 자동 공유하고 싶지 않다면 `Read` deny rule로 민감 파일을 제외할 수 있다.

당시 문서에서 모델에 직접 노출되는 IDE 도구는 읽기 전용 진단 조회였다. IDE가 가진 모든 코드 탐색 기능을 Claude Code에 통째로 넘기는 구조는 아니었다. 이 차이는 다음에 jdtls와 `/ide`를 비교하면서 더 분명해졌다.

## 내가 놓친 한 줄

```text
IDE 터미널   → 자동 연결
외부 터미널  → /ide로 연결
```

"IntelliJ 터미널만 에러를 감지한다"가 아니라 "IntelliJ 터미널에서는 연결이 자동으로 됐다"가 정확한 설명이었다. 원인을 알고 나니 익숙한 외부 터미널을 포기할 이유도 사라졌다.
