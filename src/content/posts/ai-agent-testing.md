---
title: "AI 에이전트가 만든 과도한 mock 테스트 줄이기"
slug: "ai-agent-testing"
description: "DAO·매퍼·내부 유틸까지 mock한 테스트가 리팩터링과 실제 매핑 오류에 취약했던 이유를 짚고, 외부 경계만 대역으로 두는 원칙을 에이전트 스킬에 반영한 판단을 다룬다."
kind: "tech"
category: "ai"
publishedAt: "2026-04-20"
updatedAt: "2026-07-24"
draft: false
deprecated: false
outdated: false
tags: ["testing", "ai-agent", "java", "testcontainers"]
series:
  slug: "ai-agent-server-testing"
  title: "AI 에이전트와 서버 테스트 전략"
  order: 1
relatedPosts: []
references:
  - title: "ai-testing-rules"
    url: "https://github.com/Atipico1/ai-testing-rules"
  - title: "OpenAI Codex"
    url: "https://github.com/openai/codex"
  - title: "Martin Fowler — Mocks Aren't Stubs"
    url: "https://martinfowler.com/articles/mocksArentStubs.html"
  - title: "Testcontainers for Java — Database containers"
    url: "https://java.testcontainers.org/modules/databases/"
---

`ai-testing-rules`라는 저장소의 글을 읽다가 눈에 걸리는 주장을 봤다. 저자는 OpenAI Codex 오픈소스의 테스트를 분석해, 내부 trait은 mock하지 않고 HTTP 경계에서만 대역을 사용한다고 정리했다. 그 분석에서 끌어낸 결론은 고전파 테스트의 문장과 닮아 있었다.

> 내부 구현은 실제로 실행하고, 프로세스 밖의 경계만 대역으로 바꾼다.

그런데 내가 에이전트에게 "테스트 짜줘"라고 요청했을 때 나온 코드는 반대였다. DAO와 유틸리티, 매퍼를 전부 mock하고 호출 횟수를 검증했다. 커버리지는 생겼지만 리팩터링하면 테스트가 먼저 무너졌다.

## 테스트를 살펴보니 내부 구현까지 가짜였다

Spring Boot, MyBatis, MySQL을 사용하는 서버의 테스트를 표본으로 분류했다. 공통 인프라와 별도 목적의 레거시 테스트를 제외해도, 내부 협력 객체를 mock한 테스트가 실제 실행 중심 테스트보다 많았다.

반복되는 패턴은 세 가지였다.

### 내부 유틸리티를 정적 mock으로 감쌌다

```java
try (MockedStatic<CryptoUtils> crypto = mockStatic(CryptoUtils.class)) {
    crypto.when(() -> CryptoUtils.decrypt(anyString()))
        .thenReturn("plain-text");
}
```

암복호화 유틸은 같은 프로세스 안에서 빠르게 실행할 수 있다. 이를 mock하면 실제 인코딩이나 키 처리 오류는 테스트 범위 밖으로 밀려난다.

### 객체 매핑 자체를 mock했다

```java
doReturn(mappedResponses)
    .when(mapper)
    .map(any(), any(Type.class));
```

필드 매핑이 중요한 동작인데 결과를 미리 만들어 돌려주면, 매핑 실수는 영원히 발견되지 않는다.

### private 메서드를 직접 호출했다

```java
ReflectionTestUtils.invokeMethod(service, "canProcess", userId, targetId);
```

public 동작의 결과가 아니라 내부 메서드 시그니처를 검증한다. 구현을 정리하는 순간 비즈니스 동작은 그대로인데 테스트가 깨진다.

## 고전파와 런던파의 차이를 mock 개수로만 보면 안 된다

```text
런던파에 가까운 테스트
테스트 → mock(DAO) → mock(유틸) → mock(매퍼) → 결과

고전파에 가까운 테스트
테스트 → 실제 서비스 → 실제 매퍼·DAO → 실제 테스트 DB → 결과
         외부 API 경계만 대역
```

고전파가 모든 테스트를 API E2E로 만들라는 뜻은 아니다. 순수 계산은 Spring 없이 단위 테스트할 수 있고, DB와 매퍼를 포함해야 의미가 있는 동작은 통합 테스트로 실행하면 된다. **빠르고 통제할 수 있는 내부 코드는 이유 없이 가짜로 바꾸지 않는다.**

| 실제로 실행 | 대역을 고려 |
|---|---|
| 순수 도메인 객체 | 외부 결제 API |
| 내부 서비스와 유틸 | 푸시·메일 서비스 |
| MyBatis 매퍼 | 객체 스토리지 |
| Testcontainers의 DB | 통제할 수 없는 외부 시스템 |

