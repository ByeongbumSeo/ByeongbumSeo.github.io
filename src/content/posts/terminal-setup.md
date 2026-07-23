---
title: "터미널을 좀 더 쓸 만하게 — D2Coding 폰트와 zsh-syntax-highlighting"
slug: "terminal-setup"
description: "macOS 터미널에 D2Coding Ligature 폰트와 zsh-syntax-highlighting을 적용하며 헷갈렸던 설정을 정리한다."
kind: "note"
publishedAt: "2026-04-07"
draft: false
deprecated: false
outdated: false
tags: ["terminal", "zsh", "macos", "font"]
relatedPosts: ["shell"]
references:
  - title: "naver/d2codingfont"
    url: "https://github.com/naver/d2codingfont"
  - title: "Ghostty — Configuration"
    url: "https://ghostty.org/docs/config"
  - title: "zsh-users/zsh-syntax-highlighting"
    url: "https://github.com/zsh-users/zsh-syntax-highlighting"
---

터미널은 매일 쓰면서도 폰트와 색상 설정은 자꾸 미뤘다. 새 환경을 세팅할 때마다 TTF와 TTC 중 무엇을 설치했는지, Apple Silicon의 Homebrew 경로가 어디였는지 다시 찾았다. 2026년 4월 직접 설정하면서 헷갈렸던 부분만 기록했다.

## D2Coding에서 무엇을 설치할까

D2Coding 릴리스를 풀면 기본 폰트, Ligature 폰트, 여러 폰트를 묶은 컬렉션이 나뉘어 있었다.

```text
D2Coding/
D2CodingLigature/
D2CodingAll/
```

Ligature는 `->`, `=>`, `!=` 같은 연속 기호를 하나의 모양처럼 보여준다. 문자가 바뀌는 것은 아니고 렌더링만 달라진다.

TTF와 TTC도 처음에는 구분이 헷갈렸다.

| 형식 | 의미 |
|---|---|
| TTF | 한 폰트가 들어 있는 TrueType 파일 |
| TTC | 여러 TrueType 폰트를 묶은 컬렉션 |

내 경우에는 Ligature Regular와 Bold TTF 두 개를 따로 설치했다. macOS에서는 파일을 열어 Font Book의 설치 버튼을 누르면 됐다. TTC를 써도 되지만, 어떤 굵기를 설치했는지 TTF 두 개가 더 눈에 잘 들어왔다.

## 터미널에 폰트를 연결한다

iTerm2에서는 `Settings → Profiles → Text → Font`에서 D2Coding Ligature를 선택했다.

Ghostty에서는 당시 설정 파일에 다음 한 줄을 넣었다.

```ini
font-family = D2Coding Ligature
```

```text
~/Library/Application Support/com.mitchellh.ghostty/config.ghostty
```

VS Code의 에디터와 내장 터미널에도 같은 폰트를 쓰고 싶다면 설정에 지정할 수 있다.

```json
{
  "terminal.integrated.fontFamily": "D2Coding Ligature",
  "editor.fontFamily": "D2Coding Ligature"
}
```

## zsh와 Oh My Zsh는 같은 것이 아니다

zsh는 셸이고, Oh My Zsh는 zsh의 테마와 플러그인을 관리하기 쉽게 해주는 프레임워크다. macOS는 zsh를 기본 셸로 제공하지만 Oh My Zsh는 별도 선택이다.

| | 역할 |
|---|---|
| zsh | 명령을 해석하고 자동완성 같은 셸 기능을 제공 |
| Oh My Zsh | zsh 테마와 플러그인 설정을 관리 |

당시에는 Git 브랜치와 작업 상태를 프롬프트에서 보기 위해 Oh My Zsh의 `agnoster` 테마를 사용했다.

```bash
ZSH_THEME="agnoster"
```

테마는 취향이고 필수 단계는 아니다. 내가 원한 핵심은 명령을 실행하기 전에 오타를 알아보기 쉽게 하는 것이었다.

## zsh-syntax-highlighting을 붙인다

Homebrew로 설치했다.

```bash
brew install zsh-syntax-highlighting
```

설치 경로를 하드코딩하기 전에 `brew --prefix`로 Homebrew 접두사를 확인하는 편이 안전하다. Apple Silicon에서는 보통 `/opt/homebrew`, Intel Mac에서는 `/usr/local`이었다.

Oh My Zsh를 사용한다면 로드한 뒤 highlighting 스크립트를 source했다.

```bash
source "$ZSH/oh-my-zsh.sh"
source "$(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
```

알 수 없는 토큰의 색도 바꿀 수 있었다.

```bash
ZSH_HIGHLIGHT_STYLES[unknown-token]='fg=213'
```

변경 뒤에는 터미널을 다시 열거나 다음 명령으로 현재 셸에 적용했다.

```bash
source ~/.zshrc
```

## 새 환경에서 다시 할 순서

1. D2Coding Ligature의 Regular와 Bold를 설치한다.
2. 사용하는 터미널과 에디터에서 폰트를 선택한다.
3. `brew --prefix`를 확인한다.
4. zsh-syntax-highlighting을 설치하고 `.zshrc` 마지막 부분에서 불러온다.
5. `source ~/.zshrc`로 적용한다.

각 단계는 짧았지만 처음에는 폰트 형식, 셸과 프레임워크, Homebrew 경로가 한꺼번에 섞여 보였다. 한 번 나눠 적어두니 다음 환경에서는 무엇을 확인해야 할지 바로 보였다.
