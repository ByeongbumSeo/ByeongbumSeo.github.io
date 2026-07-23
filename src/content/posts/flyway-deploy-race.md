---
title: "Flyway 배포 순서에서 생긴 out-of-order와 중복 마이그레이션"
slug: "flyway-deploy-race"
description: "AI 사이드 프로젝트에서 머지·배포 순서가 어긋나 낮은 버전이 뒤늦게 나타나고, 같은 백필이 다른 버전으로 두 번 적용된 원인을 보여준다."
kind: "tech"
category: "database"
publishedAt: "2026-07-11"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["flyway", "database", "github-actions", "side-project"]
series:
  slug: "flyway-deployment"
  title: "AI 사이드 프로젝트의 Flyway 도입과 배포"
  order: 1
relatedPosts: []
references:
  - title: "Flyway — Validate"
    url: "https://documentation.red-gate.com/flyway/reference/commands/validate"
  - title: "Flyway — Schema history table"
    url: "https://documentation.red-gate.com/flyway/flyway-concepts/migrations/flyway-schema-history-table"
  - title: "Flyway — Frequently Asked Questions"
    url: "https://documentation.red-gate.com/flyway/reference/usage/frequently-asked-questions"
  - title: "Spring Boot — Common Application Properties"
    url: "https://docs.spring.io/spring-boot/appendix/application-properties/index.html"
  - title: "GitHub Docs — Control the concurrency of workflows and jobs"
    url: "https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency"
  - title: "MySQL 8.0 Reference Manual — Statements That Cause an Implicit Commit"
    url: "https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html"
---

AI를 활용해 빠르게 개발하던 사이드 프로젝트에 Flyway를 처음 도입했다. 회사 실무에서는 사용하지 않던 기술이었고, 이 글은 그 사이드 프로젝트의 실제 배포에서 겪은 문제를 다룬다.

애플리케이션 코드는 저장소에 남아도 DB를 언제, 왜 바꿨는지는 흩어지기 쉬웠다. **마이그레이션 파일을 코드와 함께 관리해 사람과 AI가 같은 변경 이력과 적용 순서를 읽게 하는 것이 도입 목적이었다.**

그 프로젝트에서 기능 두 개가 짧은 간격으로 머지된 뒤, 배포 서버가 새 컨테이너를 띄우지 못했다. 낮은 버전의 Flyway 마이그레이션이 이미 더 높은 버전이 적용된 데이터베이스에 뒤늦게 들어온 게 시작이었다.

그 문제를 고치던 중에는 더 곤란한 일이 생겼다. 두 사람이 같은 백필 파일을 서로 다른 새 버전으로 각각 고쳤고, 두 파일이 모두 적용되면서 데이터가 두 번 들어갔다.

각 PR만 보면 유효했고 Flyway도 기록된 버전대로 동작했다. **빠져 있던 것은 뒤늦게 머지되는 마이그레이션의 버전을 검사하는 단계와 배포가 겹치지 않게 하는 장치였다.**

Flyway는 여러 인스턴스가 동시에 마이그레이션을 시작해도 데이터베이스 잠금으로 실행 자체를 조정한다. 문제는 같은 SQL이 물리적으로 동시에 실행된 것이 아니라, 서로 다른 파일 집합을 가진 애플리케이션 버전 중 어느 쪽이 먼저 공유 DB의 이력을 바꾸느냐였다.

## 문제가 생긴 배포 조건

당시 배포 구조에는 네 가지 특징이 있었다.

- Spring Boot가 기동할 때 Flyway versioned migration을 적용했다.
- 파일명은 타임스탬프 기반 `V{yyyyMMddHHmmss}__description.sql`이었다.
- 이미 적용된 파일은 수정하거나 삭제하지 않고 새 마이그레이션으로만 고쳤다.
- 기본 브랜치에 서버 변경이 들어오면 GitHub Actions가 자동 배포했지만, 배포 workflow에는 동시성 그룹이 없었다.

`out-of-order`를 허용하지 않는 설정에서 이미 적용된 버전보다 낮은 미적용 파일이 발견되면 애플리케이션 기동이 실패한다. 컨테이너가 올라오지 않으니 헬스체크도 실패했다.

문제가 된 백필은 다음 두 작업을 함께 했다.

