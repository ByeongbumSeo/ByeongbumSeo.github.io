---
title: "Claude Code Hook으로 로컬 활동 로그 만들기"
slug: "claude-code-audit-hook"
description: "SessionStart·PostToolUse·matcher로 세션별 활동 로그를 만들고, matcher 밖 도구의 누락 가능성과 평문 로그 위험까지 함께 짚는다."
kind: "tech"
publishedAt: "2026-04-08"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["claude-code", "ai-agent", "hook", "audit"]
series:
  slug: "claude-code-audit"
  title: "Claude Code Audit"
  order: 1
relatedPosts: []
references:
  - title: "Claude Code Hooks Reference"
    url: "https://code.claude.com/docs/en/hooks"
  - title: "Claude Code Changelog"
    url: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md"
  - title: "Boris Cherny — Hook 활용 예시"
    url: "https://x.com/bcherny/status/2038454343519932844"
  - title: "ByeongbumSeo/claude-audit-logger"
    url: "https://github.com/ByeongbumSeo/claude-audit-logger"
---

## 완료 메시지 뒤의 실행 흔적을 남기고 싶었다

Claude Code에 넓은 실행 권한을 주고 여러 세션을 동시에 돌리면 작업 속도는 빨라진다. 그 대신 작업이 끝난 뒤 이런 의문이 남는다.

> 정확히 어떤 파일을 만들고 고쳤지? 어떤 Git 명령을 실행했고, 실패한 명령은 없었나?

완료 메시지는 결과를 요약할 뿐 실행 과정을 전부 보여주지 않는다. 권한 확인을 건너뛴 세션이라면 실행된 작업이 사실상 암묵적으로 승인된 셈이니, 사후에 무엇이 일어났는지 되짚을 흔적이 필요했다.

처음 실마리는 Claude Code의 공식 Hook 문서였다. `CLAUDE.md`에 적은 문장은 모델이 따라야 할 지침이지만, Hook은 정해진 이벤트에서 코드로 실행된다.

```text
CLAUDE.md = 모델에게 하는 요청
Hook      = 이벤트에 연결된 코드 실행
```

**"편집 뒤 진단을 확인해 달라"는 작업 지침과 "편집 이벤트를 로그에 남긴다"는 실행 규칙은 같은 방식으로 다루지 않았다. 후자는 Hook으로 묶었다.**

문서를 읽으며 구현에 필요한 이벤트부터 골랐다.

- `SessionStart`: 세션별 로그를 준비하고 재개 상태를 구분한다.
- `UserPromptSubmit`: 사용자 요청을 작업 경계로 남긴다.
- `PostToolUse`, `PostToolUseFailure`: 성공하거나 실패한 도구 실행을 결과가 나온 뒤 기록한다.
- `matcher`: 기록할 도구 이름을 제한한다.
- `command` Hook: 표준 입력으로 받은 JSON을 셸 스크립트에서 해석해 로컬 파일에 쓴다.

이 글은 이 기능들을 공부하고 작은 로그 구현에 적용한 기록이다. 2026년 4월의 구현 과정을 바탕으로 쓰고, 같은 해 7월 공식 문서와 공개 플러그인을 다시 대조해 현재의 한계를 보충했다. 프로젝트 이름에는 Audit가 들어가지만, 완전한 보안 감사 시스템을 만들었다는 뜻은 아니다.

## 기록 대상을 좁혔다

처음에는 `PreToolUse`에서 Bash 명령을 모두 기록했다. 곧 두 가지 문제가 드러났다. `ls`, `cat`, `git status` 같은 탐색 기록이 대부분을 차지했고, 파일을 직접 바꾸는 `Write`와 `Edit`는 오히려 빠졌다.

matcher를 `Bash|Write|Edit|MultiEdit`로 넓히고 Bash에서는 읽기 전용으로 판단한 명령만 제외했다. 다만 현재 구현은 문자열 접두사를 검사하므로 `git status && git push` 같은 복합 명령을 놓칠 수 있다. MCP 도구와 matcher에 없는 도구도 기록되지 않는다.

읽기 명령을 어떤 기준으로 제외할지는 별도 글에서 다룬다. 여기서 필요한 경계는 하나다. **이 로그는 Claude Code의 모든 활동이 아니라 설정에서 고른 로컬 도구의 활동을 보여준다.**

## 명령 목록이 아니라 작업 단위가 필요했다

