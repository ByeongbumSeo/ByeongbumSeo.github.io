---
title: "같은 시드인데 닉네임이 서버마다 달라진 이유"
slug: "determinism-hidden-inputs"
description: "같은 시드인데도 서버마다 닉네임이 달라진 원인은, 이미 배정된 값을 후보에서 먼저 빼면서 목록의 크기와 위치가 달라졌기 때문이다."
kind: "tech"
category: "database"
publishedAt: "2026-07-29"
draft: false
deprecated: false
outdated: false
tags: ["java", "mysql", "concurrency", "determinism", "random"]
relatedPosts: ["mysql-conditional-update"]
references:
  - title: "Java SE 21 API — Random"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Random.html"
  - title: "Java SE 21 API — String.hashCode"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html#hashCode()"
  - title: "Java SE 21 API — Math.floorMod"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Math.html#floorMod(long,int)"
  - title: "MySQL 8.0 Reference Manual — Consistent Nonlocking Reads"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html"
---

익명 게시판에서는 작성자의 계정 정보 대신 `형용사 + 명사` 형태의 닉네임을 보여 줬다. `멋진 사자`, `조용한 여우` 같은 이름이다.

정책은 세 가지였다.

1. 같은 사용자는 같은 게시글에서 처음 받은 닉네임을 계속 쓴다.
2. 한 게시글 안에서는 서로 다른 사용자의 닉네임이 겹치면 안 된다.
3. 같은 사용자라도 다른 게시글에서는 닉네임을 새로 받는다.

평소에는 잘 동작했다. 그런데 같은 사용자가 한 게시글에 처음 댓글을 남길 때 요청이 겹치면 첫 번째 규칙이 깨졌다.

## 첫 댓글 요청이 두 서버로 들어왔다

클라이언트나 네트워크 상황에 따라 같은 요청이 재시도될 수 있다. 첫 요청이 아직 처리 중인데 재시도 요청이 다른 앱 인스턴스로 전달되면 두 서버가 거의 동시에 닉네임을 만들기 시작한다.

```java
String nickname = repository.findNickname(postId, userId);
if (nickname != null) {
    return nickname;
}

return createNickname(postId, userId);
```

두 서버는 모두 DB에서 “아직 닉네임이 없다”는 결과를 받았다.

```text
서버 1                              서버 2
──────                              ──────
기존 닉네임 조회 → 없음
                                    기존 닉네임 조회 → 없음
랜덤 생성 → "멋진 사자"
                                    랜덤 생성 → "조용한 여우"
댓글 저장
                                    댓글 저장
```

한 JVM 안에서만 작동하는 `synchronized`나 로컬 락으로는 다른 서버의 요청을 막을 수 없다. 분산락을 쓰거나, 닉네임 배정용 테이블에 유니크 키를 두는 방법이 더 확실하다.

당시에는 새로운 잠금 수단이나 테이블을 작업 범위에 넣기 어려웠다. 그래서 요청을 한 줄로 세우는 대신, 같은 요청이라면 어느 서버에서 실행해도 같은 닉네임을 만들도록 바꿔 보기로 했다.

## 게시글과 사용자로 시드를 만들었다

Java의 `Random`은 같은 시드에서 같은 순서로 호출하면 같은 난수열을 만든다. 게시글과 사용자 값으로 시드를 만들고, 그 시드로 형용사와 명사를 골랐다.

```java
long seed = 31L * postId + userId.hashCode();
Random random = new Random(seed);

String adjective = adjectives.get(random.nextInt(adjectives.size()));
String noun = nouns.get(random.nextInt(nouns.size()));
```

여기서 `String.hashCode()`[^string-hash]는 사용자 문자열을 같은 규칙의 숫자로 바꾸고, `31L`[^seed-31]은 두 값을 섞는 데 썼다. `Random.nextInt()`[^random-next-int]는 그 시드로 목록 안의 형용사와 명사를 고른다.

같은 게시글과 사용자의 요청이라면 서버가 달라도 시드는 같다. 다른 게시글에서는 `postId`가 달라지므로 다시 닉네임을 고른다. 여기까지는 의도대로였다.

남은 일은 두 번째 정책이었다. 이미 다른 사용자가 받은 닉네임을 피해야 했다. 형용사와 명사의 모든 조합을 순서 있는 하나의 목록으로 만들고, 이미 배정된 닉네임을 뺀 뒤 하나를 고르도록 코드를 바꿨다.

## 목록에서 사용 중인 이름을 먼저 뺀 게 실수였다

설명을 위해 후보가 다음 순서로 있다고 해 보자.

```text
[멋진 사자, 조용한 여우, 용감한 고래, 행복한 토끼, 차분한 곰]
```

처음 작성한 코드는 DB에서 이미 배정된 닉네임을 읽고, 그 값을 후보에서 먼저 제거했다.