```sql
-- 같은 값을 다시 써도 결과가 같은 UPDATE
UPDATE catalog_item
SET status = 'READY'
WHERE status IS NULL;

-- 다시 실행하면 행이 누적되는 INSERT
INSERT INTO catalog_item_tag (item_id, tag)
SELECT id, 'example'
FROM catalog_item
WHERE ...;
```

`UPDATE`는 이 경우 멱등이었지만 `INSERT`는 아니었다. 이 차이가 뒤에서 데이터 오염의 모양을 결정했다.

## 첫 번째 실패: 낮은 버전이 뒤늦게 나타났다

먼저 기능 A의 마이그레이션이 머지됐다. 파일을 만든 시각은 더 빨랐지만, 그보다 높은 버전의 기능 B 마이그레이션이 이미 운영 DB에 적용된 뒤였다.

```text
DB에 적용된 최신 버전: V...110
뒤늦게 들어온 파일:    V...100
```

Flyway 검증은 `V...100`을 “로컬에는 있지만 DB에는 없고, 이미 적용된 버전보다 낮은 파일”로 판단했다. `flywayInitializer`가 실패했고 애플리케이션도 기동하지 못했다.

아직 운영 DB에 성공적으로 적용되지 않은 파일이었으므로 내용은 건드리지 않고 버전만 현재 최신값 뒤로 옮겼다.

```text
V...100__feature_a.sql → V...120__feature_a.sql
```

이미 적용된 마이그레이션을 바꾼 것이 아니기 때문에 체크섬 이력을 훼손하지 않았다. 첫 장애는 이 변경으로 해소됐다.

## 두 번째 실패: 머지 순서와 적용 순서가 갈렸다

그 사이 별도의 백필 PR도 준비돼 있었다. 두 PR이 수십 초 간격으로 머지됐고, 동시성 제한이 없는 배포가 겹쳤다.

```text
배포 A: 리네임된 기능 마이그레이션 V...120 적용
배포 B: 그보다 낮은 백필 V...115 적용 시도
```

배포 A가 먼저 DB의 최신 버전을 올렸다. 조금 늦게 시작한 배포 B는 자신이 포함한 `V...115`를 적용하려다 out-of-order 검증에 걸렸다. 파일을 만든 순서와 PR을 머지한 순서, 실제 Flyway가 DB에 적용한 순서가 서로 다른 축이라는 사실을 그때 분명히 봤다.

타임스탬프 버전은 여러 사람이 동시에 파일을 만들 때 번호 충돌을 줄여준다. **먼저 만든 파일이 먼저 배포된다는 보장은 하지 않는다.**

## 세 번째 실패: 같은 수정을 두 사람이 각각 만들었다

백필 버전을 최신값 뒤로 옮기면 된다는 진단은 맞았다. 문제는 장애를 보던 두 사람이 서로의 작업을 알기 전에 같은 결론에 도달했다는 것이다.

```text
V...130__backfill_catalog_item.sql
V...131__backfill_catalog_item.sql
```

두 PR은 각각 하나만 보면 올바른 수정이었다. 둘 다 CI를 통과했고 둘 다 배포됐다. 파일 내용의 해시는 같았지만 버전이 달랐다.

Flyway는 versioned migration을 파일 내용의 전역 해시로 중복 제거하지 않는다. 버전이 다르면 서로 다른 마이그레이션이다. 따라서 동일한 SQL이 두 번 실행됐다.

- 같은 값으로 덮어쓴 `UPDATE` 결과는 변하지 않았다.
- 중복 방지 키가 없던 `INSERT` 행은 두 배로 늘었다.
- 애플리케이션은 정상 기동했고 헬스체크도 통과했기 때문에 즉시 알람이 울리지 않았다.

이게 오히려 기동 실패보다 늦게 발견된 이유였다.

## 처음에는 배포 재시도를 의심했다

데이터가 정확히 두 배인 걸 보고 “같은 배포가 재시도됐나?”부터 확인했다. 각 workflow run은 한 번씩 정상 수행됐고 컨테이너의 비정상 재시작도 없었다. 배포 로그만 봐서는 원인이 나오지 않았다.

진단이 풀린 건 `flyway_schema_history`를 본 뒤였다. 같은 설명을 가진 서로 다른 버전 두 개가 성공으로 기록돼 있었다. 두 SQL 파일의 해시를 비교하니 바이트 단위로 같았다.

