---
title: "같은 MySQL 쿼리는 왜 처음만 느렸을까: InnoDB 버퍼 풀과 스토리지 읽기"
slug: "mysql-buffer-pool-storage-read"
description: "닉네임 로직 리팩터링의 추가 쿼리 비용을 측정하다 발견한 첫 실행 지연을 통해, 버퍼 풀 hit가 줄이는 비용과 캐시로도 사라지지 않는 작업을 구분한다."
kind: "tech"
category: "database"
publishedAt: "2026-07-28"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "innodb", "buffer-pool", "index", "performance"]
relatedPosts: ["mysql-non-sargable-range", "mysql-driving-table"]
references:
  - title: "MySQL 8.0 Reference Manual — Buffer Pool"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-buffer-pool.html"
  - title: "MySQL 8.0 Reference Manual — Clustered and Secondary Indexes"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-index-types.html"
  - title: "MySQL 8.0 Reference Manual — EXPLAIN Output Format"
    url: "https://dev.mysql.com/doc/refman/8.0/en/explain-output.html"
  - title: "MySQL 8.0 Reference Manual — Server Status Variables"
    url: "https://dev.mysql.com/doc/refman/8.0/en/server-status-variables.html"
  - title: "MySQL 8.0 Reference Manual — Range Optimization"
    url: "https://dev.mysql.com/doc/refman/8.0/en/range-optimization.html"
  - title: "MySQL 8.0 Reference Manual — Options and Variables Removed in MySQL 8.0"
    url: "https://dev.mysql.com/doc/refman/8.0/en/added-deprecated-removed.html"
---

## 리팩터링 비용을 측정하다 이상한 차이를 발견했다

익명 게시판의 닉네임 발급 로직을 리팩터링하면서 사용 중인 닉네임을 조회하는 쿼리가 하나 추가됐다. 변경 전후의 API 응답시간을 비교했지만, 요청 한 건에 여러 쿼리와 네트워크 왕복이 섞여 있어 새 쿼리의 비용만 분리할 수 없었다.

그래서 추가된 쿼리를 DB에서 직접 측정했다. 확인하려던 것은 단순했다. 반환 행이 늘어날 때 이 조회가 얼마나 느려지는지였다.

그런데 다른 현상이 먼저 보였다. 같은 SQL을 같은 키로 실행했는데 처음에는 수초, 바로 다시 실행하면 십여 밀리초가 나왔다.

| 반환 행 | 처음 측정 | 즉시 재측정 | 차이 |
|---:|---:|---:|---:|
| 2건 | — | 0.08ms | — |
| 330건 | 189ms | 1.0ms | 190배 |
| 1,977건 | 1,692ms | 6.5ms | 260배 |
| 4,146건 | 4,028ms | 14.1ms | 286배 |
| 4,862건 | — | 14.3ms | — |

SQL, 반환 행 수, 실행 계획은 같았다. 차이는 최대 286배였다. 리팩터링 비용을 재려던 측정은 “같은 실행 계획이 왜 처음에만 느린가”라는 질문으로 이어졌다.

## 보조 인덱스만으로 조회가 끝나지 않았다

실제 쿼리를 단순화하면 다음과 같다.

```sql
SELECT display_name
FROM comments
WHERE post_id = ?;
```

`post_id`에는 보조 인덱스가 있었고 실행 계획도 range scan이었다. 풀스캔은 아니었다.

하지만 `post_id` 보조 인덱스에는 조건을 찾는 `post_id`와 해당 행의 기본 키만 들어 있었다. SELECT 결과인 `display_name`은 없었다. InnoDB는 보조 인덱스에서 기본 키를 찾은 뒤, 그 키로 clustered index의 원본 행을 다시 읽어 `display_name`을 가져와야 했다.

```text
secondary index(post_id)
  → matching primary keys
      → clustered index lookup
          → display_name
```

즉 보조 인덱스만 읽고 끝나는 커버링 인덱스 조회가 아니었다. 반환 행이 많아질수록 clustered index 조회도 늘었다.

다만 반환 행 수와 스토리지 읽기 횟수가 일대일인 것은 아니다. 여러 행이 같은 페이지에 있을 수 있고, 필요한 페이지가 이미 메모리에 있다면 스토리지에서 다시 읽지 않는다.

## 실행 시간 차이는 버퍼 풀의 페이지 재사용으로 설명할 수 있었다

InnoDB는 테이블과 인덱스를 행 하나씩 읽지 않고 페이지라는 묶음으로 다룬다. 기본 설정에서는 한 페이지가 16KB이며, 그 안에 여러 행이나 인덱스 항목이 들어 있다. 버퍼 풀은 스토리지에서 읽은 페이지의 복사본을 메모리에 보관하는 공간이다.

