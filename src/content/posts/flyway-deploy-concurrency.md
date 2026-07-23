---
title: "Flyway out-of-order는 CI로, 중첩 배포는 직렬화로 막기"
slug: "flyway-deploy-concurrency"
description: "AI 사이드 프로젝트에서 Flyway의 버전 순서를 유지하면서 out-of-order, 중복 SQL과 겹치는 배포를 CI·배포 큐·DB 제약으로 나눠 막은 판단을 다룬다."
kind: "tech"
category: "database"
publishedAt: "2026-07-11"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["flyway", "database", "github-actions", "deployment"]
series:
  slug: "flyway-deployment"
  title: "AI 사이드 프로젝트의 Flyway 도입과 배포"
  order: 2
relatedPosts: []
references:
  - title: "Flyway — Out of Order setting"
    url: "https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace/flyway-out-of-order-setting"
  - title: "Flyway — Migrations"
    url: "https://documentation.red-gate.com/flyway/flyway-concepts/migrations"
  - title: "Flyway — Frequently Asked Questions"
    url: "https://documentation.red-gate.com/flyway/reference/usage/frequently-asked-questions"
  - title: "Spring Boot — Common Application Properties"
    url: "https://docs.spring.io/spring-boot/appendix/application-properties/index.html"
  - title: "GitHub Docs — Control the concurrency of workflows and jobs"
    url: "https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency"
  - title: "GitHub Changelog — Actions concurrency groups now allow larger queues"
    url: "https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/"
  - title: "GitHub Docs — Managing a merge queue"
    url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue"
---

AI로 빠르게 개발하던 사이드 프로젝트에 Flyway를 처음 도입하며 검토한 내용이다. 마이그레이션 파일을 코드와 함께 두어 AI가 DB 구조와 변경 이력을 따라갈 수 있게 하고 싶었다. 회사 실무에서는 쓰지 않던 기술이라 동작과 한계도 직접 확인해 보고 싶었다.

그 프로젝트에서 Flyway는 이미 적용된 버전보다 낮은 마이그레이션이 뒤늦게 나타나자 애플리케이션 기동을 거부했다. 에러 메시지는 `outOfOrder=true`로 실행을 허용할 수 있다고 알려줬다.

그럼 그냥 옵션을 켜면 되지 않을까. 실제 선택은 그렇게 간단하지 않았다. 낮은 버전을 막는 규칙은 귀찮은 제약인 동시에, 새 데이터베이스와 오래 운영한 데이터베이스가 같은 순서로 만들어진다는 보장이었다.

**사람과 AI가 마이그레이션 파일을 DB 변경 기록으로 사용하려면, 파일 집합뿐 아니라 적용 순서도 재현할 수 있어야 한다.**

## 적용 순서도 스키마의 일부다

마이그레이션은 독립적인 SQL 파일 묶음처럼 보이지만 보통 앞 파일의 결과를 다음 파일이 사용한다.

```text
V100: 컬럼 추가
V110: 새 컬럼 데이터 백필
V120: NOT NULL 제약 추가
```

**`V110`보다 `V100`이 먼저라는 사실은 파일명 장식이 아니라 스키마를 만드는 절차의 일부다.** Flyway는 로컬 파일과 `flyway_schema_history`를 비교하고, 아직 적용하지 않은 versioned migration을 버전순으로 처리한다.

두 방향의 불일치도 구분해야 한다.

| 상태 | 의미 |
|---|---|
| 낮은 로컬 버전이 DB에는 없음 | 이미 지나간 순서에 파일이 뒤늦게 등장했다 |
| DB 성공 이력에 있는 파일이 로컬에는 없음 | 적용된 마이그레이션이 코드에서 사라졌다 |

둘째 상태 때문에 마이그레이션이 얽힌 배포는 단순히 옛 애플리케이션 이미지로 되돌린다고 끝나지 않는다. DB 이력과 코드의 파일 집합을 다시 맞추는 정방향 수정이 필요하다.

## out-of-order를 켜면 얻는 것과 잃는 것

`outOfOrder=true`는 뒤늦게 온 낮은 버전을 실행한다. 여러 브랜치가 동시에 마이그레이션을 만들 때 배포 실패를 줄여준다. 대가는 환경 간 재현성이다.

```text
빈 DB:   V100 → V110 → V120
운영 DB: V100 → V120 → V110(out of order)
```

모든 마이그레이션이 서로 독립적이고 멱등이라면 결과가 같을 수 있다. 실제 파일 사이에 암묵적 의존이나 데이터 변환 순서가 있다면 결과가 달라질 수 있다. 같은 파일 집합으로 만든 두 DB가 다른 과정을 거치는 셈이다.

그래서 이번에는 `outOfOrder`를 켜지 않았다. 아직 적용되지 않은 낮은 파일의 버전을 최신 뒤로 옮기고, 빈 DB에서 전체 마이그레이션을 다시 적용해 운영 상태와 맞는지 검증했다.

기본값은 실행 경로와 버전에 기대므로 기억에 의존하지 않는 편이 낫다. Spring Boot 자동 설정을 쓴다면 해당 Boot 버전의 `spring.flyway.*` 프로퍼티와 실제 기동 로그를 함께 확인해야 한다.

