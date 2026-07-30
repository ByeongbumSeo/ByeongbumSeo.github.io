---
title: "랜덤 닉네임 생성 로직에서 결정론이 깨진 이유"
slug: "determinism-hidden-inputs"
description: "동시 요청이 서로 다른 닉네임을 고르던 문제를 통해, 후보 목록과 선택 순서가 결정론에 미치는 영향을 설명한다."
kind: "diary"
category: "troubleshooting"
publishedAt: "2026-07-29"
updatedAt: "2026-07-30"
draft: false
deprecated: false
outdated: false
tags: ["troubleshooting", "java", "concurrency", "determinism", "random"]
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

익명 게시판의 랜덤 닉네임 생성 로직을 수정하다 이상한 문제를 만났다. 같은 시드, 즉 난수 생성의 기준값을 사용했는데도 요청을 처리한 서버에 따라 다른 닉네임이 만들어졌다.

이 게시판은 작성자의 계정 정보 대신 `형용사 + 명사` 형태의 닉네임을 보여 준다. `멋진 사자`, `조용한 여우` 같은 이름이다.

닉네임은 세 가지 정책을 따른다.

1. 같은 사용자는 같은 게시글에서 처음 받은 닉네임을 계속 쓴다.
2. 한 게시글 안에서는 서로 다른 사용자의 닉네임이 겹치면 안 된다.
3. 같은 사용자라도 다른 게시글에서는 닉네임을 새로 받는다.

평소에는 문제없이 동작한다. 하지만 같은 사용자가 한 게시글에 처음 댓글을 남길 때 요청이 겹치면 첫 번째 규칙이 깨진다.

## 첫 댓글 요청이 두 서버에서 동시에 처리되면

클라이언트나 네트워크 상황에 따라 같은 요청이 재시도될 수 있다. 첫 요청이 아직 처리 중인데 재시도 요청이 다른 앱 인스턴스로 전달되면 두 서버가 거의 동시에 닉네임을 만들기 시작한다.

```java
String nickname = repository.findNickname(postId, userId);
if (nickname != null) {
    return nickname;
}

return createNickname(postId, userId);
```

두 서버는 모두 DB에서 “아직 닉네임이 없다”는 결과를 받는다.

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

한 JVM 안에서만 작동하는 `synchronized`나 로컬 락으로는 다른 서버의 요청을 막을 수 없다. 여러 서버의 경쟁을 제어하려면 분산 락을 쓰거나, 닉네임 배정 테이블에 DB 유니크 키를 두는 방식이 표준적이다.

하지만 당시에는 새로운 잠금 수단이나 테이블을 작업 범위에 넣기 어려운 상황이었다. 그래서 요청이 동시에 실행되지 않게 막는 대신, 어느 서버가 처리해도 같은 요청은 같은 순서로 닉네임 후보를 확인하도록 결정론적인 생성 방식을 택했다.

## 게시글과 사용자로 시드를 만든다

시드는 난수 생성기가 값을 만들기 시작할 때 사용하는 기준값이다. Java의 `Random`은 같은 시드로 생성하고 같은 순서로 호출하면 같은 난수열을 반환한다. 게시글과 사용자 값으로 시드를 만들고, 그 시드로 형용사와 명사를 고른다.

```java
long seed = 31L * postId + userId.hashCode();
Random random = new Random(seed);

String adjective = adjectives.get(random.nextInt(adjectives.size()));
String noun = nouns.get(random.nextInt(nouns.size()));
```

여기서 `String.hashCode()`[^string-hash]는 사용자 문자열을 같은 규칙의 숫자로 바꾸고, `31L`[^seed-31]은 두 값을 섞는 데 쓴다. `Random.nextInt()`[^random-next-int]는 그 시드로 목록에서 형용사와 명사를 고른다.

같은 게시글과 사용자의 요청이라면 서버가 달라도 시드는 같다. 다른 게시글에서는 `postId`가 달라지므로 다시 닉네임을 고른다. 여기까지는 의도와 맞는다.

하지만 두 번째 정책은 여전히 남는다. 이미 다른 사용자가 받은 닉네임을 피해야 한다. 이를 처리하려고 형용사와 명사를 따로 고르던 방식에서, 모든 조합을 순서 있는 하나의 목록으로 만든 뒤 시드로 선택 위치를 정하는 방식으로 바꿨다. 이미 배정된 닉네임은 이 목록에서 뺀 다음 남은 후보 중 하나를 골랐다.

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

후보의 상대적인 순서를 유지하고 `Math.floorMod()`[^floor-mod]로 같은 시드의 선택 위치를 계산했으니 결과도 같을 거라고 생각했다. 하지만 두 서버가 DB를 읽은 시점이 다르면 남은 후보 수도 달라진다.

