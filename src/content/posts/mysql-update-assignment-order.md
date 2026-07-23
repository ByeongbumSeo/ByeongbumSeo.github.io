---
title: "MySQL UPDATE에서 SET 순서가 결과를 바꾸는 이유"
slug: "mysql-update-assignment-order"
description: "앞선 할당으로 바뀐 값을 다음 식이 읽는 MySQL 단일 테이블 UPDATE 동작과, 순서 의존 SQL을 테스트로 고정하는 기준을 제시한다."
kind: "tech"
category: "database"
publishedAt: "2026-01-15"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "sql", "database", "debugging"]
relatedPosts: []
references:
  - title: "MySQL 8.4 Reference Manual — UPDATE Statement"
    url: "https://dev.mysql.com/doc/refman/8.4/en/update.html"
  - title: "MySQL 8.4 Reference Manual — Date and Time Functions"
    url: "https://dev.mysql.com/doc/refman/8.4/en/date-and-time-functions.html"
  - title: "MariaDB Documentation — UPDATE"
    url: "https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/changing-deleting-data/update"
  - title: "MariaDB Documentation — SQL_MODE"
    url: "https://mariadb.com/docs/server/server-management/variables-and-modes/sql_mode"
  - title: "PostgreSQL 18 Documentation — UPDATE"
    url: "https://www.postgresql.org/docs/current/sql-update.html"
---

운영 도구의 승인 기능을 손보는 과정에서 최초 승인 시각을 추가했다. 기존에는 가장 최근 승인 시각만 저장했고, 같은 계정을 다시 승인하면 그 값이 계속 덮어써졌다. 이제부터는 `first_approved_at`에는 첫 승인 시각을 남기고, `last_approved_at`은 이전처럼 매번 갱신해야 했다.

겉으로는 컬럼 하나를 추가하는 일이었다. 구현을 검토하면서 두 값을 한 UPDATE에서 다룰 때 `SET` 순서가 동작의 일부가 된다는 점을 확인했다.

## 자연스러워 보이는 순서가 조건을 깨뜨렸다

최근 승인 시각을 갱신한 다음, 기존 최근 승인 시각이 비어 있었는지 확인해 최초 승인 시각을 채운다고 생각해 보자.

```sql
UPDATE account
SET last_approved_at = NOW(),
    first_approved_at = IF(
        last_approved_at IS NULL,
        NOW(),
        first_approved_at
    )
WHERE id = ?;
```

각 대입식이 UPDATE 전의 행을 읽는다고 생각하면 맞는 코드처럼 보인다. 최초 승인 전에는 `last_approved_at`이 `NULL`이므로 `first_approved_at`에도 현재 시각이 들어가야 한다.

**MySQL의 단일 테이블 UPDATE는 보통 `SET`을 왼쪽에서 오른쪽으로 평가하므로, 뒤의 식은 앞에서 바뀐 값을 읽을 수 있다.**

변경 전 두 컬럼이 모두 `NULL`인 행에 위 쿼리를 실행하면 값은 다음 순서로 움직인다.

| 단계 | `last_approved_at` | `first_approved_at` |
|---|---|---|
| UPDATE 전 | `NULL` | `NULL` |
| 첫 번째 할당 뒤 | 현재 시각 | `NULL` |
| 두 번째 조건 평가 | `IS NULL`이 거짓 | `NULL` 유지 |

두 번째 할당이 조건을 확인할 때는 `last_approved_at`이 이미 `NULL`이 아니다. 최초 승인인데도 최초 승인 시각은 기록되지 않는다.

MySQL 문서의 더 작은 예시도 같은 동작을 보여준다.

```sql
UPDATE t1
SET col1 = col1 + 1,
    col2 = col1;
```

여기서 `col2`는 변경 전 `col1`이 아니라 첫 번째 할당으로 증가한 `col1`을 읽는다. 그래서 두 컬럼은 같은 값이 된다. 문서도 이 동작이 표준 SQL과 다르다고 따로 적고 있다.

## 이전 값이 필요하다면 먼저 읽어야 한다

이 경우에는 최초 승인 시각을 먼저 계산하고 최근 승인 시각을 나중에 갱신하면 된다.

```sql
UPDATE account
SET
    -- last_approved_at을 갱신하기 전에 기존 값으로 최초 승인을 판단한다.
    first_approved_at = IF(
        last_approved_at IS NULL,
        NOW(),
        first_approved_at
    ),
    last_approved_at = NOW()
WHERE id = ?;
```

