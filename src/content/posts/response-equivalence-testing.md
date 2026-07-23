---
title: "최적화가 결과를 바꾸지 않았다는 걸 어떻게 증명할까"
slug: "response-equivalence-testing"
description: "슬로우 쿼리 수정 전후의 API에 같은 합성 요청을 보내 건수뿐 아니라 정렬·커서·필드 값까지 비교한 응답 동일성 검증을 설계한다."
kind: "tech"
publishedAt: "2026-07-15"
draft: false
deprecated: false
outdated: false
tags: ["testing", "api", "mysql", "performance"]
series:
  slug: "slow-query-verification"
  title: "슬로우 쿼리 개선과 검증"
  order: 2
relatedPosts: ["rest-api"]
references:
  - title: "MySQL 8.0 Reference Manual — EXPLAIN ANALYZE Statement"
    url: "https://dev.mysql.com/doc/refman/8.0/en/explain.html#explain-analyze"
  - title: "RFC 8259 — The JavaScript Object Notation Data Interchange Format"
    url: "https://www.rfc-editor.org/rfc/rfc8259"
---

쿼리가 10배 빨라졌다는 것과 같은 결과를 돌려준다는 것은 별개의 주장이다. 1편에서 추가한 날짜 하한은 원래 결과의 상위집합이므로 안전하다고 설명할 수 있었지만, 실제 API에는 정렬, 커서, 필터 분기, 후처리가 더 있었다.

`COUNT(*)` 하나가 같다는 확인으로는 부족했다. 서로 다른 행 집합도 건수는 같을 수 있고, 같은 행도 순서가 달라지면 커서 기반 페이지는 깨진다. 그래서 수정 전·후 서버에 같은 요청을 보내 최종 JSON을 비교했다.

이 글에서도 1편과 같은 합성 스키마 `content_item`을 사용한다.

```text
주요 컬럼: id, title, created_at, extra_days, deleted,
          available, category, region_code, ranking_score
인덱스:   idx_content_item_created_at, idx_content_item_extra_days
엔드포인트: POST /api/items/search
```

실제 검증에서는 변경이 없는 개발 데이터에 수정 전·후 빌드의 같은 요청을 보냈다. 공개 글에서는 요청 토큰, 회원 속성, 콘텐츠 제목, 식별자를 버리고, 당시 지나간 분기와 경계값을 같은 형태의 합성 fixture로 옮겼다. 아래 값은 재현용 예시이고 운영 데이터가 아니다.

## 비교 환경부터 같게 만들었다

비교 대상은 두 애플리케이션 빌드다.

```text
baseline  : 수정 전 쿼리, localhost:8081
candidate : 수정 후 쿼리, localhost:8082
```

핵심은 두 호출 사이에 데이터가 바뀌지 않는 것이다. 실제 비교에서는 변경이 없는 같은 개발 데이터로 확인했다. 자동화된 회귀 환경이라면 같은 seed의 읽기 전용 DB 스냅샷을 두 개 복제해 각 빌드에 하나씩 주는 편이 더 재현 가능하다. 한 가변 DB를 공유하면 첫 요청과 둘째 요청 사이의 변경이 코드 차이처럼 보일 수 있다.

시간 조건도 주의했다. 응답의 `serverTime`처럼 호출 시각에 따라 값이 달라지는 필드는 값만 정규화했다. 필드의 존재와 타입까지 지우면 candidate가 그 필드를 누락한 회귀도 통과하기 때문이다. 날짜 경계 바로 위와 아래의 fixture는 두 빌드가 같은 기준 시각을 쓰도록 고정하고, 일반 동일성 데이터는 몇 밀리초 차이에 결과가 바뀌지 않도록 경계에서 충분히 떨어뜨렸다. 쿼리가 DB의 `NOW()`를 직접 쓴다면 애플리케이션 `Clock`만 고정해서는 부족하므로 테스트용 기준 시각 파라미터나 DB 세션 시각까지 함께 통제해야 한다.

속도와 동일성도 같은 측정으로 섞지 않았다.

- **동일성**: 같은 fixture와 요청에서 정규화한 JSON 전체를 비교한다.
- **DB 성능**: 같은 DB 환경에서 `EXPLAIN ANALYZE`와 반복 실행 통계를 본다.
- **운영 응답시간**: 배포 전후 같은 네트워크 경로에서 방향성을 확인한다.

baseline을 원격 환경, candidate를 로컬에서 호출해 놓고 그 차이를 순수 쿼리 속도라고 부르면 네트워크와 서버 사양이 섞인다. 초기 진단에서는 그런 비교도 방향을 잡는 데 썼지만, 최종 성능 근거는 같은 환경의 DB 측정으로 분리했다.

## 건수가 아니라 응답 계약을 비교했다

비교 스크립트는 JSON object의 키 순서를 정규화하되 배열 순서는 유지했다. 목록 API에서 배열 순서는 계약의 일부이기 때문이다.

값을 정규화한 것은 호출마다 달라지는 것으로 명시된 필드뿐이었다. 해당 필드가 존재하는지와 형식이 유효한지는 별도 assertion으로 확인했다.

```text
값만 정규화: serverTime, traceId
비교: resultCode, items 길이, 각 item의 모든 필드,
      item 순서, nextCursor, hasNext
```

특히 다음 값을 눈여겨봤다.

- `id`: 같은 행 집합인가.
- `rankingScore`: 인기순 정렬의 입력값도 같은가.
- `createdAt`: 날짜 조건이 다른 행을 섞지 않았는가.
- `nextCursor`: 다음 페이지의 시작점이 같은가.
- `title`, `category`, `regionCode`: 필터와 매핑 결과가 같은가.

