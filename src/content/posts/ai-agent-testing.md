---
title: "AI 에이전트가 만든 과도한 mock 테스트 줄이기"
slug: "ai-agent-testing"
description: "AI가 구현을 바꿔도 기능의 동작을 지키도록, 테스트 범위와 mock 사용 기준을 정리했다."
kind: "tech"
category: "ai"
publishedAt: "2026-04-20"
updatedAt: "2026-07-30"
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
  - title: "Atipico1/ai-testing-rules"
    url: "https://github.com/Atipico1/ai-testing-rules"
  - title: "Martin Fowler — Mocks Aren't Stubs"
    url: "https://martinfowler.com/articles/mocksArentStubs.html"
  - title: "Mockito — BDDMockito"
    url: "https://javadoc.io/doc/org.mockito/mockito-core/latest/org.mockito/org/mockito/BDDMockito.html"
  - title: "MyBatis 3 — Mapper XML Files"
    url: "https://mybatis.org/mybatis-3/sqlmap-xml.html"
  - title: "Testcontainers for Java — Database containers"
    url: "https://java.testcontainers.org/modules/databases/"
---

[Atipico1/ai-testing-rules](https://github.com/Atipico1/ai-testing-rules)를 읽다가 OpenAI Codex 저장소의 테스트를 살펴본 부분이 눈에 들어왔다. 내부 코드는 실제로 실행하고, HTTP처럼 시스템 밖으로 이어지는 경계에서만 mock을 사용한다는 내용이다. 고전파[^testing-style]에 가까운 방식이다.

반면 에이전트에게 별다른 기준 없이 테스트 작성을 맡기면 내부 객체 대부분을 mock으로 바꾸곤 한다. DAO와 매퍼의 반환값을 미리 정하고, `verify`로 메서드 호출 여부와 횟수를 확인한다. 런던파[^testing-style]에 가까운 테스트다.

이 차이가 중요하게 느껴진 이유는
우린 이제, 구현뿐 아니라 유지보수와 리팩터링에도 AI를 사용하기 때문이다.
> 구현 방식은 계속 바뀔 수 있지만, 기능이 보장해야 할 동작은 그대로 유지되어야 한다.

## 동일한 동작을 확인하기 위해 고전파를 선택했다

런던파 테스트가 항상 잘못된 것은 아니다. 객체 사이의 상호작용을 설계하는 데 도움이 될 수 있다. 문제는 에이전트가 이 방식을 거의 모든 내부 객체에 적용한다는 점이다.

에이전트가 작성한 주문 상태 조회 테스트는 다음과 같은 형태였다.

```java
@Test
void returns_order_status() {
    given(orderMapper.findById(1L))
        .willReturn(new OrderRow(1L, "READY"));

    String status = orderService.getStatus(1L);

    assertThat(status).isEqualTo("READY");
    verify(orderMapper).findById(1L);
}
```

이 테스트는 mock에 입력한 `"READY"`가 그대로 반환되는지, 서비스가 `findById`를 호출하는지 확인한다.

서비스를 리팩터링해 `findById` 대신 `findStatusById`를 호출하면 결과가 같아도 `verify`에서 실패한다.
> 이 기능에서 유지해야 할 것은 특정 메서드를 호출하는 과정이 아니라, 저장된 주문 상태를 올바르게 조회하는 동작이다.

반면 고전파 테스트는 내부 함수가 어떻게 호출되는지보다 외부에서 관찰되는 동작을 확인한다. AI가 구현을 정리하거나 다른 방식으로 다시 작성해도 반환값과 저장 상태가 유지되면 테스트는 통과한다.

다만 고전파를 선택했다고 모든 대상을 실제로 사용할 필요는 없다. 어떤 대상을 테스트 범위에 포함하고 어디서 mock을 사용할지는 따로 정해야 했다.

## DB까지 테스트 범위에 포함했다

DB를 사용하는 서버에서는 쿼리와 결과 매핑, 트랜잭션도 기능 동작의 일부다. 그래서 서버 로직과 DB를 나누지 않고 하나의 검증 대상으로 보았다. 특히 MyBatis처럼 SQL을 직접 작성하는 환경에서는 쿼리와 결과 매핑 오류까지 테스트에서 잡아야 했다.

주문 상태 조회 예시의 `orderMapper`는 MyBatis가 생성한 매퍼가 아니라 Mockito[^mockito] mock이다. `findById`를 호출하면 SQL을 실행하는 대신 `given`에서 지정한 `OrderRow`를 반환한다. 따라서 SQL과 MyBatis의 결과 매핑은 실행되지 않으며, 조회 컬럼이나 결과 매핑을 잘못 작성해도 이 테스트로는 오류를 발견할 수 없다.

SQL과 결과 매핑이 테스트에서 빠지지 않도록 테스트 방식을 다음과 같이 나눴다.

| 검증할 영역 | 테스트 방식 |
|---|---|
| 서비스 로직 | 실제 코드 실행 |
| SQL과 데이터베이스 동작 | 실제 MySQL 사용 |
| 외부 연동 API | mock 사용 |

`ai-testing-rules`의 mock 규칙은 DB와 ORM을 mock 대상으로 분류한다. 동시에 통합 테스트에서는 실제 DB를 사용하고, 위험도가 높은 영역부터 Testcontainers 같은 환경을 도입하도록 안내한다.

## MySQL을 실행하기 위해 Testcontainers를 선택했다

MySQL까지 테스트 범위에 포함하려면 테스트를 실행할 때 동일한 데이터베이스 환경을 준비할 수 있어야 한다. 사용하는 DB가 MySQL이어서 Testcontainers로 테스트용 MySQL 환경을 구성했다.

매퍼의 반환값을 미리 만들지 않고, 테스트 데이터베이스에 데이터를 넣은 뒤 실제 서비스 로직을 그대로 실행한다.

```java
@Test
void returns_order_status_saved_in_database() {
    jdbcTemplate.update(
        "INSERT INTO orders(id, status) VALUES (?, ?)",
        1L,
        "READY"
    );

    String status = orderService.getStatus(1L);

    assertThat(status).isEqualTo("READY");
}
```

## 실제 DB로 검증할 케이스를 추렸다

Testcontainers를 사용하면서 실제 DB에서 SQL과 결과 매핑까지 검증할 수 있었다. 하지만 실제 DB를 포함한 테스트에도 분명한 단점이 있었다.
실제 DB 테스트가 늘어나자 실행 시간이 길어지고, 테스트 데이터를 준비하는 부담도 커졌다. 또한 모든 케이스를 이 방식으로 작성하면 CI가 끝날 때까지 기다리는 시간이 길어지고 배포/개발 속도에도 영향을 줄 것이 분명했다.

그래서 테스트의 목표에 따라 검증 범위를 나누기로 했다.

| 테스트 대상 예시 | 테스트 방식 | 검증 내용 |
|---|---|---|
| 입력값 검증, 암호화, 계산 로직 | 단위 테스트 | 각 로직의 결과 |
| 대표적인 성공·실패 흐름과 반드시 보장해야 할 케이스 | 실제 DB를 포함한 통합 테스트 | SQL, 결과 매핑, 트랜잭션, DB 제약 조건 |

> **이 경험을 통해 테스트 방식은 하나로 정하기보다, 검증 목표와 비용에 맞춰 취사선택해야 한다는 것을 배웠다.**

## AI가 따르는 테스트 기준을 바꿨다

에이전트가 참고하는 테스트 가이드(또는 skills)도 다음과 같이 바꿨다.

- 먼저 기능에서 보장해야 할 동작을 정한다.
- 내부 함수의 호출 횟수보다 반환값과 저장 상태를 확인한다.
- DB 동작을 검증할 필요가 있는 대표 케이스에만 Testcontainers를 사용한다.
- 별도로 운영되는 외부 연동 API만 mock으로 바꾼다.

AI가 내부 구현을 바꾸더라도 기능은 동일하게 동작해야 한다. 그 동작을 검증하는 테스트는 **AI에게 코드를 맡기기 위한 전제**라고 생각한다.

이 기준을 구현 과정에서도 지키기 위해 ATDD로 완료 조건을 먼저 정하고, TDD로 세부 구현을 진행했다. 그 과정은 [인수 조건을 먼저 정하고 TDD로 구현하기](/posts/atdd-tdd-test-strategy/)에서 이어진다.

[^testing-style]: [Martin Fowler가 구분한 두 테스트 방식](https://martinfowler.com/articles/mocksArentStubs.html#ClassicalAndMockistTesting) 가운데 고전파(classical TDD)는 가능한 한 실제 객체를 함께 사용한다. 런던파(mockist TDD)는 테스트 대상과 협력하는 내부 객체를 mock으로 바꾸고 객체 사이의 호출도 검증한다. 고전파가 모든 테스트를 통합 테스트로 만든다는 뜻은 아니다.

[^mockito]: Java 테스트에서 실제 객체 대신 동작을 미리 정한 mock 객체를 만들고, 메서드 호출 여부를 확인할 수 있게 해 주는 라이브러리다.