첫 번째 할당이 아직 바뀌지 않은 `last_approved_at`을 보고 최초 승인인지를 판단한다. 그 뒤 두 번째 할당이 최근 승인 시각을 갱신한다. MySQL의 `NOW()`는 한 문장 안에서 같은 값을 반환하므로 최초 승인 때 두 컬럼에 기록되는 시각도 같다.

구현은 최초 승인 시각을 먼저 계산하도록 정리했다. 이 순서는 보기 좋게 컬럼을 정렬하는 문제가 아니다. 누군가 할당 순서를 바꾸면 문법 오류 없이 결과만 달라진다.

그래서 실제 쿼리에는 순서가 중요한 이유를 바로 옆에 남겨야 한다. 주석만으로는 부족하다. 적어도 다음 상태 조합은 회귀 테스트나 실제 DB를 쓰는 통합 테스트의 대상이 된다.

| 변경 전 최근 승인 시각 | 변경 전 최초 승인 시각 | 기대 결과 |
|---|---|---|
| `NULL` | `NULL` | 두 값에 같은 새 승인 시각 저장 |
| 기존 값 | 기존 값 | 최초 승인 시각 유지, 최근 승인 시각만 갱신 |
| 기존 값 | `NULL` | 최초 승인 시각은 `NULL` 유지, 최근 승인 시각만 갱신 |
| `NULL` | 기존 값 | 비정상 상태로 보고 기존 값 보존 여부 결정 |

마지막 행은 구현 정책에 따라 결과가 달라질 수 있는 비정상 데이터다. 현재 식은 최초 승인 시각을 새 값으로 덮어쓴다. 이런 상태에서도 기존 값을 보존해야 한다면 참 분기를 `COALESCE(first_approved_at, NOW())`로 바꾸고, 가능하면 애초에 데이터 제약과 쓰기 경로에서 막아야 한다.

## NULL의 뜻부터 확인해야 했다

이 쿼리는 `last_approved_at IS NULL`을 "한 번도 승인되지 않았다"는 뜻으로 사용한다. 따라서 SET 순서만 맞는다고 끝나지 않는다. 다른 상태 변경 경로에서도 `last_approved_at`을 갱신하고 있다면 조건의 전제 자체가 깨진다.

구현 단계에서 이 전제를 확인하려고 쓰기 경로를 점검했고, 승인과 무관한 상태 변경에서 최근 승인 시각을 덮어쓰던 로직도 함께 제거했다. 컬럼 이름만 보고 의미를 추측하지 않고, 해당 컬럼을 쓰는 모든 쿼리를 확인해야 했던 이유다.

기존 데이터의 처리도 별도 문제였다. 이미 `last_approved_at`은 있지만 새로 추가한 `first_approved_at`은 비어 있는 행이 있다. 최근 승인 시각을 최초 승인 시각으로 복사하면 값은 채워지지만 사실이 아닌 기록을 만들게 된다. 과거의 최초 승인 시각을 복원할 근거가 없었기 때문에 이런 행은 `NULL`로 남겼다.

레거시 행에서 `first_approved_at`의 `NULL`은 "승인된 적 없음"이 아니라 "최초 승인 시각을 알 수 없음"이다. 반면 이 UPDATE는 `last_approved_at`의 `NULL`을 "승인된 적 없음"으로 해석한다. 서로 다른 컬럼의 `NULL`을 같은 상태로 읽지 않아야 한다.

## 다른 UPDATE에도 그대로 적용되는 규칙은 아니다

여기서 사용한 순서 의존성은 MySQL의 단일 테이블 UPDATE에만 해당한다. 다중 테이블 UPDATE에서는 할당 순서가 보장되지 않으므로 JOIN이 붙는다면 같은 방식에 기대면 안 된다.[^other-databases]

이 패턴을 쓸 때는 적용 범위를 좁혀 기록한다.

- 단일 테이블 UPDATE인지 확인한다.
- 뒤 할당이 앞에서 변경하는 컬럼을 읽는지 확인한다.
- 순서 의존성을 주석과 테스트로 고정한다.
- DBMS나 SQL 모드가 바뀌면 식의 평가 기준을 다시 확인한다.

**MySQL UPDATE에서 앞선 할당값을 뒤에서 읽는다면 `SET` 순서는 동작의 일부다. 주석과 실제 DB 테스트로 이 순서를 고정해야 한다.**

[^other-databases]: MariaDB는 기본적으로 왼쪽에서 오른쪽으로 할당하지만 `SIMULTANEOUS_ASSIGNMENT` 모드에서는 동시에 평가한다. PostgreSQL은 오른쪽 식에서 변경 전 행의 값을 사용한다.
