---
title: "Claude Code 설정 범위 — User·Project·Local·Managed 비교"
slug: "claude-code-settings-scope"
description: "개인 공통 설정, 저장소 공유 설정, 로컬 실험과 조직 정책을 플러그인·스킬·Hook의 사용 대상에 따라 배치하는 기준을 제시한다."
kind: "note"
category: "ai"
publishedAt: "2026-04-06"
updatedAt: "2026-07-23"
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

Claude Code 플러그인, 스킬, Hook을 설정할 때마다 `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json` 중 어디에 둘지 잠깐 멈췄다.

아래 내용은 원본을 작성한 2026년 4월의 공식 문서를 기준으로 정리한 것이다.

## 네 가지 범위

| 범위 | 대표 경로 | Git 공유 | 용도 |
|---|---|---:|---|
| User | `~/.claude/settings.json` | X | 내 공통 설정 |
| Project | `.claude/settings.json` | O | 저장소의 공통 설정 |
| Local | `.claude/settings.local.json` | X | 저장소별 개인 설정 |
| Managed | OS별 관리 경로 | 조직 배포 | 조직이 강제하는 정책 |

설정마다 병합 방식이 같지는 않다.[^settings-precedence]

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

세부 경로는 버전에 따라 바뀔 수 있다. **파일 경로를 외우기 전에 누가 어떤 저장소에서 써야 하는지 정하면 범위는 자연스럽게 따라온다.**

[^settings-precedence]: 2026년 4월 당시 일반 설정의 우선순위는 `Managed > CLI 인수 > Local > Project > User`였다. 권한처럼 여러 범위의 규칙을 합치는 항목도 있어 모든 설정이 단순히 덮어써지는 것은 아니다.