시간순 로그만 보면 어떤 사용자 요청 때문에 실행된 작업인지 알기 어렵다. `UserPromptSubmit` Hook을 추가해 프롬프트마다 구분선을 넣었다.

```text
=== [2026-04-07 14:30:00] 조회 메서드를 추가해 ===
[2026-04-07 14:30:12] [EDIT] src/main/java/.../ExampleService.java
[2026-04-07 14:30:25] [BASH] ./gradlew test
[2026-04-07 14:30:42] [BASH] git commit -m "feat: add query method"

=== [2026-04-07 14:35:00] 테스트를 보강해 ===
[2026-04-07 14:35:10] [CREATE] src/test/.../ExampleServiceTest.java
[2026-04-07 14:35:30] [BASH] ./gradlew test
```

여기서 `[CREATE]`는 당시 플러그인이 `Write` 호출에 붙인 라벨일 뿐이다. `Write`는 기존 파일을 덮어쓸 수도 있으므로 실제 변경 종류를 보장하지 않는다.

이제 "내가 무엇을 요청했고 선택된 도구에서 무엇이 실행됐는지"가 한 덩어리로 보였다.

## 여러 세션의 로그를 어떻게 나눌까

여러 터미널에서 동시에 세션을 열면 로그 하나에 서로 다른 작업이 섞인다. Hook 입력으로 전달되는 `session_id`를 파일명에 써서 세션별로 분리했다.

```text
~/.claude/audit-logs/
├── abc123.log
├── def456.log
└── ...
```

재개한 세션도 고려해야 했다. `SessionStart`의 `.source`가 `resume`이면 같은 로그에 재개 마커를 남기는 방식으로 시작했다.

```text
--- Resumed: 2026-04-04 09:00:00 ---
```

기존 로그가 없으면 새 로그를 만들도록 대비했다.[^resume-session-id] 파일명에 날짜를 넣지 않고 각 엔트리에 날짜를 넣어 자정을 넘긴 세션도 한 파일에 남겼다.

## 실행 전이 아니라 실행 후를 기록한다

초기 구현은 `PreToolUse`였다. 그런데 권한에서 거부됐거나 실제 실행 전에 중단된 명령도 로그에 남았다. 감사 로그에서 알고 싶은 것은 "하려던 일"보다 "실제로 실행된 일"이었다.

그래서 `PostToolUse`와 `PostToolUseFailure`로 옮겼다.

```text
[14:30:25] [BASH] ./gradlew test
[14:30:50] [BASH:FAIL] rm some-file.txt
[14:31:05] [EDIT] src/main/.../ExampleService.java
```

실패에는 `:FAIL`을 붙였다. 거부된 명령은 남지 않고, 실행됐다가 실패한 작업은 구분된다. 원본을 구현할 때는 Hook 입력에 소요 시간이 없어 시작 시각을 별도로 보관해야 했다. 복잡도에 비해 얻는 가치가 작아 이 기능은 넣지 않았다.

최신 버전에서는 Hook 입력의 `duration_ms`로 별도 시작 시각 파일 없이 도구 실행 시간을 기록할 수 있다.[^duration-ms]

## 쌓인 로그는 필요할 때만 읽는다

매 응답이 끝날 때 자동으로 감사 결과를 붙이는 방식도 생각했다. 하지만 매 턴 로그가 끼어드는 것은 금방 번거로워졌다. 조회는 수동 스킬로 분리했다.

- `/audit`: 마지막 프롬프트 이후, 방금 작업한 내용
- `/audit session`: 현재 세션 전체
- `/audit today`: 오늘 실행된 여러 세션의 기록
- `--fail`, `--success`: 실행 결과 필터

로깅과 조회를 분리하니 평소에는 조용하고, 의심이 생겼을 때만 비용을 내고 로그를 읽을 수 있었다.

## command Hook의 비용은 어디서 생길까

Audit Hook은 셸에서 JSON을 파싱하고 파일에 한 줄을 덧붙이는 `command` 타입이다. 모델 추론을 호출하는 `prompt`나 `agent` 타입과 달리, 로깅 자체에는 모델 토큰이 들지 않는다.

```text
command  → 외부 프로세스 실행
http     → 외부 서버에 요청
mcp_tool → 연결된 MCP 서버의 도구 호출
prompt   → 모델이 판단
agent    → 별도 에이전트 실행
```

