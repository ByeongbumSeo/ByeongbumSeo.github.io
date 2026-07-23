---
title: "PR 리뷰를 위해 브랜치를 바꿔야 하는데 작업 중인 코드가 있다면"
slug: "git-stash-worktree"
description: "커밋하지 않은 작업을 보존한 채 다른 브랜치를 확인할 때 git stash와 worktree 중 무엇을 선택할지 정리한다."
kind: "note"
publishedAt: "2026-04-02"
draft: false
deprecated: false
outdated: false
tags: ["git", "workflow"]
relatedPosts: []
references:
  - title: "Git documentation - git-stash"
    url: "https://git-scm.com/docs/git-stash"
  - title: "Git documentation - git-worktree"
    url: "https://git-scm.com/docs/git-worktree"
---

## 상황

기능 브랜치에서 작업하던 중 다른 PR을 로컬에서 직접 확인해야 했다. 그런데 현재 브랜치에는 아직 커밋하지 않은 변경이 남아 있었다.

```text
현재 상태:
  브랜치: feature/current-work
  상태: 여러 파일에 커밋하지 않은 변경이 있음

해야 할 일:
  feature/review-target 브랜치를 체크아웃해서 코드 확인
```

이럴 때 떠오르는 선택지는 보통 `git stash`와 `git worktree`다. 둘 다 현재 작업을 보존하지만, 작업을 치우는 방식과 별도 작업 공간을 만드는 방식이라는 차이가 있다.

## git stash: 현재 작업을 잠깐 치워두기

```bash
git stash
git switch feature/review-target
# 코드 확인
git switch feature/current-work
git stash pop
```

### stash는 무엇을 저장할까

`stash`를 단순한 diff 파일 저장으로 생각하기 쉽지만, Git은 작업 트리 상태를 커밋 객체로 기록한다. 다만 일반 브랜치가 아니라 `refs/stash`와 그 reflog를 통해 접근한다.

```text
refs/stash -> W (작업 트리 상태)
                |
                +-- H: stash 당시 HEAD
                +-- I: index 상태
                +-- U: untracked 상태 (-u를 사용한 경우)
```

`refs/stash`가 직접 가리키는 것은 작업 트리 커밋 `W`다. 나머지 상태는 그 부모 관계로 연결된다. 이전 항목은 reflog에 쌓이므로 `stash@{0}`, `stash@{1}`처럼 선택할 수 있다.

```bash
git stash list
# stash@{0}: WIP on feature/current-work: 1a2b3c4 작업 중
# stash@{1}: WIP on feature/current-work: 5d6e7f8 이전 작업
```

### pop과 apply의 차이

| 명령어 | 변경 복원 | 성공 시 stash 제거 |
|---|:---:|:---:|
| `git stash pop` | O | O |
| `git stash apply` | O | X |

`pop`은 적용과 제거를 한 번에 시도한다. 충돌이 나면 stash 항목을 남겨두므로, 충돌을 해결한 뒤 필요할 때 직접 `git stash drop`으로 정리해야 한다.

## git worktree: 다른 디렉터리에 동시에 체크아웃하기

```bash
git worktree add ../project-review feature/review-target
# ../project-review에서 코드 확인

git worktree remove ../project-review
```

worktree는 같은 저장소의 다른 작업 트리를 별도 디렉터리에 만든다. 새로 `clone`하는 것과 달리 객체 데이터베이스와 리모트 설정, 커밋 이력을 공유한다.

```text
workspace/
├── project/          # 원래 작업 트리
│   └── .git/
└── project-review/   # 추가 worktree
    └── .git          # 원본 저장소를 가리키는 파일
```

이 구조 덕분에 원래 디렉터리의 커밋하지 않은 변경은 그대로 둔 채 다른 브랜치를 열 수 있다. 추가 worktree에서 만든 커밋도 같은 저장소에 생기므로 원래 작업 트리에서 바로 확인할 수 있다.

### 같은 브랜치를 두 곳에서 열 수 있을까

기본적으로 Git은 이미 다른 worktree에서 체크아웃한 브랜치를 또 체크아웃하지 못하게 막는다.

```bash
git worktree add ../another feature/current-work
# fatal: 'feature/current-work' is already checked out at '.../project'
```

`--force`로 이 보호 장치를 우회할 수는 있다. 하지만 두 작업 트리에서 같은 브랜치를 동시에 움직이면 어느 디렉터리가 최신 상태인지 헷갈리기 쉽다. 가능하다는 것과 안전하다는 것은 다르다.

## 어떤 방법을 고르면 될까

| | stash | worktree |
|---|---|---|
| 브랜치 전환 | 필요 | 원래 작업 트리에서는 불필요 |
| 현재 변경 처리 | stash와 복원 필요 | 그대로 유지 |
| 두 브랜치 동시 확인 | 어려움 | 가능 |
| IDE 사용 | 같은 프로젝트에서 전환 | 다른 디렉터리를 별도로 열기 |
| 디스크 사용 | 거의 없음 | 체크아웃된 파일만큼 추가 |
| 주의할 점 | 복원 시 충돌 가능 | worktree 정리와 브랜치 위치 관리 |

잠깐 확인하고 바로 돌아오며 변경도 많지 않다면 stash가 간단하다. 두 코드를 나란히 비교하거나 리뷰가 길어질 것 같다면 worktree가 편하다.

## stash를 장기 보관함으로 쓰지는 말자

stash 이름은 기본적으로 `WIP on ...` 형태라 여러 개가 쌓이면 구분하기 어렵다.

```bash
git stash push -m "리팩터링 중간 상태"
```

메시지를 붙이면 조금 낫지만, 오랫동안 보관해야 하는 작업이라면 별도 브랜치에 WIP 커밋을 두는 편이 찾고 복구하기 쉽다. 작업을 다시 시작할 때 커밋을 정리하면 된다.

정리하면 선택 기준은 이렇다.

```text
잠깐 다른 브랜치를 보고 온다 -> git stash
두 브랜치를 동시에 열어둔다 -> git worktree
장기간 작업을 중단한다       -> 별도 브랜치의 WIP 커밋
```