판단할 때는 이렇게 물었다.

> 이 대역을 제거하면 테스트가 느려지거나 비결정적으로 변하는가?

그렇지 않다면 실제 구현을 쓰는 쪽부터 검토했다.

## Testcontainers는 가짜 DB가 아니다

"운영 DB가 아니니 Testcontainers도 mock 아닌가"라는 의문이 들었다. 둘은 역할이 다르다.

```java
// mock: SQL은 실행되지 않는다.
given(orderMapper.findById(anyLong())).willReturn(fakeOrder);

// Testcontainers: 실제 DB 엔진에서 SQL이 실행된다.
jdbcTemplate.update("INSERT INTO orders(id, status) VALUES (?, ?)", 1L, "READY");
orderMapper.findById(1L);
```

컨테이너의 MySQL은 운영 데이터베이스는 아니지만 진짜 SQL, 인덱스, 트랜잭션, 컬럼 매핑을 실행한다. 매퍼 XML의 문법 오류와 스키마 불일치를 잡을 수 있다는 점에서 행동을 미리 정해 둔 mock과 다르다.

## 현실에 가까워지면 테스트는 더 자주 깨질 수 있다

통합 테스트는 순수 단위 테스트보다 느리다. 컨테이너를 JVM당 한 번 재사용해도 첫 기동 비용은 남는다. 스키마가 바뀌면 테스트도 깨진다.

처음에는 이를 단점으로만 봤다. 생각을 바꾼 지점은 "깨져야 할 때 깨지는가"였다. 데이터베이스 스키마가 바뀌었는데 DAO를 mock한 테스트가 계속 통과한다면 빠른 것이 아니라 현실과 끊긴 것이다.

그래서 테스트를 두 층으로 나눴다.

| 레벨 | 대상 | Spring Context | 대역 |
|---|---|---|---|
| 단위 테스트 | 상태 판정과 계산 같은 순수 로직 | 없음 | 없음 |
| 통합 테스트 | 서비스 public 동작과 DB 매핑 | 있음 | 외부 I/O만 |

given-when-then 구조는 그대로였다. given에서 mock 반환값을 세팅하는 대신 테스트 DB에 필요한 상태를 넣었다.

```java
// mock 중심 given
given(orderMapper.findById(anyLong())).willReturn(order);

// 실제 실행 중심 given
jdbcTemplate.update(
    "INSERT INTO orders(id, status) VALUES (?, ?)",
    1L,
    "READY"
);
```

## 문제는 에이전트가 읽는 가이드에도 있었다

테스트 결과만 고치면 다음 작업에서 같은 패턴이 반복된다. 에이전트가 읽던 테스트 스킬을 열어보니 DAO를 `@Mock`으로 두고 서비스를 `@InjectMocks`로 만드는 예시와, private 메서드를 리플렉션으로 호출하는 방법이 적혀 있었다.

에이전트가 임의로 런던파를 택한 것만은 아니었다. 내가 준 가이드가 그 방향을 강제하고 있었다.

스킬 이름을 특정 테스트 레벨에 묶지 않도록 바꾸고, 공통 원칙과 단위·통합 테스트 가이드를 분리했다.

```text
test/
├── SKILL.md
└── references/
    ├── integration-test-guide.md
    └── unit-test-guide.md
```

첫 줄에는 판단 원칙을 넣었다.

```text
협력 객체를 습관적으로 가짜로 바꾸지 않는다.
통제할 수 없는 외부 I/O에만 대역을 둔다.
```

그리고 반복해서 나온 금지 패턴과 대안을 함께 적었다.

| 피할 패턴 | 먼저 검토할 대안 |
|---|---|
| DAO `@Mock` + `@InjectMocks` | Testcontainers 통합 테스트 |
| 내부 유틸 정적 mock | 실제 유틸 실행 |
| private 메서드 직접 호출 | public 동작의 결과 검증 |
| 호출 횟수 `verify` | 반환값과 상태 변화 검증 |

## 다음 요청의 기본값을 바꿨다

기존 테스트에서 mock 경계를 확인하고, 실제로 실행할 내부 코드와 대역으로 둘 외부 경계를 나눴다. 그 기준을 테스트 스킬과 예시에 반영했다.

**리뷰마다 "DAO를 mock하지 마"라고 반복하기보다, 에이전트가 다음 테스트를 만들기 전에 읽는 가이드를 고치는 편이 효과적이었다.**