## versioned migration도 SQL 자체의 안전성을 대신하지 않는다

Flyway에는 한 번만 적용되는 versioned migration과 체크섬이 바뀌면 다시 실행되는 repeatable migration이 있다.

| 종류 | 적합한 작업 |
|---|---|
| Versioned `V...` | 순서가 있는 DDL, 데이터 백필 |
| Repeatable `R...` | 다시 실행해도 최종 상태가 같은 뷰·함수 정의 |

백필 `INSERT`는 보통 versioned가 맞다. 하지만 “Flyway가 한 번만 실행한다”는 보장만 믿고 SQL을 비멱등으로 두면, 같은 SQL이 다른 버전 이름으로 두 번 추가됐을 때 중복 실행된다.

```sql
INSERT INTO catalog_item_tag (item_id, tag)
SELECT id, 'example'
FROM catalog_item;
```

가능하다면 논리 키에 UNIQUE 제약을 두고, 그 제약을 기준으로 재실행 안전한 SQL을 작성한다.

```sql
INSERT INTO catalog_item_tag (item_id, tag)
SELECT id, 'example'
FROM catalog_item
ON DUPLICATE KEY UPDATE tag = 'example';
```

**Flyway 이력, 재실행해도 안전한 SQL, DB 제약은 서로 다른 문제를 막는다. 하나가 다른 둘을 대신하지 않는다.**

## 타임스탬프 버전은 배포 순서를 보장하지 않는다

순차 정수 버전은 여러 사람이 동시에 `V121`을 만드는 충돌이 잦다. 타임스탬프 버전은 그 충돌을 크게 줄인다. 대신 숫자가 길고, 저작 시각과 적용 시각을 혼동하기 쉽다.

```text
먼저 만든 파일: V...100
나중에 만든 파일: V...110

실제 머지·배포: V...110 → V...100
```

타임스탬프는 파일 생성 순서를 표현할 뿐 PR 승인, merge queue, workflow 시작, 컨테이너 기동 순서를 통제하지 않는다. 파일명만으로 실제 적용 순서를 맞출 수 없는 이유다.

## 실행 중인 배포를 지키는 것과 모든 배포를 실행하는 것은 다르다

문제를 확인한 직후에는 다음 설정이면 배포가 순서대로 기다린다고 생각했다.

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

이 설정은 실행 중인 배포를 취소하지 않는다. 하지만 기본 concurrency queue는 pending 실행 하나만 유지한다. A가 실행 중이고 B가 pending일 때 C가 들어오면 B가 취소되고 C가 그 자리를 차지한다.

중간 릴리스를 모두 실행해야 한다면 `queue: max`를 선택할 수 있다. 최신 누적 커밋만 배포하면 되는 서비스라면 취소된 B의 변경도 후속 C에 포함되므로, 오래된 pending run을 모두 실행할 필요는 없다.

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
  queue: max
```

현재 공식 문서 기준으로 `queue: max`는 concurrency group마다 최대 100개를 대기시키며 `cancel-in-progress: true`와 함께 쓸 수 없다. 대기열에 들어간 순서와 실제 job 시작 순서가 항상 같다고 보장하지도 않는다. 따라서 이 설정은 pending run이 교체되는 일을 막는 수단이지, 배포 순서를 증명하는 수단이 아니다.

`queue: max`는 workflow 중첩과 pending 교체를 다룰 뿐 마이그레이션 버전을 검사하지 않는다. A에 `V120`, 뒤에 머지된 B에 `V115`가 있다면 둘을 정확히 순서대로 실행해도 B는 out-of-order 검증에 걸린다. Flyway의 DB 잠금도 동시 실행만 조정할 뿐, 서로 다른 애플리케이션 버전의 파일이 호환된다고 보장하지 않는다.

## 머지 전에 마이그레이션을 따로 검사한다

배포 직렬화는 이미 머지된 커밋을 순서대로 처리한다. Merge Queue는 머지 전에 앞선 PR이 포함된 상태로 CI를 다시 돌려 논리 충돌을 줄인다.

다만 매번 빈 DB만 만드는 테스트는 out-of-order 조건을 재현하지 못한다. Merge Queue만 추가해도 이 사각지대는 남는다. 마이그레이션이 포함된 PR에는 다음 검사가 별도로 필요하다.

- 기본 브랜치의 최신 versioned migration보다 새 파일의 버전이 큰가.
- 같은 내용의 SQL이 다른 버전으로 중복 추가되지 않았는가.
- 전체 파일을 빈 DB에 적용할 수 있는가.
- 데이터 백필의 논리 키를 DB 제약이 보호하는가.

단일 DB와 SQL 중심의 프로젝트에서는 Flyway의 단순한 파일 규칙이 여전히 유용했다. 문제는 Flyway 자체보다 여러 PR의 마이그레이션 버전과 배포 순서를 함께 검사하지 않은 데 있었다. 다른 도구로 바꿔도 이 검사가 없으면 같은 문제가 남는다.

**그래서 out-of-order 검증은 유지하고, 머지 전에는 버전 증가와 중복 SQL을 검사하며, 배포는 겹치지 않게 하고, 데이터 중복은 DB 제약으로 막기로 했다.**
