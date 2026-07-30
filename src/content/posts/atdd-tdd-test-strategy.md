---
title: "ATDD로 완료 조건을 설정하고 TDD로 구현하기"
slug: "atdd-tdd-test-strategy"
description: "AI에게 구현을 맡기기 전에 인수 조건과 예외 케이스를 정하고, 단위·통합 테스트로 완료 여부를 검증하는 방법."
kind: "tech"
category: "java"
publishedAt: "2026-06-16"
updatedAt: "2026-07-30"
draft: false
deprecated: false
outdated: false
tags: ["testing", "tdd", "atdd", "ai-agent"]
series:
  slug: "ai-agent-server-testing"
  title: "AI 에이전트와 서버 테스트 전략"
  order: 2
relatedPosts: ["ai-dev-pipeline"]
references:
  - title: "Agile Alliance — Acceptance Test Driven Development"
    url: "https://agilealliance.org/glossary/atdd/"
  - title: "Agile Alliance — Behavior Driven Development"
    url: "https://agilealliance.org/glossary/bdd/"
  - title: "Martin Fowler — Test Driven Development"
    url: "https://martinfowler.com/bliki/TestDrivenDevelopment.html"
  - title: "Martin Fowler — Mocks Aren't Stubs"
    url: "https://martinfowler.com/articles/mocksArentStubs.html"
  - title: "Growing Object-Oriented Software, Guided by Tests"
    url: "https://growing-object-oriented-software.com/"
  - title: "Spring Boot Reference — Testing Spring Boot Applications"
    url: "https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html"
  - title: "Spring Framework Reference — Integration Testing"
    url: "https://docs.spring.io/spring-framework/reference/testing/integration.html"
---

테스트는 구현이 요구사항을 충족하는지 검증해야 한다. 하지만 구현을 마친 뒤 AI에게 테스트 작성을 맡기면, AI는 이미 만들어진 코드를 기준으로 '통과 가능한' 테스트를 만드는 경우가 많았다. (이건 사람이 작성해도 마찬가지. 구현 과정에서 굳어진 생각은 테스트 케이스의 범위를 좁히고 일부 케이스를 빠뜨리게 한다.) 테스트가 구현을 검증하는 것이 아니라, 구현이 테스트의 기준이 되는 셈이었다.

이를 막기 위해 요구사항에서 인수 조건을 먼저 만들고, 이를 확정한 뒤 구현을 시작하도록 개발 워크플로우를 구성했다. 인수 조건을 검증하는 테스트는 기능 전체의 완료 기준으로 두고, AI는 그 안에서 TDD를 반복하며 필요한 모듈을 구현한다.

## 구현 전에 기능의 완료 조건부터 정하기

ATDD[^atdd-bdd]는 기획자와 개발자, 테스터가 구현 전에 인수 조건을 함께 정하고 테스트 케이스로 구체화하는 방식이다. 정확히는 ATDD 전체를 그대로 적용한 것이 아니라, 구현 전에 인수 조건을 정하고 이를 완료 기준으로 삼는 방식을 AI 개발 워크플로우에 가져왔다. 요구사항을 바탕으로 AI가 인수 조건을 만들고, 나는 빠졌거나 해석이 필요한 조건만 추가하거나 확정한다.

인수 조건에는 기능이 완료되기 위해 충족해야 할 사항을 담는다. 하나라도 빠지면 기능이 완성된 것으로 보지 않는다.
확정한 조건은 실제 요청 흐름에 맞춰 시나리오로 정리한다. 회원 가입이라면 `201 Created`를 반환하고 회원 정보가 저장되는 것까지 완료 조건에 포함한다.

예외 케이스를 정하면서 처음 전달한 요구사항의 미흡한 부분도 자연스럽게 보완된다.
- 회원 가입이라면 이미 가입된 이메일을 어떻게 처리할지, 비밀번호 정책을 위반했을 때 어떤 응답을 줄지도 정해야 한다.

회원 가입 기능이라면 구현 전에 다음 시나리오를 작성한다.

```text
Feature: 회원 가입

Scenario: 정상적으로 회원 가입한다
  Given 가입되지 않은 이메일이다
  When 회원 가입을 요청한다
  Then 201 Created를 반환한다
  And "회원 가입이 완료되었습니다"라는 메시지를 반환한다
  And 회원이 ACTIVE 상태로 저장된다

Scenario: 이미 가입된 이메일로 회원 가입한다
  Given 이미 가입된 이메일이다
  When 회원 가입을 요청한다
  Then 409 Conflict를 반환한다
  And "이미 가입된 이메일입니다"라는 메시지를 반환한다
  And 회원은 저장되지 않는다

Scenario: 비밀번호 정책을 만족하지 않는다
  Given 가입되지 않은 이메일이다
  When 정책을 만족하지 않는 비밀번호로 회원 가입을 요청한다
  Then 400 Bad Request를 반환한다
  And "비밀번호 정책을 충족하지 않습니다"라는 메시지를 반환한다
  And 회원은 저장되지 않는다
```