```bash
shasum V...130__backfill_catalog_item.sql \
       V...131__backfill_catalog_item.sql
```

두 번 실행된 것은 한 배포가 아니라 내용이 같은 서로 다른 versioned migration 두 개였다. 데이터가 N배가 됐을 때 재시도 횟수만 볼 게 아니라, 실제 데이터를 쓰는 계층의 실행 이력을 먼저 확인해야 했다.

## 롤백 대신 정방향으로 수습했다

이전 이미지를 다시 띄우는 것만으로는 해결되지 않았다. 운영 DB에는 새 버전의 성공 이력이 남아 있는데 옛 이미지에는 그 파일이 없으면, 이번에는 “DB에는 적용됐지만 로컬에서 찾을 수 없는 마이그레이션” 검증에 걸릴 수 있다.

이미 적용된 두 백필 파일도 삭제하지 않았다. 대신 새 마이그레이션에서 중복을 제거하고 같은 논리 키에 UNIQUE 제약을 추가했다.

```sql
DELETE duplicate
FROM catalog_item_tag duplicate
JOIN (
    SELECT item_id, tag, MIN(id) AS survivor_id
    FROM catalog_item_tag
    GROUP BY item_id, tag
) survivor
  ON duplicate.item_id = survivor.item_id
 AND duplicate.tag = survivor.tag
WHERE duplicate.id > survivor.survivor_id;

ALTER TABLE catalog_item_tag
  ADD CONSTRAINT uk_catalog_item_tag
  UNIQUE (item_id, tag);
```

정리와 제약을 한 마이그레이션, 한 배포에 연달아 넣어 릴리스 사이의 공백을 없앴다. 그렇다고 두 문장이 하나의 트랜잭션이 되는 것은 아니다. MySQL의 `ALTER TABLE`은 기존 트랜잭션을 암묵적으로 끝내므로, 쓰기가 계속되는 환경이라면 정리와 제약 사이의 경합을 별도로 막거나 제약 추가 직전에 다시 확인해야 한다.

## 왜 CI와 애플리케이션 검증이 못 잡았나

검사는 있었지만 각각 다른 이유로 문제를 놓쳤다.

1. CI는 매번 빈 DB에 파일을 버전순으로 전부 적용했다. “이미 높은 버전이 적용된 DB에 낮은 파일이 나중에 등장하는 상태”를 만들지 못했다.
2. 내용이 같아도 버전이 다르면 Flyway 입장에서는 정상적인 두 파일이라 빈 DB 마이그레이션도 통과했다.
3. 애플리케이션 검증은 키워드를 `Set`으로 접어 확인해 DB의 중복 행이 관측되지 않았다.
4. 테이블에는 논리적 중복을 막는 UNIQUE 제약이 없었다.

수습 뒤에는 다음 순서로 검증했다.

- 빈 DB에서 동일한 두 백필을 적용해 중복을 재현했다.
- 정리 마이그레이션 뒤 중복이 0인지 확인했다.
- UNIQUE 제약이 같은 키의 재삽입을 거부하는 테스트를 추가했다.
- 움직인 기본 브랜치 위로 다시 맞춘 뒤 빈 DB 전체 마이그레이션을 재실행했다.
- 공개 API의 합성 테스트 데이터 전체를 조회해 누락과 중복을 확인했다.

사람에게 “긴급 수정 전에 열린 PR을 확인하자”는 규칙도 필요하다. 하지만 장애 중 두 사람이 같은 해결책을 동시에 떠올리는 건 자연스럽다. 그래서 마이그레이션 버전을 머지 전에 검사하고, 애플리케이션 배포를 겹치지 않게 하며, 데이터베이스 제약으로 중복을 막았다.

배포 직렬화만으로 낮은 버전이 안전해지지는 않는다. 위 예시를 A 다음 B 순서로 정확히 줄 세워도 `V...120` 뒤에 `V...115`가 나타나면 B는 그대로 실패한다. 직렬화는 겹치는 롤아웃을 없애고 순서를 관측 가능하게 만들 뿐이고, 버전 순서 자체는 CI나 merge queue의 마이그레이션 전용 검사로 보장해야 한다.

**PR 하나가 유효하다고 해서 공유 DB의 버전 순서까지 안전한 것은 아니다. 내용이 같아도 버전이 다르면 Flyway는 별개의 마이그레이션으로 실행한다.**