```java
List<String> remainingCandidates = allNicknameCandidates.stream()
        .filter(nickname -> !nicknamesAlreadyAssigned.contains(nickname))
        .toList();

int selectedPosition = Math.floorMod(seed, remainingCandidates.size());
return remainingCandidates.get(selectedPosition);
```

`Math.floorMod()`[^floor-mod]로 같은 시드가 가리킬 위치를 계산했으니 결과도 같을 거라고 생각했다. 하지만 두 서버가 DB를 읽은 시점이 다르면 남은 후보 수도 달라진다.

| 서버가 DB에서 읽은 내용 | 선택에 사용한 후보 | 결과 |
|---|---|---|
| 아직 배정된 닉네임 없음 | 멋진 사자, 조용한 여우, 용감한 고래, 행복한 토끼, 차분한 곰 | 용감한 고래 |
| 차분한 곰은 이미 배정됨 | 멋진 사자, 조용한 여우, 용감한 고래, 행복한 토끼 | 행복한 토끼 |

`용감한 고래`는 두 경우 모두 비어 있다. 그런데 목록 끝의 `차분한 곰` 하나를 지웠더니 같은 시드가 다른 닉네임을 골랐다.

여기서 내가 놓친 게 보였다. 결과를 정하는 건 시드뿐이 아니었다. 후보의 내용과 순서, 고르는 방법, 각 서버가 DB에서 읽은 배정 현황도 결과를 바꾸고 있었다.

## 전체 후보의 순서를 그대로 유지했다

이미 배정된 닉네임을 목록에서 지우지 않도록 바꿨다. 전체 후보에서 같은 시드가 가리키는 시작점을 먼저 정하고, 그 닉네임이 사용 중일 때만 다음 후보로 넘어갔다.

```java
int startPosition = Math.floorMod(seed, allNicknameCandidates.size());

for (int offset = 0; offset < allNicknameCandidates.size(); offset++) {
    String nickname = allNicknameCandidates.get(
            (startPosition + offset) % allNicknameCandidates.size()
    );
    if (!nicknamesAlreadyAssigned.contains(nickname)) {
        return nickname;
    }
}
```

같은 예에서 시드의 시작점이 `용감한 고래`라면 결과는 이렇게 된다.

| 서버가 DB에서 읽은 내용 | 시작 닉네임 | 결과 |
|---|---|---|
| 아직 배정된 닉네임 없음 | 용감한 고래 | 용감한 고래 |
| 차분한 곰은 이미 배정됨 | 용감한 고래 | 용감한 고래 |
| 용감한 고래는 이미 배정됨 | 용감한 고래 | 다음 후보인 행복한 토끼 |

이제 시작 닉네임과 관계없는 이름이 추가로 사용돼도 결과는 바뀌지 않는다. 다만 시작 닉네임 자체가 사용 중이라면 다음 후보로 넘어가므로 DB에서 읽은 내용의 영향이 완전히 사라진 것은 아니다.

후보 목록도 모든 서버에서 같아야 한다. 배포 중 서버마다 형용사나 명사 목록의 내용과 순서가 다르면 같은 시드가 다른 시작점을 가리킬 수 있다.

## 시드 하나만 같아서는 부족했다

처음에는 같은 시드만 만들면 여러 서버에서 같은 결과를 얻을 수 있다고 봤다. 실제로는 후보 목록의 내용과 순서, 닉네임을 고르는 방법, 각 요청이 DB에서 읽은 이미 배정된 닉네임까지 모두 결과에 영향을 줬다.

고정된 전체 목록에서 시작하는 방식은 이 차이를 많이 줄였다. 그래도 서로 다른 두 사용자가 저장 전에 같은 빈 닉네임을 고를 가능성은 남는다. 한 게시글 안의 중복을 반드시 막아야 한다면 결국 DB 유니크 키나 여러 서버가 함께 쓰는 잠금이 필요하다.

내가 얻은 결론은 단순하다. **다중 인스턴스에서 같은 결과를 기대한다면 시드가 아니라 결과에 영향을 주는 조건을 전부 찾아 같은 상태로 맞춰야 한다.**

[^string-hash]: `String.hashCode()`는 같은 문자열을 같은 정수로 바꾼다. 서로 다른 문자열이 같은 정수가 될 수 있으므로 유일성을 보장하지는 않는다.
[^seed-31]: 31은 두 값을 단순히 이어 붙이지 않고 섞을 때 흔히 쓰는 작은 소수다. 유일성을 보장하지 않으며, `L`은 `long` 값으로 계산하겠다는 표시다.
[^random-next-int]: `Random.nextInt(bound)`는 `0`부터 `bound - 1` 사이의 값을 골라 목록 위치로 쓸 수 있게 한다.
[^floor-mod]: 여기서는 시드를 현재 후보 수로 나눈 나머지를 목록 위치로 쓴다. 후보 수가 바뀌면 같은 시드도 다른 위치가 된다.