`async: true`는 Hook을 백그라운드에서 실행해 다음 작업을 막지 않게 한다. 대신 이미 실행된 작업을 차단하거나 되돌릴 수는 없다.[^async-hook] 이 Hook이 조용한 이유는 async라서가 아니라, stdout이나 컨텍스트 필드로 아무것도 보내지 않고 파일에만 쓰기 때문이다.

실제 토큰은 `/audit`으로 로그를 읽을 때 발생한다. 단순 기록에 LLM 판단을 붙이지 않은 이유도 여기에 있다.

토큰을 쓰지 않는다고 안전한 코드는 아니다. 공식 문서는 command Hook이 현재 시스템 사용자와 같은 권한으로 실행되어, 그 사용자가 접근할 수 있는 파일을 읽거나 수정하고 삭제할 수도 있다고 경고한다. Hook 입력을 그대로 신뢰하지 말고 검증·정제하며, 셸 변수를 인용하고 스크립트에는 절대 경로를 쓰라는 지침도 함께 제시한다.

이 구현에서도 `session_id`를 허용한 문자만 남기고 경로 변수를 인용했다. 그래도 Hook 설치는 실행 파일을 신뢰하는 일이다. 다른 플러그인과 마찬가지로 스크립트 내용을 먼저 확인해야 한다.

## 로그 자체도 민감한 데이터가 된다

`UserPromptSubmit`으로 받은 프롬프트 일부와 Bash 명령은 로컬 로그에 평문으로 저장된다. 자동 마스킹이나 암호화는 없다. 프롬프트에 붙여 넣은 식별 정보나 명령 인자에 들어간 토큰이 있다면 로그에도 남을 수 있다. 파일 경로만으로 프로젝트 구조를 추정할 가능성도 있다.

로컬 파일이라는 사실만으로 안전해지지는 않는다. 접근 권한과 보관 기간을 따로 관리하고, 비밀값이 포함된 프롬프트나 명령을 남기지 않는 습관이 필요하다. 이 제약 때문에 이 플러그인은 보안 이벤트의 완전한 증적보다, 작업 뒤 선택된 활동을 찾아보는 개인용 기록에 가깝다.

## 최종 구조와 공개 플러그인

처음 개인 설정으로 만들었던 구조는 다음과 같았다.

```text
~/.claude/hooks/
├── audit-session-init.sh
├── audit-task-marker.sh
└── audit-logger.sh

~/.claude/audit-logs/
└── {sessionId}.log

~/.claude/skills/audit/
└── SKILL.md
```

이후 이 구조를 [claude-audit-logger](https://github.com/ByeongbumSeo/claude-audit-logger) 플러그인으로 공개했다. 패키징하면서 공유 포인터 파일을 없애고, `SessionStart`에서 `CLAUDE_ENV_FILE`에 세션별 환경변수를 기록했다. 이 파일의 `export` 문은 이후 Bash 명령을 실행하기 전에 읽히므로, 각 세션은 자기 로그 경로를 사용할 수 있다. 여러 세션이 한 파일을 덮어쓰던 문제가 사라졌다.

Hook이 매번 실행돼도 잘못된 필드를 읽으면 같은 오류를 매번 반복한다. 실제 플러그인에서도 프롬프트 필드와 `/audit` 자체가 구분선으로 기록되는 문제를 릴리즈 뒤에 고쳤고, 설치 상태와 입력 필드를 확인하는 진단 명령을 따로 두었다.

## 남은 판단

권한 확인을 줄였다면 실행 결과를 되짚을 흔적이 필요하다. 다만 matcher 밖의 도구와 잘못 분류된 복합 Bash 명령은 빠질 수 있고 프롬프트와 명령은 평문으로 남는다. 이 플러그인은 작업 흐름을 방해하지 않으면서 선택한 활동을 확인하는 도구이지, 보안 감사나 권한 통제를 대신하지 않는다.

[^resume-session-id]: 당시 공식 문서만으로는 재개 뒤에도 같은 `session_id`가 유지된다고 단정할 수 없었고, 새 UUID가 발급됐다는 이슈도 있었다.
[^duration-ms]: `duration_ms`는 Claude Code 2.1.119부터 `PostToolUse`와 `PostToolUseFailure` 입력에 추가됐다.
[^async-hook]: async Hook이 종료된 뒤 `additionalContext`를 반환하면 그 내용은 다음 대화 턴에 전달될 수 있다.
