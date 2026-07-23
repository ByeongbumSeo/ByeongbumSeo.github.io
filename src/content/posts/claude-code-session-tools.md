---
title: "Claude Code의 /branch, /fork, /btw — 긴 세션에서 곁다리 작업을 다루는 세 가지 도구"
slug: "claude-code-session-tools"
description: "2026년 4월 Claude Code의 /branch, 당시 /fork, /btw를 비교하고 이후 /fork와 /subtask의 역할이 바뀐 과정을 보충한다."
kind: "tech"
publishedAt: "2026-04-29"
draft: false
deprecated: false
outdated: false
tags: ["claude-code", "ai-agent", "context-engineering"]
relatedPosts: []
references:
  - title: "Claude Code — Create custom subagents"
    url: "https://code.claude.com/docs/en/sub-agents"
  - title: "Claude Code — Fork the current conversation"
    url: "https://code.claude.com/docs/en/sub-agents#fork-the-current-conversation"
  - title: "Claude Code — How forks differ from named subagents"
    url: "https://code.claude.com/docs/en/sub-agents#how-forks-differ-from-named-subagents"
  - title: "Claude Code — Side questions with /btw"
    url: "https://code.claude.com/docs/en/interactive-mode#side-questions-with-%2Fbtw"
  - title: "Claude Code — Choose between subagents and main conversation"
    url: "https://code.claude.com/docs/en/sub-agents#choose-between-subagents-and-main-conversation"
  - title: "Claude Code — Commands reference"
    url: "https://code.claude.com/docs/en/commands"
  - title: "Claude Code — Built-in subagents"
    url: "https://code.claude.com/docs/en/sub-agents#built-in-subagents"
  - title: "Claude Code — Run subagents in foreground or background"
    url: "https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background"
  - title: "Claude Code — Turn off agent view"
    url: "https://code.claude.com/docs/en/agent-view#turn-off-agent-view"
  - title: "Effective context engineering for AI agents"
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
  - title: "Claude Code CHANGELOG"
    url: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md"
  - title: "Claude Code v2.1.161"
    url: "https://github.com/anthropics/claude-code/releases/tag/v2.1.161"
  - title: "Claude Code v2.1.212"
    url: "https://github.com/anthropics/claude-code/releases/tag/v2.1.212"
---

Claude Code로 긴 작업을 이어가다 보면 메인 문제와 직접 관계없는 일이 끼어든다. 방금 만든 파서의 테스트 케이스를 따로 뽑거나, 앞에서 본 설정 이름을 확인하거나, 현재 접근과 다른 가설을 시험하는 일이다.

전부 메인 대화에서 처리하면 기록이 계속 불어난다. 반대로 새 에이전트를 깨끗한 컨텍스트로 시작하면 지금까지 쌓은 코드 이해와 의사결정을 다시 설명해야 한다.

2026년 4월 29일, 이 곁다리 작업을 다루는 Claude Code의 `/branch`, 당시의 `/fork`, `/btw`를 정리했다. 이후 6월과 7월에 `/fork`의 동작과 이름이 다시 바뀌었다. 원래 비교는 그대로 두고, 바뀐 내용은 아래 버전 표에 보충했다.

## 먼저 /fork라는 이름이 계속 움직였다

검색 결과마다 `/fork` 설명이 달랐던 이유는 실제 의미가 바뀌었기 때문이다.

### 4월 29일에 정리한 범위

| 버전 | 당시 `/fork`의 의미 |
|---|---|
| v2.1.77 이전 | 현재 대화에서 새 가지를 만드는 명령 |
| v2.1.77 | 기능 이름이 `/branch`로 바뀌고 `/fork`는 alias로 남음 |
| v2.1.117 | 플래그나 단계적 배포로 활성화되면, 전체 컨텍스트를 상속한 in-session subagent 실행 |

### 6월과 7월에 보충한 변화

| 버전 | 바뀐 동작 |
|---|---|
| v2.1.161 | forked subagent가 기본으로 활성화되고 `/fork`가 in-session 작업자를 실행 |
| v2.1.212 | Agent view가 켜진 기본 구성에서는 `/fork`가 별도 백그라운드 세션을 만들고, 기존 in-session 동작은 `/subtask`로 이동 |

Agent view를 끈 구성은 예외다. 이때는 `/subtask`를 사용할 수 없고, `/fork`가 계속 forked subagent를 실행한다. 따라서 현재도 명령 이름만 보고 동작을 단정하기보다 설정과 버전을 함께 봐야 한다.

이 글의 비교 대상은 이름보다 다음 세 가지 메커니즘이다.

- `/branch`: 사용자가 새 대화 가지로 이동한다.
- 컨텍스트를 상속한 in-session 작업자: 4월에는 `/fork`, v2.1.212 이후 기본 구성에서는 `/subtask`다.
- `/btw`: 메인 컨텍스트를 읽고 한 번 답하지만 도구를 쓰지 않고 본 대화에 기록을 남기지 않는다.

