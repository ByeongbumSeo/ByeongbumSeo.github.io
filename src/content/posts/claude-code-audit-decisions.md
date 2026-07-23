---
title: "Claude Code 감사 로그에서는 누락이 더 비쌌다"
slug: "claude-code-audit-decisions"
description: "Claude Code 감사 로그에 블랙리스트 방식을 택한 이유와, 읽기 명령 필터가 오히려 변경 작업을 놓칠 수 있었던 과정을 정리한다."
kind: "tech"
publishedAt: "2026-04-08"
draft: false
deprecated: false
outdated: false
tags: ["claude-code", "ai-agent", "hook", "audit"]
series:
  slug: "claude-code-audit"
  title: "Claude Code Audit"
  order: 2
relatedPosts: []
references:
  - title: "Claude Code Hooks Reference"
    url: "https://code.claude.com/docs/en/hooks"
  - title: "Claude Code Hooks Guide"
    url: "https://code.claude.com/docs/en/hooks-guide"
  - title: "Claude Code Tools Reference"
    url: "https://code.claude.com/docs/en/tools-reference"
  - title: "Claude Code Changelog"
    url: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md"
  - title: "ByeongbumSeo/claude-audit-logger"
    url: "https://github.com/ByeongbumSeo/claude-audit-logger"
---

Audit Hook의 큰 구조를 만든 뒤 가장 오래 고민한 것은 무엇을 기록할지가 아니라 무엇을 버릴지였다.

Bash 명령을 모두 남기면 `ls`, `cat`, `git status` 같은 탐색 기록이 대부분을 차지한다. 그렇다고 변경 명령만 골라 적으면 목록에 없는 명령이 조용히 빠질 수 있다. 감사 로그에서는 불필요한 한 줄보다 중요한 한 줄의 누락이 더 비쌌다.

그래서 화이트리스트가 아니라 블랙리스트를 선택했다. 이 판단은 지금도 같다. 다만 2026년 7월에 공식 문서와 공개 플러그인을 다시 대조하면서, 블랙리스트라는 정책과 읽기 명령의 접두사만 검사한 구현은 별개의 문제라는 것을 알게 됐다.

실제로 실행된 작업만 남기기 위해 `PostToolUse`와 `PostToolUseFailure`에서 `Bash`, `Write`, `Edit`, `MultiEdit`를 기록했다. 이벤트를 고르고 세션별 로그를 구성한 과정은 별도 글에 남겼다. 여기서는 Bash 로그의 노이즈를 줄이면서 변경 작업은 놓치지 않으려 했던 판단에 집중한다.

## 화이트리스트 대신 블랙리스트를 고른 이유

Bash 필터에는 두 방향이 있다.

```text
화이트리스트: 알고 있는 변경 명령만 기록한다
블랙리스트:   알고 있는 읽기 명령만 제외한다
```

화이트리스트는 설정이 깔끔하다. 그러나 `git commit`을 넣고 `git push --force`를 빼먹으면 중요한 작업이 조용히 사라진다. 새로운 명령이나 예상하지 못한 스크립트도 목록 밖이면 기록되지 않는다.

감사 로그에서는 오탐보다 누락이 더 비싸다. 그래서 `ls`, `cat`, `grep`, `git status`처럼 명백한 읽기만 제외하고, 모르는 명령은 일단 기록하는 블랙리스트를 택했다.

```bash
if echo "$CMD" | grep -qE "^(ls|cat |head |tail |grep |git (log|status|diff))"; then
  exit 0
fi

echo "[${TIMESTAMP}] [BASH] ${CMD}" >> "$LOG_FILE"
```

`echo "data" > output.txt`처럼 출력 명령이 파일을 쓰는 경우가 있어 `>`, `>>`, `tee`가 보이면 우선 기록하도록 예외도 넣었다. 여기까지는 블랙리스트의 취지와 맞는다고 생각했다.

## 접두사만 보면 명령 전체를 놓친다

문제는 블랙리스트 자체가 아니라 구현 단위였다. 위 정규식은 명령 전체가 읽기 전용인지 확인하지 않는다. 문자열이 읽기 명령으로 시작하는지만 본다.

후속 검토에서 다음 입력들이 모두 문제가 될 수 있음을 확인했다.

