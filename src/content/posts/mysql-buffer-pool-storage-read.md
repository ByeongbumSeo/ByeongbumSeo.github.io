---
title: "같은 MySQL 쿼리는 왜 처음만 느렸을까: InnoDB 버퍼 풀과 스토리지 읽기"
slug: "mysql-buffer-pool-storage-read"
description: "닉네임 로직 리팩터링의 추가 쿼리 비용을 측정하다 발견한 첫 실행 지연을 통해, 버퍼 풀 hit가 줄이는 비용과 캐시로도 사라지지 않는 작업을 구분한다."
kind: "tech"
category: "database"
publishedAt: "2026-07-28"
updatedAt: "2026-07-28"
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

앞선 닉네임 조회는 `post_id` 인덱스로 대상 범위를 먼저 좁힌 뒤, 일치한 행의 원본 페이지를 찾았다. 4,146건을 반환한 별도 측정에서 실행 시간과 버퍼 풀 상태값을 함께 기록했다.

| 측정 항목 | 1회차 | 즉시 2회차 |
|---|---:|---:|
| 반환 행 | 4,146건 | 4,146건 |
| 실행 시간 | 4,570ms | 14.1ms |
| `Innodb_buffer_pool_reads` 증가량 | 4,398 | 0 |
| `Innodb_data_read` 증가량 | 72,056,832 bytes | 0 bytes |
| `Innodb_buffer_pool_read_ahead` 증가량 | 0 | 0 |

두 실행의 실행 계획과 반환 행은 같았다. 1회차 구간에는 버퍼 풀에서 처리하지 못한 페이지 읽기가 4,398회 발생했다. 스토리지에서 읽은 72,056,832 bytes도 `4,398 × 16KB`와 정확히 일치했다. 즉시 재실행 구간에서는 두 값이 모두 증가하지 않았다.

상태값은 서버 전체 누적값이므로 각 실행의 직전과 직후 값을 비교했다. 개별 페이지를 쿼리 단위로 분리한 값은 아니지만, 실행 계획과 처리한 행 수가 같은 상태에서 물리 읽기는 1회차 구간에만 발생했고 실행 시간도 4,570ms에서 14.1ms로 줄었다. 이를 근거로 첫 실행 지연의 주된 원인은 버퍼 풀에 없던 페이지를 스토리지에서 읽는 비용이라고 진단할 수 있었다.

## 그런데 왜 재실행해도 계속 느린 쿼리가 있었을까

[이전에 분석했던 목록 조회 쿼리](/posts/mysql-non-sargable-range/)는 반대에 가까운 결과가 나왔다. 닉네임 조회와 달리, 같은 SQL을 바로 다시 실행해도 목록 조회는 빨라지지 않았다.

| 사례 | 실행 계획이 방문한 범위 | 1회차 | 2회차 |
|---|---|---:|---:|
| 닉네임 조회 | `post_id` range scan 후 일치한 4,146건의 원본 행 조회 | 4,028ms | 14.1ms |
| 목록 조회 개선 전 | 약 143만 행 table scan | 1,205ms | 1,216ms |
| 목록 조회 개선 후 | 날짜 인덱스로 6,443행 range scan | 77.0ms | 77.3ms |

두 사례의 차이는 실행 계획이 매번 방문한 범위였다. 닉네임 조회는 조건에 맞는 수천 건으로 범위를 좁혔지만, 목록 조회는 1회차와 2회차 모두 약 143만 행을 방문했다.

## 재실행해도 실행 계획의 작업량은 줄지 않았다

버퍼 풀은 페이지를 스토리지에서 읽는 비용을 줄일 수 있지만, 실행 계획이 요구하는 행 탐색과 조건 계산까지 없애지는 않는다. MySQL 8.0은 이전 `SELECT` 결과를 그대로 반환하는 query cache도 사용하지 않으므로, 같은 SQL을 실행할 때마다 실행 계획의 작업을 다시 수행한다.

목록 조회가 재실행에서도 느렸던 이유는 약 143만 행을 읽고 조건을 확인하는 작업이 그대로 남았기 때문이다. 날짜 인덱스로 범위를 6,443행까지 줄이자 실행 시간은 1회차와 2회차 모두 약 77ms가 됐다.

**버퍼 풀은 페이지를 어디서 읽을지를 바꾸고, 실행 계획은 매번 얼마나 많은 작업을 할지를 정한다. 페이지를 메모리에서 읽더라도 실행 계획이 많은 행을 요구하면 쿼리는 계속 느릴 수 있다.**