“빈 목록과 빈 목록”은 너무 쉽게 통과한다. 각 시나리오에는 최소 한 건 이상을 반환하는 fixture를 넣었고, 일부는 페이지 크기보다 많은 결과가 나오게 해 다음 페이지까지 검증했다.

## 분기 조합을 테스트 행렬로 만들었다

한두 개의 대표 요청만으로는 수정한 SQL 분기를 모두 지나지 않는다. 공개용 테스트 행렬은 다음과 같이 구성했다.

| 시나리오 | 주요 파라미터 | 확인할 것 |
|---|---|---|
| 최신순 첫 페이지 | `sort=newest` | 기본 날짜 분기와 정렬 |
| 최신순 다음 페이지 | `sort=newest`, `cursor` | 경계 중복·누락 |
| 인기순 첫 페이지 | `sort=popular` | 랭킹 점수와 tie-breaker |
| 인기순 다음 페이지 | `sort=popular`, `cursor` | 복합 커서 |
| 참여 가능만 | `availableOnly=true` | 더 좁은 날짜 분기 |
| 카테고리 | `category=guide` | 선택 필터 |
| 지역 | `region=central` | 지역 필터 |
| 키워드 | `keyword=주말` | 비자명한 부분 결과 |
| 전체 조합 | 정렬·커서 외 필터 모두 | 조건 상호작용 |

요청 예시는 합성 값만 사용했다.

```json
{
  "sort": "popular",
  "cursor": "P00042-I00125",
  "availableOnly": true,
  "category": "guide",
  "region": "central",
  "keyword": "주말"
}
```

최신순 커서는 `(created_at, id)`, 인기순 커서는 `(ranking_score, id)`를 담는다. 정렬 키가 같은 fixture도 일부러 넣어 tie-breaker가 수정 전후에 같은지 확인했다.

## 비교 자동화는 다르면 바로 실패하게 했다

수작업으로 JSON 두 개를 눈으로 비교하면 긴 목록의 한 필드 차이를 놓치기 쉽다. 테스트 러너는 요청 하나마다 다음 순서로 동작했다.

```text
1. baseline 호출
2. candidate 호출
3. 허용된 비결정 필드의 값만 sentinel로 치환
4. object key 정규화, array 순서 유지
5. deep equality 비교
6. 다르면 최초 JSON path와 양쪽 값을 출력
```

개념적인 비교 코드는 이렇다.

```javascript
const volatileFields = new Set(["serverTime", "traceId"]);

const before = normalize(await call(baseline, request), volatileFields);
const after = normalize(await call(candidate, request), volatileFields);

assert.deepStrictEqual(after, before);
```

실패 메시지는 `items[17].id`, `nextCursor`처럼 경로를 보여주게 했다. 전체 응답 덤프만 남기면 차이를 다시 찾아야 해서 진단 시간이 길어진다.

실제 검증의 모든 시나리오에서 정규화 후 JSON이 같았고, 수정한 기본 날짜 분기와 참여 가능 분기 모두 통과했다. 키워드·지역·전체 조합처럼 결과 수가 줄어드는 케이스도 비어 있지 않은 결과를 반환했으므로 가짜 통과가 아니었다. 공개용 합성 fixture 예시도 같은 분기와 페이지 경계를 설명하도록 구성했다.

## 이 테스트가 증명하지 않는 것

유한한 요청 행렬의 deep diff는 선택한 fixture와 분기에 대한 강한 회귀 증거이지, 가능한 모든 데이터와 요청에 대한 수학적 증명은 아니다. 이번 변경에서 보편적인 부분은 “추가 하한이 기존 조건의 상위집합”이라는 논리와 값의 범위 불변식이 맡았다. E2E 비교는 그 논리가 실제 정렬, 커서, 매핑을 지나도 깨지지 않는지 표본으로 확인했다.

응답 본문이 같아도 HTTP 상태, 중요한 헤더, 권한 검사, 부수 효과까지 같다는 뜻은 아니다. 목록 조회라면 상태와 `Content-Type`도 함께 확인하고, 오류·빈 결과 시나리오는 비어 있지 않은 정상 시나리오와 분리해야 한다. 여러 페이지가 있는 fixture는 마지막 페이지까지 순회해 합친 ID 집합에도 중복과 누락이 없는지 확인하는 편이 안전하다.

비교 도구의 표현 한계도 확인해야 한다. JavaScript로 JSON을 파싱할 때 64비트 정수 ID가 안전 정수 범위를 넘으면 서로 다른 값이 같은 숫자로 반올림될 수 있다. 그런 API는 ID를 문자열로 비교하거나 정밀도를 보존하는 파서를 사용해야 한다.

## 속도 수치는 중앙값과 분포를 함께 봤다

각 빌드를 워밍업한 뒤 같은 요청을 여러 번 실행했다. 단발 최솟값 대신 중앙값을 대표값으로 삼고, 튀는 값이 있는지 상위 분위도 함께 봤다.

공개용으로 수치를 범위화하면 다음 정도였다.

```text
수정 전: 대부분 1초 안팎
수정 후: 대부분 100ms 안팎 또는 그 이하
DB 계획: table scan → created_at range scan
```

운영 배포 전후 측정은 성능 확인에만 썼다. 운영 데이터는 계속 변하므로 배포 전 응답과 배포 후 응답의 JSON 차이를 코드 변경 탓이라고 단정할 수 없다. 동일성은 고정 fixture 환경에서, 실제 지연은 같은 운영 경로에서 각각 증명했다.

최적화 검증은 “빨라졌다”와 “안 바뀌었다”를 서로 다른 시험으로 다뤄야 한다. 이번에는 SQL의 상위집합 논리, DB 실행 계획, 변경이 없는 개발 데이터의 응답 deep diff를 겹쳐 놓고서야 배포할 수 있었다.
