---
title: "릴리즈 PR 뒤 갈라진 Git 브랜치를 tree 해시로 수렴하기"
slug: "git-merge-divergence"
description: "tree는 같지만 부모 이력이 다른 환경 브랜치를 진단하고, 공유 이력을 force push 없이 --ff-only로 한 지점에 모은 방법을 설명한다."
kind: "tech"
category: "git"
publishedAt: "2026-07-03"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["git", "github", "release", "branch"]
relatedPosts: []
references:
  - title: "Pro Git — Git Objects"
    url: "https://git-scm.com/book/en/v2/Git-Internals-Git-Objects#_git_commit_objects"
  - title: "Pro Git — Basic Branching and Merging"
    url: "https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging"
  - title: "git-merge Documentation"
    url: "https://git-scm.com/docs/git-merge"
  - title: "GitHub Docs — About pull request merges"
    url: "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges"
---

`develop`, `staging`, `main`의 코드를 운영 배포 뒤에는 항상 같게 유지하는 저장소가 있었다. 릴리즈 내용을 리뷰하기 위해 `develop → staging` PR을 도입한 뒤부터 그래프가 지그재그로 갈라지기 시작했다.

```text
develop:  ── A ── B ── C
                    \   \
staging:  ────────── M1 ─ M2
main:                  M1 ─ M2
```

`staging`과 `main`은 같은 커밋을 가리켰지만 `develop`만 달랐다. 이상한 건 세 브랜치의 파일 내용은 같아 보였다는 점이다.

## 커밋이 같은 것과 코드가 같은 것은 다르다

먼저 감각이 아니라 Git으로 확인했다.

```bash
git diff origin/develop origin/main
# 출력 없음
```

트리 객체도 비교했다.

```bash
git rev-parse origin/develop^{tree}
git rev-parse origin/main^{tree}
```

두 명령은 같은 tree 해시를 반환했다. 커밋 해시는 달랐다.

커밋 객체에는 파일 스냅샷을 가리키는 tree뿐 아니라 부모 커밋, 작성자, 커미터, 메시지가 들어간다. 파일이 완전히 같아도 부모가 다르거나 머지 메시지가 추가되면 커밋 해시는 달라진다.

| 비교 | 의미 |
|---|---|
| commit 해시가 같다 | 내용과 이력 메타데이터까지 같은 커밋이다 |
| tree 해시가 같다 | 그 시점의 파일·디렉터리 내용이 같다 |

**이 저장소는 코드는 같지만 이력은 다른 상태였다.**

## 최초의 merge commit이 다음 fast-forward를 막았다

브랜치 한쪽에만 있는 커밋을 확인했다.

```bash
git log --oneline origin/main ^origin/develop
```

출력은 모두 릴리즈 PR에서 생긴 merge commit이었다. GitHub의 기본 “Merge pull request”는 base 브랜치에 부모가 두 개인 새 커밋을 만든다. 파일 결과가 `develop`과 같아도 `staging`은 새 커밋 `M`을 가리킨다.

```text
develop:  ── A ── B ── C
                         \
staging:  ─────────────── M
```

이후에는 `staging`이 `develop`의 단순한 조상이 아니므로 다음 릴리즈를 fast-forward할 수 없다. 다시 merge commit이 생기고, 갈라짐이 반복된다.

```text
첫 PR merge commit 생성
  → staging에만 있는 커밋 발생
  → 다음 fast-forward 불가
  → 또 merge commit 생성
  → 차이가 누적
```

merge, squash, rebase 중 무엇을 고르든 GitHub PR UI의 일반적인 병합 방식은 base 브랜치에 새 이력을 만든다. “모든 환경 브랜치가 정확히 같은 커밋을 가리킨다”는 정책과는 별개의 목표다.

## force push 대신 조상 브랜치를 앞으로 보냈다

처음에는 `staging`과 `main`을 `develop` 위치로 되돌릴 생각을 했다. 이미 공유된 브랜치를 뒤로 옮기려면 force push가 필요하다.

방향을 바꿔 보니 필요하지 않았다. `develop`은 릴리즈 merge commit의 조상이었다.

```bash
git merge-base --is-ancestor origin/develop origin/main
```

종료 코드가 0이라면 `develop`을 `main` 쪽으로 fast-forward할 수 있다.

```bash
git switch develop
git merge --ff-only origin/main
git push origin develop
```

```text
이동 전:  ── C (develop) ── M (staging, main)
이동 후:  ── C ─────────── M (develop, staging, main)
```

`--ff-only`는 조상 관계가 예상과 다르면 merge commit을 만들지 않고 실패한다. 복구 중 그래프를 더 복잡하게 만들지 않기 위한 안전장치였다. 과거 merge commit은 남지만 브랜치 포인터가 한 지점으로 모였고, force push도 하지 않았다.

## PR은 문서로 남기고 반영은 fast-forward로 했다

릴리즈 PR에는 여전히 가치가 있었다. 변경 목록을 정리하고 배포 전 리뷰하는 장소였기 때문이다. 문제는 PR 자체가 아니라 병합 방식이었다.

그래서 다음 규칙을 정했다.

1. 릴리즈 PR을 열어 변경 내용과 체크리스트를 리뷰한다.
2. 웹의 merge 버튼으로 새 커밋을 만들지 않는다.
3. 승인 뒤 CLI에서 `git merge --ff-only develop`로 환경 브랜치를 전진시킨다.
4. GitHub에서 PR 상태와 브랜치 포인터를 다시 확인한다.

핫픽스를 환경 브랜치에 직접 넣으면 이 전제가 다시 깨진다. 핫픽스도 먼저 공통 개발 브랜치에 반영하거나, 반영 직후 모든 브랜치를 같은 커밋으로 수렴시키는 절차가 필요하다.

**배포 산출물을 비교할 때는 tree나 `git diff`를 보고, 이력을 한 줄로 유지하려면 commit의 조상 관계를 봐야 한다.** 둘을 섞으면 코드가 같은데 왜 브랜치가 다르냐는 질문에서 오래 헤매게 된다.