| 명령 | 놓치는 이유 |
|---|---|
| `git status && git push` | 첫 명령인 `git status`만 보고 전체를 제외한다 |
| `ls; rm local.tmp` | 세미콜론 뒤의 변경 명령을 검사하지 않는다 |
| `find . -delete` | `find`를 읽기 명령으로 간주하지만 옵션에는 부작용이 있다 |
| `git branch -D old` | `git branch`가 조회뿐 아니라 브랜치 삭제에도 쓰인다 |
| `echo result>output.txt` | 공백 없는 단일 리다이렉트를 예외 패턴이 놓친다 |

`cat files.txt | xargs rm`, `cd app && ./deploy.sh`처럼 파이프나 디렉터리 이동 뒤에 변경 작업이 이어지는 경우도 같다. 접두사 정규식은 “모르는 변경은 기록한다”는 블랙리스트의 원칙을 오히려 깨뜨렸다.

공개 플러그인의 현재 구현도 이 방식에 기반한다. 따라서 이미 해결된 문제처럼 쓸 수는 없다. 글을 다시 검토하며 정한 기준은 다음과 같다.

```text
기본값                          기록
전체 명령이 읽기 전용임을 확인   제외 가능
복합 명령·리다이렉트·부작용 옵션 기록
판별할 수 없는 명령              기록
```

핵심은 “읽기 명령으로 시작하는가”가 아니라 “입력 전체가 읽기 전용인가”다. 셸 문법을 완전히 해석하기 어렵다면 제외하지 말고 기록해야 한다. Bash를 전부 남긴 뒤 조회할 때 읽기 기록을 접는 방법도 이 원칙에는 맞는다.

공식 Hook 문서에는 개별 handler의 `if` 조건이 Bash 입력의 각 하위 명령을 기준으로 매칭되고, 너무 복잡해 해석할 수 없는 명령은 Hook을 실행한다고 설명되어 있다. 도구가 제공하는 이 동작을 활용할 수는 있지만, 읽기 명령을 제외하는 최종 기준까지 자동으로 해결해 주는 것은 아니다.

## matcher에 적지 않은 도구는 보이지 않는다

`PostToolUse`와 `PostToolUseFailure`의 matcher는 `tool_name`을 대상으로 동작한다. 처음에는 로컬 변경을 만드는 도구를 다음처럼 나열했다.

```json
{
  "matcher": "Bash|Write|Edit|MultiEdit"
}
```

이 범위에서는 Bash와 일반 파일 생성·수정은 볼 수 있다. 반면 `NotebookEdit`, 별도 `PowerShell` 도구, 이후 추가되는 도구는 포함되지 않는다. MCP 도구도 공식 문서에 나온 `mcp__<server>__<tool>` 형태의 이름을 matcher에 포함해야 한다. 외부 서비스나 데이터베이스를 바꾸는 MCP 호출은 현재 로그에 남지 않는다.

따라서 이 로그를 “Claude Code가 한 모든 일”의 기록이라고 부르면 범위가 지나치게 넓다. 현재 구현이 다루는 것은 matcher에 명시한 로컬 도구의 일부다. 완전한 도구 감사가 목표라면 모든 도구 이벤트를 받은 뒤 읽기와 변경을 분류해야 하고, 그렇지 않다면 지원 범위를 문서에 분명히 적어야 한다.

## 로그가 많아질수록 보호할 것도 늘어난다

로그 자체의 위험도 남는다. 사용자 프롬프트 일부와 Bash 명령, 절대경로를 평문으로 저장하므로 토큰이나 자격증명이 명령 인자에 들어가면 함께 기록될 수 있다. 현재 플러그인은 파일 권한도 기본 `umask`에 맡긴다. 기록 범위를 넓힐수록 보관 기간, 마스킹, `0700` 디렉터리와 `0600` 파일 같은 보호 조치가 더 중요해진다.

이 제약들이 블랙리스트 선택을 뒤집지는 않는다. 잘못된 것은 블랙리스트를 택한 판단이 아니라 읽기 명령의 접두사를 명령 전체와 동일시한 구현이었다. 확실히 읽기 전용인 경우만 제외하고, 판단할 수 없으면 남겨야 한다.

matcher 밖의 도구와 평문 로그의 위험도 함께 공개해야 한다. 이 기준을 충족하기 전까지 이 플러그인은 작업을 돌아보는 데 유용한 활동 로그이지, 누락이 없다고 보장하는 감사 시스템은 아니다.
