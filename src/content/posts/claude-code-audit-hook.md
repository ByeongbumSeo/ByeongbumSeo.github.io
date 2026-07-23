---
title: "Claude Code Hook 문서를 읽고 로컬 활동 로그를 만들었다"
slug: "claude-code-audit-hook"
description: "Claude Code 공식 Hook 문서의 이벤트와 matcher, command Hook, async, CLAUDE_ENV_FILE을 읽고 선택한 도구의 로컬 활동 로그에 적용한 과정과 한계를 정리한다."
kind: "tech"
publishedAt: "2026-04-08"
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

"편집 뒤 진단을 확인해 달라"는 요청과 "선택한 편집 이벤트를 로그에 남긴다"는 요구는 성격이 다르다. 후자처럼 실행 시점을 코드로 정할 일에는 Hook이 더 잘 맞았다.

문서를 읽으며 구현에 필요한 이벤트부터 골랐다.

- `SessionStart`: 세션별 로그를 준비하고 재개 상태를 구분한다.
- `UserPromptSubmit`: 사용자 요청을 작업 경계로 남긴다.
- `PostToolUse`, `PostToolUseFailure`: 성공하거나 실패한 도구 실행을 결과가 나온 뒤 기록한다.
- `matcher`: 기록할 도구 이름을 제한한다.
- `command` Hook: 표준 입력으로 받은 JSON을 셸 스크립트에서 해석해 로컬 파일에 쓴다.

이 글은 이 기능들을 공부하고 작은 로그 구현에 적용한 기록이다. 2026년 4월의 구현 과정을 바탕으로 쓰고, 같은 해 7월 공식 문서와 공개 플러그인을 다시 대조해 현재의 한계를 보충했다. 프로젝트 이름에는 Audit가 들어가지만, 완전한 보안 감사 시스템을 만들었다는 뜻은 아니다.

## 처음에는 Bash 명령을 전부 기록했다

