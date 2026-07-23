---
title: "Claude Code의 설정 레벨 — User, Project, Local은 뭐가 다를까?"
slug: "claude-code-settings-scope"
description: "Claude Code 설정을 User, Project, Local, Managed 범위로 나누고 플러그인·스킬·Hook을 어디에 둘지 정리한다."
kind: "note"
publishedAt: "2026-04-06"
draft: false
deprecated: false
outdated: false
tags: ["claude-code", "configuration", "developer-tools"]
relatedPosts: []
references:
  - title: "Claude Code Settings"
    url: "https://code.claude.com/docs/en/settings"
  - title: "Claude Code Memory"
    url: "https://code.claude.com/docs/en/memory"
  - title: "Claude Code Skills"
    url: "https://code.claude.com/docs/en/skills"
  - title: "Claude Code Hooks"
    url: "https://code.claude.com/docs/en/hooks"
---

Claude Code 플러그인을 설치할 때 범위를 고르는 화면을 보고 매번 잠깐 멈췄다.

```text
User     모든 프로젝트에서 나만
Project  이 저장소를 쓰는 사람과 공유
Local    이 저장소에서 나만
```

스킬과 Hook을 만들 때도 같은 질문이 생겼다. `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json` 중 어디에 둬야 할까?

아래 내용은 원본을 작성한 2026년 4월의 공식 문서를 기준으로 정리한 것이다.

## 네 가지 범위

```text
Managed  조직이 배포하는 강제 정책
User     내 모든 프로젝트
Project  저장소에 커밋해 공유
Local    특정 저장소에서 나만
```

일상적으로 직접 다룬 것은 User, Project, Local 세 가지였다. Managed는 조직이 정책을 배포하는 환경에서 사용됐다.

| 범위 | 대표 경로 | Git 공유 | 용도 |
|---|---|---:|---|
| User | `~/.claude/settings.json` | X | 내 공통 설정 |
| Project | `.claude/settings.json` | O | 저장소의 공통 설정 |
| Local | `.claude/settings.local.json` | X | 저장소별 개인 설정 |
| Managed | OS별 관리 경로 | 조직 배포 | 강제 정책 |

당시 일반 설정의 우선순위는 `Managed > CLI 인수 > Local > Project > User`였다. 권한처럼 여러 범위의 규칙을 합치는 항목도 있으므로, 모든 설정을 단순한 덮어쓰기로 이해하면 안 됐다.

## 플러그인은 누가 써야 하는지로 정한다

- 모든 프로젝트에서 내가 쓰는 도구: User
- 이 저장소의 작업 방식에 필요한 도구: Project
- 팀에 제안하기 전 혼자 시험하는 도구: Local

```json
{
  "enabledPlugins": {
    "example-plugin@example-marketplace": true
  }
}
```

개인 취향인 생산성 플러그인을 Project에 넣으면 다른 사람에게 불필요한 의존성을 만든다. 반대로 프로젝트 검증에 꼭 필요한 플러그인을 User에만 두면 내 환경에서만 우연히 동작한다.

## 스킬은 재사용 범위로 나눈다

```text
~/.claude/skills/<name>/SKILL.md   → 여러 프로젝트에서 쓸 개인 스킬
.claude/skills/<name>/SKILL.md     → 저장소 구조를 아는 프로젝트 스킬
```

설계 리뷰처럼 프로젝트와 무관한 절차는 User 범위가 자연스럽다. 특정 빌드 명령, 데이터 모델, 테스트 규칙을 알아야 하는 스킬은 Project 범위에 두어야 다른 작업자도 같은 전제를 읽을 수 있다.

비밀값이나 개인 계정이 필요한 절차는 Project 스킬에 값을 직접 넣지 않는다. 공개 가능한 흐름만 공유하고 자격 증명은 로컬 환경에서 주입한다.

## CLAUDE.md는 합쳐진다

원본 작성 당시 `CLAUDE.md` 계열은 하나가 다른 하나를 단순히 덮는 것이 아니라 여러 범위의 지침을 함께 읽는 구조였다.

```text
User 지침 + Project 지침 + Local 지침
```

모노레포에서는 상위 디렉터리에 공통 규칙을 두고 하위 프로젝트에 더 구체적인 규칙을 둘 수 있다. 같은 규칙을 여러 파일에 반복하면 충돌하기 쉬우므로, 공통 원칙과 프로젝트별 예외의 경계를 나누는 편이 낫다.

## Hook은 settings.json 안에서 합쳐진다

Hook은 각 범위의 `settings.json`에 둘 수 있다.

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "npm run lint"
      }]
    }]
  }
}
```

구조는 세 단계다.

```text
이벤트(PostToolUse)
  → 어떤 도구에 반응할지(matcher)
    → 무엇을 실행할지(hooks)
```

팀이 반드시 같은 검증을 실행해야 한다면 Project, 내 모든 작업을 기록하는 개인 Audit Hook이라면 User, 특정 저장소에서 실험 중인 Hook이라면 Local에 두었다.

## 한눈에 보는 경로

```text
~/.claude/
├── settings.json
├── CLAUDE.md
├── skills/<name>/SKILL.md
└── agents/

{project}/
├── .claude/
│   ├── settings.json
│   ├── settings.local.json
│   ├── CLAUDE.md
│   ├── skills/<name>/SKILL.md
│   └── agents/
├── CLAUDE.local.md
└── .mcp.json
```

세부 경로는 버전에 따라 바뀔 수 있지만 판단 질문은 단순했다.

```text
팀과 공유해야 한다        → Project
나만 쓰고 모든 프로젝트다 → User
나만 쓰고 이 저장소뿐이다 → Local
조직이 강제해야 한다      → Managed
```

설정을 어디에 둘지 헷갈렸던 이유는 파일이 많아서가 아니라 사용 대상을 먼저 정하지 않았기 때문이었다. 범위부터 정하면 경로는 따라왔다.