v2.1.212 이후 기본 구성의 `/fork`는 첫 번째나 두 번째와도 다르다. 현재 대화를 복사한 별도 세션이 백그라운드에서 실행되고, 메인은 그대로 계속된다.

## /branch — 내가 다른 가지로 이동한다

`/branch`는 현재 시점의 대화를 복제하고 사용자를 새 가지로 옮긴다. 원본 세션은 남아 있고 당시에는 `/resume`으로 돌아갈 수 있었다.

```text
[원본 대화]──────●
                 │
                 └── [새 가지, 현재 위치] ──● ──●
```

Git으로 비유하면 분기를 만들고 바로 체크아웃하는 것에 가깝다. 두 접근을 동시에 실행하는 도구는 아니다.

잘 맞는 경우는 다음과 같았다.

- 지금 가설 대신 다른 디버깅 가설을 끝까지 시험한다.
- 큰 리팩터링을 별도 대화에서 시도하고 원본으로 돌아올 여지를 둔다.
- 같은 분기점에서 여러 접근을 직렬로 비교한다.

결과가 별도 대화로 남기 때문에 두 가지 결론을 자동으로 합쳐 주지는 않는다.

## forked subagent와 /subtask — 작업자가 가지를 친다

4월에 `/fork`로 실행했던 메커니즘은 v2.1.212 이후 기본 구성에서 `/subtask`라는 이름을 쓴다. 일반 subagent처럼 빈 컨텍스트에서 시작하지 않고, 부모의 시스템 프롬프트, 도구, 모델, 메시지 기록을 상속한다. 메인이 이미 파악한 코드와 합의를 다시 설명하지 않아도 되는 것이 장점이었다.

```text
[메인 세션] ─────●────────────●────
                 │            ▲
                 ▼            │ 최종 결과
          [컨텍스트를 상속한 작업]
                 ├── 탐색과 도구 실행
                 └── 결과 정리
```

도구 실행 과정 전체 대신 최종 결과만 메인에 합류해, 본 작업을 계속하면서 독립된 곁다리를 병렬로 처리할 수 있었다. 시스템 프롬프트와 도구 정의가 부모와 같아 첫 요청에서 프롬프트 캐시도 재사용할 수 있다고 문서는 설명했다.

하지만 컨텍스트 상속은 장점만은 아니었다. 부모가 잘못된 가정을 갖고 있으면 분기된 작업도 같은 가정에서 출발한다.

```text
현재까지의 이해가 자산인 작업   → 컨텍스트 상속
현재까지의 가정을 의심하는 리뷰 → 깨끗한 subagent
```

보안 감사나 적대적 리뷰처럼 기존 결론을 의심해야 하는 작업에는 새로운 관점이 더 중요했다. 부모 컨텍스트가 이미 비대하면 상속한 작업도 처음부터 비대하다는 한계도 있었다.

## /btw — 이미 아는 것에 답만 받는다

`/btw`는 반대 방향이었다. 메인 대화 전체를 볼 수 있지만 도구는 없었다. 새 파일을 읽거나 코드를 검색할 수 없고, 이미 대화에 나온 내용을 바탕으로 한 번 답한다.

```text
/btw 아까 확인한 설정 파일 이름이 뭐였지?
```

당시 UI에서는 답을 오버레이로 보여주고 본 대화 기록에는 넣지 않았다. 메인 작업이 진행 중일 때도 짧은 질문을 던질 수 있었다.

잘 맞는 질문:

- 앞에서 본 함수나 설정 이름을 다시 확인한다.
- 이미 읽은 코드의 의미를 짧게 묻는다.
- 기록으로 남길 필요 없는 방향 확인을 한다.

맞지 않는 질문:

- 코드베이스를 새로 탐색해야 한다.
- 결론을 작업 기록에 남겨야 한다.
- 여러 번 대화를 이어가야 한다.

도구가 없다는 제약은 단점이라기보다 사용 목적을 분명하게 했다. 새 사실을 알아내는 도구가 아니라, 컨텍스트에 이미 있는 사실을 잠깐 꺼내는 도구였다.

## 세 가지를 나눈 기준

| 질문 | 선택 |
|---|---|
| 답만 받고 기록은 남기지 않아도 되는가 | `/btw` |
| 본 작업을 멈추고 다른 방향으로 이동할 것인가 | `/branch` |
| 본 작업을 계속하며 같은 문맥의 작업을 병렬로 돌릴 것인가 | `/subtask` 계열, Agent view를 끈 구성에서는 `/fork` |
| 기존 가정을 의심할 깨끗한 관점이 필요한가 | 일반 subagent |

긴 세션에서 곁다리를 분리하는 이유는 토큰 비용만이 아니었다. 중요하지 않은 대화와 실행 로그가 쌓일수록 정작 중요한 제약을 다시 찾기 어려워진다. 메인 세션을 깨끗하게 유지하는 일은 비용 관리이면서 출력 품질 관리였다.

명령어 이름은 이후에도 바뀔 수 있다. 그래도 "내가 새 가지로 갈지", "같은 문맥을 가진 작업자를 보낼지", "답만 잠깐 받을지"라는 구분은 오래 남을 만한 판단 기준이었다.