이 세 시나리오가 기능의 완료 조건이 된다. 정상 가입만 구현하고 중복 이메일이나 잘못된 비밀번호를 처리하지 않으면 기능이 완성된 것으로 보지 않는다. AI가 일부 시나리오를 빠뜨리거나 기능 범위를 임의로 줄이지 않도록, 반드시 지켜야 할 동작을 구현 전에 확정한다.

## 인수 조건에 맞춰 테스트 수준 나누기

인수 조건을 확정할 때는 각 조건을 어느 범위에서 검증할지도 함께 정했다. 하나의 모듈 안에서 입력과 결과를 확인할 수 있는 조건은 단위 테스트로, 여러 모듈의 연결이나 API 응답과 DB 상태까지 확인해야 하는 조건은 통합 테스트로 작성했다.

| 인수 조건에서 나온 케이스 | 테스트 종류 | 확인할 내용 |
|---|---|---|
| 정상적으로 회원 가입한다 | 통합 테스트 | `201 Created` 응답, 안내 메시지와 저장된 회원 상태 |
| 이미 가입된 이메일로 요청한다 | 통합 테스트 | `409 Conflict` 응답, 오류 메시지와 변경되지 않은 DB 상태 |
| 비밀번호 정책을 만족하지 않는다 | 통합 테스트 | `400 Bad Request` 응답, 오류 메시지와 회원이 저장되지 않은 상태 |
| 비밀번호 정책의 세부 조건 | 단위 테스트 | 길이, 숫자와 특수문자 포함 여부와 검증 결과 |

하나의 인수 조건에서 통합 테스트와 단위 테스트가 함께 나올 수도 있다. 통합 테스트는 비밀번호 정책을 위반한 요청이 거절되는 전체 흐름을 확인하고, 단위 테스트는 정책을 구성하는 조건을 하나씩 확인한다.

실제 DB를 포함한 통합 테스트는 실행 비용이 크기 때문에 대표적인 성공·실패 흐름만 남겼다. 비밀번호 길이와 이메일 형식처럼 DB 없이 확인할 수 있는 세부 조합은 단위 테스트로 나눴다.

## 인수 조건을 Red로 두고 세부 구현 시작하기

인수 조건과 이를 검증할 테스트 구성을 확정한 뒤, 구현에 앞서 테스트 코드를 작성했다. 아직 필요한 구현이 없으므로 테스트는 Red가 된다. 이 글에서 인수 조건을 Red 또는 Green이라고 표현하는 것은 해당 조건을 검증하는 테스트의 상태를 뜻한다.

단위 테스트로 검증할 조건은 해당 테스트에서 TDD[^tdd-cycle] 주기를 바로 반복한다. 통합 테스트로 검증할 조건은 통합 테스트를 Red로 둔 채 필요한 모듈을 같은 주기로 구현하고, 마지막에 통합 테스트를 Green으로 만든다. 바깥의 완료 조건에서 안쪽 구현으로 들어가는 순서는 outside-in[^outside-in] 흐름과 닮아 있다.

```text
요구사항 전달
      ↓
AI가 인수 조건과 예외 케이스 작성
      ↓
필요한 조건 추가·확정
      ↓
인수 조건을 검증할 테스트 구성
      ↓
선택한 테스트 Red
      ├─ 단위 테스트 → Green → Refactor
      └─ 통합 테스트
             ↓
         필요한 모듈마다 Red → Green → Refactor
             ↓
         통합 테스트 Green
      ↓
다음 인수 조건 반복
      ↓
모든 인수 조건 Green
      ↓
기능 전체 Refactor
```

## 구현 방법은 맡기되 완료 조건은 지키기

AI는 클래스 구조와 구현 순서를 스스로 정하고, 필요한 단위 테스트도 추가한다. 대신 확정한 인수 조건을 삭제하거나, 이미 정한 예상 결과를 코드에 맞춰 바꾸지는 않는다. 모든 인수 조건을 검증하는 테스트가 Green이 되어야 기능이 완료된다.

요구사항이 바뀌면 코드부터 고치지 않는다. 인수 조건과 테스트의 예상 결과를 먼저 수정한 뒤, 다시 Red에서 구현을 시작한다.

[^atdd-bdd]: BDD도 서버의 API 응답과 도메인 동작을 표현할 수 있다. 다만 BDD가 주어진 상황에서 시스템이 어떻게 동작해야 하는지 설명하는 데 초점을 둔다면, ATDD는 기능이 언제 완료됐다고 판단할지 구현 전에 정하는 데 더 직접적이다. 이 글에서는 AI가 구현을 시작하기 전에 완료 조건을 구현의 기준으로 두는 것이 목적이었기 때문에 ATDD를 선택했다.

[^tdd-cycle]: TDD는 특정 테스트 종류가 아니라 실패하는 테스트를 먼저 작성하고(Red), 테스트를 통과할 만큼 구현한 뒤(Green), 코드를 정리하는(Refactor) 개발 주기다.

[^outside-in]: outside-in TDD는 시스템 바깥의 테스트에서 시작해 협력 객체에 필요한 동작을 따라 안쪽으로 구현하는 방식으로, 보통 런던파(mockist TDD)와 함께 설명된다. 이 글에서는 mock으로 객체 간 상호작용을 설계하는 방식까지 적용하지 않고, 완료 조건에서 세부 구현으로 내려가는 순서만 가져왔다.