실행 계획에 필요한 페이지가 버퍼 풀에 없으면 스토리지에서 가져와야 한다. 이미 있다면 메모리에서 바로 찾는다. 하지만 두 경우 모두 페이지 안의 행과 인덱스 항목을 확인하고, WHERE 조건과 조인·정렬 같은 작업을 수행해야 한다.

```text
page miss: 스토리지 → 버퍼 풀 → 행과 인덱스 처리
page hit:             버퍼 풀 → 행과 인덱스 처리
```

앞선 닉네임 조회는 `post_id` 인덱스로 대상 범위를 먼저 좁힌 뒤, 일치한 행의 원본 페이지만 찾았다. 첫 실행에서 이 페이지들을 스토리지에서 가져오는 비용이 컸다면, 재실행에서는 같은 페이지를 메모리에서 읽고 작은 나머지 작업만 수행하면 된다.

다만 당시에는 실행 시간만 기록해 실제 스토리지 읽기 횟수까지 확인하지 못했다. 정확히 검증하려면 실행 전후의 `Innodb_buffer_pool_read_requests`와 `Innodb_buffer_pool_reads` 증가량을 비교해야 한다. 전자는 논리 읽기 요청, 후자는 버퍼 풀에서 해결하지 못해 스토리지까지 읽은 횟수다. 재실행에서 후자의 증가량이 크게 줄었는지를 보면 버퍼 풀의 영향을 확인할 수 있다. 두 값은 서버 전체에서 누적되므로 다른 쿼리가 거의 실행되지 않는 환경이 필요하다.

`EXPLAIN ANALYZE`도 쿼리를 실제로 실행한다. 첫 측정이 필요한 페이지를 버퍼 풀에 올릴 수 있으므로 첫 실행과 재실행을 구분해 기록해야 한다.

## 그런데 왜 재실행해도 계속 느린 쿼리가 있었을까

[이전에 분석했던 목록 조회 쿼리](/posts/mysql-non-sargable-range/)는 달랐다. 날짜 조건의 하한이 각 행의 다른 컬럼에 의존해 인덱스로 검색 범위를 정하지 못했다. MySQL은 전체 테이블을 읽은 뒤 각 행의 조건을 계산해야 했다.

## 재실행해도 실행 계획의 작업량은 줄지 않았다

| 사례 | 실행 계획이 방문한 범위 | 1회차 | 2회차 |
|---|---|---:|---:|
| 닉네임 조회 | `post_id` range scan 후 일치한 4,146건의 원본 행 조회 | 4,028ms | 14.1ms |
| 목록 조회 개선 전 | 약 143만 행 table scan | 1,205ms | 1,216ms |
| 목록 조회 개선 후 | 날짜 인덱스로 6,443행 range scan | 77.0ms | 77.3ms |

개선 전 쿼리는 2회차에도 약 143만 행을 다시 방문했고, table scan에 1,053ms가 걸렸다. 첫 실행의 1,044ms보다 빨라지지 않았다. `EXPLAIN ANALYZE`만으로 각 실행의 스토리지 읽기 횟수까지 알 수는 없지만, 재실행에서도 사라지지 않은 작업은 분명했다. 같은 실행 계획이 같은 수의 행을 다시 읽고 조건을 계산했다.

인덱스가 사용할 수 있는 날짜 하한을 추가하자 접근 방식은 index range scan으로 바뀌었다. 읽는 행은 약 143만 건에서 6,443건으로 줄었고, 해당 구간은 2회 모두 약 13ms가 걸렸다. 최종 후보는 개선 전과 같은 251건이었지만 전체 실행 시간은 약 1.2초에서 77ms로 줄었다.

개선 후 남은 시간의 대부분은 후보 251건마다 실행된 참여자 수 집계였다. 회당 약 0.24ms로 작아 보여도 251번 반복되면서 약 60ms가 됐다. 이 비용도 재실행으로 사라지지 않았다.

MySQL 8.0에는 SELECT 결과를 저장하던 query cache가 없다. 같은 SQL을 다시 실행해도 이전 결과가 그대로 반환되는 것이 아니다. MySQL은 쿼리를 다시 실행하며, 이 사례처럼 실행 계획이 같더라도 InnoDB가 필요한 테이블과 인덱스 페이지를 버퍼 풀에서 찾으면 스토리지 읽기를 피한다.

따라서 재실행 시간을 볼 때는 두 가지를 나눠야 한다. 버퍼 풀 상태는 페이지를 스토리지와 메모리 중 어디서 읽는지를 바꾸고, 실행 계획은 몇 개의 페이지와 행을 방문할지를 정한다. **페이지를 메모리에서 읽더라도 실행 계획이 많은 행을 요구하면 쿼리는 계속 느릴 수 있다.**