아래에서는 시드를 `7`로 두고, 목록 위치를 `0`부터 센다.

| 서버가 DB에서 읽은 내용 | 선택에 사용한 후보 | 위치 계산 | 후보 중 선택 위치 | 결과 |
|---|---|---:|---:|---|
| 아직 배정된 닉네임 없음 | 멋진 사자, 조용한 여우, 용감한 고래, 행복한 토끼, 차분한 곰 | `7 mod 5 = 2` | 세 번째 | 용감한 고래 |
| 차분한 곰은 이미 배정됨 | 멋진 사자, 조용한 여우, 용감한 고래, 행복한 토끼 | `7 mod 4 = 3` | 네 번째 | 행복한 토끼 |

`용감한 고래`는 두 경우 모두 비어 있다. 그런데 목록 끝의 `차분한 곰`을 지우면 후보 수가 바뀌고, 같은 시드 `7`의 선택 위치도 세 번째에서 네 번째로 이동한다.

여기서 놓친 조건이 드러난다. 결과를 정하는 것은 시드뿐이 아니다. 후보의 내용과 순서, 고르는 방법, 각 서버가 DB에서 읽은 배정 현황도 결과를 바꾼다.

## 전체 후보의 순서에서 탐색한다

해결할 때는 이미 배정된 닉네임을 후보 목록에서 지우지 않는다. 전체 후보의 순서를 유지한 채 시드로 탐색을 시작할 위치를 정하고, 해당 닉네임이 사용 중일 때만 다음 후보로 넘어간다.

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

시드가 `7`이면 전체 후보 다섯 개에서 시작 위치는 `7 mod 5 = 2`다. 목록 위치를 `0`부터 세므로 세 번째 후보인 `용감한 고래`부터 확인한다.

```text
용감한 고래(세 번째)
→ 행복한 토끼(네 번째)
→ 차분한 곰(다섯 번째)
→ 멋진 사자(첫 번째)
→ 조용한 여우(두 번째)
```

| 서버가 DB에서 읽은 내용 | 확인하는 순서 | 결과 |
|---|---|---|
| 아직 배정된 닉네임 없음 | 용감한 고래 | 용감한 고래 |
| 차분한 곰은 이미 배정됨 | 용감한 고래 | 용감한 고래 |
| 용감한 고래는 이미 배정됨 | 용감한 고래(사용 중) → 행복한 토끼 | 행복한 토끼 |

시작 후보가 비어 있다면 다른 후보의 사용 여부는 결과를 바꾸지 않는다. 시작 후보가 사용 중이면 정해진 순서대로 다음 빈 후보를 찾으므로 탐색 앞부분의 DB 상태는 여전히 결과에 영향을 준다.

후보 목록도 모든 서버에서 같아야 한다. 배포 중 서버마다 형용사나 명사 목록의 내용과 순서가 다르면 같은 시드로 정한 시작 위치와 탐색 순서도 달라진다.

## 결정론만으로 해결되지 않는 경쟁 조건

전체 후보와 탐색 순서를 고정하면 DB에서 우연히 먼저 제거된 이름 때문에 같은 요청의 시작 위치가 달라지는 문제를 줄일 수 있다. 하지만 서로 다른 두 사용자가 저장 전에 같은 빈 닉네임을 고를 가능성은 남는다.

이 방식은 경쟁 조건을 완전히 없애는 대신 같은 요청이 서로 다른 결과를 만드는 범위를 줄인다. 한 게시글 안의 중복을 반드시 막아야 한다면 DB 유니크 키나 여러 서버가 함께 쓰는 잠금이 필요하다.

결국 이 수정이 안정시킨 것은 난수 자체가 아니라 닉네임을 찾는 순서였다. **결정론을 적용할 때는 시드뿐 아니라 후보 목록과 탐색 순서도 결과의 입력으로 봐야 한다.**

[^string-hash]: `String.hashCode()`는 같은 문자열을 같은 정수로 바꾼다. 서로 다른 문자열이 같은 정수가 될 수 있으므로 유일성을 보장하지는 않는다.
[^seed-31]: 31은 두 값을 단순히 이어 붙이지 않고 섞을 때 흔히 쓰는 작은 소수다. 유일성을 보장하지 않으며, `L`은 `long` 값으로 계산하겠다는 표시다.
[^random-next-int]: `Random.nextInt(bound)`는 `0`부터 `bound - 1` 사이의 값을 골라 목록 위치로 쓸 수 있게 한다.
[^floor-mod]: 여기서는 시드를 후보 수로 나눈 나머지를 `0`부터 시작하는 목록 위치로 쓴다. 후보 수가 바뀌면 같은 시드도 다른 위치가 된다.
