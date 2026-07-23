---
title: "Flyway는 왜 낮은 버전을 거부하는가"
slug: "flyway-deploy-concurrency"
description: "Flyway out-of-order 검증의 이유와 멱등성, 타임스탬프 버저닝, GitHub Actions 배포 직렬화의 트레이드오프를 살펴본다."
kind: "tech"
publishedAt: "2026-07-11"
draft: false
deprecated: false
outdated: false
tags: ["flyway", "database", "github-actions", "deployment"]
series:
  slug: "flyway-deployment"
  title: "Flyway와 배포"
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

앞선 사고에서 Flyway는 이미 적용된 버전보다 낮은 마이그레이션이 뒤늦게 나타나자 애플리케이션 기동을 거부했다. 에러 메시지는 `outOfOrder=true`로 실행을 허용할 수 있다고 알려줬다.

그럼 그냥 옵션을 켜면 되지 않을까. 실제 선택은 그렇게 간단하지 않았다. 낮은 버전을 막는 규칙은 귀찮은 제약인 동시에, 새 데이터베이스와 오래 운영한 데이터베이스가 같은 순서로 만들어진다는 보장이었다.

## 적용 순서도 스키마의 일부다

마이그레이션은 독립적인 SQL 파일 묶음처럼 보이지만 보통 앞 파일의 결과를 다음 파일이 사용한다.

```text
V100: 컬럼 추가
V110: 새 컬럼 데이터 백필
V120: NOT NULL 제약 추가
```

`V110`보다 `V100`이 먼저라는 사실은 파일명 장식이 아니라 실행 전제다. Flyway는 로컬 파일과 `flyway_schema_history`를 비교하고, 아직 적용하지 않은 versioned migration을 버전순으로 처리한다.

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

백필 `INSERT`는 보통 versioned가 맞다. 하지만 “Flyway가 한 번만 실행한다”는 보장만 믿고 SQL을 비멱등으로 두면, 내용은 같고 버전만 다른 파일이 생기는 가장자리에서 중복된다.

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

Flyway의 이력 보장과 SQL의 멱등성, DB 제약은 서로 다른 방어선이다. 하나가 다른 둘을 대신하지 않는다.

## 타임스탬프 버전은 배포 순서를 보장하지 않는다

순차 정수 버전은 여러 사람이 동시에 `V121`을 만드는 충돌이 잦다. 타임스탬프 버전은 그 충돌을 크게 줄인다. 대신 숫자가 길고, 저작 시각과 적용 시각을 혼동하기 쉽다.

```text
먼저 만든 파일: V...100
나중에 만든 파일: V...110

실제 머지·배포: V...110 → V...100
```

타임스탬프는 파일 생성 순서를 표현할 뿐 PR 승인, merge queue, workflow 시작, 컨테이너 기동 순서를 통제하지 않는다. 버전 규칙만으로 적용 순서 정합을 보장할 수 없는 이유다.

## 실행 중인 배포를 지키는 것과 모든 배포를 실행하는 것은 다르다

사고 직후에는 다음 설정이면 배포가 순서대로 기다린다고 생각했다.

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

이 설정은 실행 중인 배포를 취소하지 않는다. 하지만 GitHub Actions의 기본 concurrency queue는 pending 실행 하나만 유지한다. A가 실행 중이고 B가 pending일 때 C가 들어오면 B는 취소되고 C가 그 자리를 차지한다. 따라서 `cancel-in-progress: false`는 “실행 중인 것을 보호한다”는 뜻이지 “모든 run을 순서대로 실행한다”는 뜻은 아니다.

그렇다고 B의 취소가 곧 B에 포함된 마이그레이션의 유실을 뜻하지는 않는다. 기본 브랜치의 C가 B의 후손인 일반적인 자동 배포라면 C의 파일 집합에도 B의 변경이 들어 있다. 중간 릴리스의 실행 자체가 꼭 필요한지, 최신 누적 커밋만 배포하면 되는지를 먼저 구분해야 한다.

모든 run을 반드시 실행해야 한다면 GitHub가 2026년 5월부터 제공하는 `queue: max`를 쓸 수 있다. 현재 공식 문서 기준으로 최대 100개가 대기하고, concurrency group을 기다리기 시작한 순서에 따라 처리된다.

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
  queue: max
```

`queue: max`와 `cancel-in-progress: true`는 함께 쓸 수 없다. 배포 도중 마이그레이션이 일부 적용된 상태로 프로세스를 끊고 싶지 않다면 진행 중인 배포를 완료시키는 선택이 자연스럽다. 반면 누적형 배포에서 오래된 pending run까지 전부 실행하면 불필요한 롤아웃이 늘어난다. `queue: max`는 무조건적인 정답이 아니라 “모든 중간 배포의 실행이 필요하다”는 정책을 선택하는 옵션이다.

여기에도 경계는 있다. 공식 문서는 실제 job 시작 시각 차이 때문에 순서가 절대적으로 보장된다고 보지 말라고 주의하고, 큐의 최대 크기도 존재한다. 저장소와 GitHub Enterprise Server 버전처럼 실행 환경이 다르면 지원 여부를 실제 검증해야 한다.

더 중요한 경계는 `queue: max`의 책임 범위다. 이 설정은 workflow가 겹치거나 중간 pending 실행이 교체되는 문제를 막지만, 마이그레이션 버전의 단조 증가까지 검사하지 않는다.

```text
배포 A: V120 포함
배포 B: 뒤에 머지됐지만 V115 포함
```

FIFO로 A 다음 B를 정확히 실행해도 B는 out-of-order 검증에 걸린다. Flyway의 데이터베이스 잠금도 여러 프로세스의 마이그레이션 실행을 조정할 뿐, 서로 다른 애플리케이션 버전의 파일 집합이 호환된다는 뜻은 아니다. 따라서 배포 큐는 아래의 머지 전 버전 검사와 함께 있어야 한다.

## merge queue와 마이그레이션 전용 검사가 한 겹을 더한다

배포 직렬화는 이미 머지된 커밋을 순서대로 처리한다. Merge Queue는 머지 전에 앞선 PR이 포함된 상태로 CI를 다시 돌려 논리 충돌을 줄인다.

다만 매번 빈 DB만 만드는 테스트는 out-of-order 사고를 재현하지 못한다. Merge Queue만 추가해도 이 사각지대는 남는다. 마이그레이션이 포함된 PR에는 다음 검사가 별도로 필요했다.

- 기본 브랜치의 최신 versioned migration보다 새 파일의 버전이 큰가.
- 같은 내용의 SQL이 다른 버전으로 중복 추가되지 않았는가.
- 전체 파일을 빈 DB에 적용할 수 있는가.
- 데이터 백필의 논리 키를 DB 제약이 보호하는가.

“Flyway를 계속 써도 되는가”라는 질문의 답도 여기서 정리됐다. 단일 DB와 SQL 중심의 팀에서 파일명 규칙만으로 마이그레이션을 운영하는 단순함은 여전히 컸다. 우리가 밟은 가장자리는 도구를 교체한다고 자동으로 사라지는 문제가 아니라, 공유 DB에 들어오는 마이그레이션 버전과 애플리케이션 배포 순서를 함께 통제해야 하는 운영 문제였다.

Flyway의 엄격한 순서 검증을 유지하되, 그 엄격함이 운영에서 갑자기 드러나지 않도록 merge, CI, deploy, DB 제약에 각각 방어선을 두는 쪽을 택했다.