가장 단순한 시작은 `PreToolUse`에서 Bash 명령을 한 파일에 덧붙이는 것이었다.

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "echo \"$(date) $(jq -r '.tool_input.command')\" >> ~/.claude/command-log.txt"
      }]
    }]
  }
}
```

바로 두 가지 문제가 생겼다.

첫째, 로그 대부분이 `ls`, `cat`, `grep`, `git status` 같은 탐색 명령이었다. 내가 궁금한 것은 파일 생성이나 수정, `git commit`, 삭제, 빌드처럼 상태를 바꾸는 작업이었다.

둘째, Bash만 보면 정작 중요한 변경이 빠졌다. Claude Code는 파일을 새로 만들거나 덮어쓸 때 `Write`, 일부 내용을 바꿀 때 `Edit` 같은 전용 도구를 쓸 수 있다.

그래서 matcher를 `Bash|Write|Edit|MultiEdit`로 넓히고, Bash 안에서는 읽기 전용으로 판단한 명령만 제외했다. 현재 공개 플러그인도 이 네 이름에 일치하는 도구만 받는다.

```text
기록                              제외
──────────────────────────────    ─────────────────────────
Write, Edit                       Read, Glob, Grep
git commit, push, reset           git log, status, diff
rm, mv, cp, mkdir                 ls, cat, head, tail
테스트와 빌드 실행                 의존성 조회
리다이렉트가 있는 명령             출력만 하는 echo
```

`echo "data" > output.txt`처럼 겉으로는 단순 출력이지만 파일을 쓰는 명령도 있다. 리다이렉트와 `tee`를 발견하면 읽기 명령 패턴에 걸리더라도 기록하도록 예외를 두었다. 다만 이 검사도 문자열 패턴에 의존해 `echo result>output.txt`처럼 공백 없이 붙은 리다이렉트를 놓칠 수 있다.

여기에는 분명한 빈틈이 있다. Bash 명령을 셸 문법으로 나누는 대신 문자열의 시작 부분을 정규식으로 검사하기 때문에, 현재 플러그인은 다음과 같은 복합 명령을 읽기 전용으로 오인할 수 있다.

```bash
git status && git push
ls; rm some-file.txt
```

각 명령은 조회로 시작하지만 뒤에서 상태를 바꾼다. 지금 구현은 앞부분의 `git status`나 `ls`에 걸려 전체 명령을 제외할 수 있다. 따라서 "상태 변경 Bash 명령을 모두 기록한다"고 말할 수는 없다.

도구 범위도 마찬가지다. 공식 문서에서 MCP 도구 이름은 `mcp__<server>__<tool>` 형식이며 별도 matcher가 필요하다. 현재의 `Bash|Write|Edit|MultiEdit`에는 MCP 도구와 그 밖의 도구가 포함되지 않는다. 이 로그가 보여주는 것은 Claude Code의 모든 활동이 아니라, **설정에서 선택한 로컬 도구의 활동**이다.

로그의 라벨에도 한계가 있다. 현재 플러그인은 `Write` 호출을 모두 `[CREATE]`로 남기지만, `Write`는 기존 파일을 덮어쓸 수도 있다. 따라서 `[CREATE]`는 실제 변경 종류를 보장하는 값이 아니라, 당시 플러그인이 붙인 도구 라벨로 읽어야 한다.

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

다만 여기에는 "재개해도 같은 세션 ID를 받는다"는 전제가 숨어 있었다. 당시 공식 문서만으로는 보존을 단정할 수 없었고, 새 UUID가 발급됐다는 이슈도 있었다. 그래서 기존 로그가 없으면 새 로그를 만드는 폴백을 추가했다. 파일명에 날짜를 넣지 않고 각 엔트리에 날짜를 넣은 것도, 자정을 넘긴 세션이 둘로 갈리지 않게 하기 위해서였다.

## 실행 전이 아니라 실행 후를 기록한다

초기 구현은 `PreToolUse`였다. 그런데 권한에서 거부됐거나 실제 실행 전에 중단된 명령도 로그에 남았다. 감사 로그에서 알고 싶은 것은 "하려던 일"보다 "실제로 실행된 일"이었다.

그래서 `PostToolUse`와 `PostToolUseFailure`로 옮겼다.

```text
[14:30:25] [BASH] ./gradlew test
[14:30:50] [BASH:FAIL] rm some-file.txt
[14:31:05] [EDIT] src/main/.../ExampleService.java
```

실패에는 `:FAIL`을 붙였다. 거부된 명령은 남지 않고, 실행됐다가 실패한 작업은 구분된다. 원본을 구현할 때는 Hook 입력에 소요 시간이 없어 시작 시각을 별도로 보관해야 했다. 복잡도에 비해 얻는 가치가 작아 이 기능은 넣지 않았다.

이후 Claude Code 2.1.119부터 `PostToolUse`와 `PostToolUseFailure` 입력에 `duration_ms`가 추가됐다. 최신 버전에서는 별도 시작 시각 파일 없이 도구 실행 시간을 기록할 수 있다.

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

`async: true`는 Hook을 백그라운드에서 실행해 다음 작업을 막지 않게 한다. 공식 문서에 따르면 async Hook은 이미 지나간 동작을 차단하거나 결정을 되돌릴 수 없지만, 종료 뒤 `additionalContext`를 반환하면 그 내용은 다음 대화 턴의 컨텍스트로 전달된다. 이 Hook이 조용한 이유는 async라서가 아니라, stdout이나 컨텍스트 필드로 아무것도 보내지 않고 파일에만 쓰기 때문이다.

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

이후 이 구조를 [claude-audit-logger](https://github.com/ByeongbumSeo/claude-audit-logger) 플러그인으로 공개했다. 패키징하면서 공유 포인터 파일을 없애고, `SessionStart`에서 제공되는 `CLAUDE_ENV_FILE`에 세션별 환경변수를 기록하는 방식으로 바꿨다. 공식 문서상 이 파일에 쓴 `export` 문은 이후 Bash 명령에서 사용할 수 있다. 공유 파일은 멀티 세션에서 마지막 쓰기가 이기는 경합을 만들었지만, 세션별 환경변수는 애초에 상태가 섞이지 않는다.

Hook이 항상 실행된다고 Hook이 항상 옳은 것은 아니었다. `UserPromptSubmit` 입력에서 잘못된 필드를 읽으면, 잘못된 로직도 매번 빠짐없이 실행된다. 실제 플러그인에서도 프롬프트 필드와 `/audit` 자체가 구분선으로 기록되는 문제를 릴리즈 뒤에 고쳤다. 그래서 설치 상태와 입력 필드를 확인하는 진단 명령도 따로 두었다.

## 남은 판단

Hook의 핵심은 모델에게 부탁할 일과 코드로 보장할 일을 나누는 데 있었다.

```text
"편집 뒤 컴파일을 확인해 줘" → 작업 지침
"편집 이벤트를 로그에 남겨"  → Hook
```

넓은 권한을 주는 것 자체가 안전장치가 되지는 않는다. 권한 확인을 줄였다면, 그만큼 실행 결과를 되짚을 수 있는 흔적이 필요하다.

다만 Hook이 실행된다는 사실과 필요한 활동이 전부 기록된다는 말은 다르다. matcher 밖의 도구, MCP 도구, 읽기 명령으로 잘못 분류된 복합 Bash 명령은 이 기록에서 빠질 수 있다. 프롬프트와 명령도 평문으로 남는다. 내가 만든 Hook은 이 경계를 감수하고 작업 흐름을 방해하지 않으면서 선택된 로컬 활동을 확인하기 위한 도구다. 보안 감사나 권한 통제를 대신하지는 않는다.
