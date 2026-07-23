---
title: "Spring 조회 트랜잭션에서 readOnly가 필요한 경우"
slug: "spring-readonly-transaction"
description: "Spring 조회 메서드에서 트랜잭션 유무가 커넥션 재사용, 읽기 일관성, readOnly 힌트와 비용에 어떤 차이를 만드는지 확인한다."
kind: "tech"
publishedAt: "2026-04-01"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["spring", "transaction", "jdbc", "mysql"]
series:
  slug: "spring-transactions"
  title: "Spring 트랜잭션"
  order: 1
relatedPosts: []
references:
  - title: "Spring Framework Reference — Transaction Management"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction.html"
  - title: "Spring Framework Javadoc — TransactionDefinition.isReadOnly()"
    url: "https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/TransactionDefinition.html"
  - title: "Spring Framework Javadoc — DataSourceTransactionManager.setEnforceReadOnly()"
    url: "https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/datasource/DataSourceTransactionManager.html"
  - title: "MySQL 8.0 Reference Manual — Consistent Nonlocking Reads"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html"
  - title: "MySQL 8.0 Reference Manual — Optimizing InnoDB Read-Only Transactions"
    url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-performance-ro-txn.html"
  - title: "MariaDB Connector/J 3.4.2 — StandardClient.java"
    url: "https://github.com/mariadb-corporation/mariadb-connector-j/blob/3.4.2/src/main/java/org/mariadb/jdbc/client/impl/StandardClient.java"
---

단순 조회 메서드에는 `@Transactional`을 붙이지 않는 경우가 많다. SELECT만 하는데 굳이 트랜잭션이 필요할까 싶고, 실제 코드도 별문제 없이 동작한다.

이 글은 Spring JDBC/MyBatis와 `DataSourceTransactionManager`, InnoDB의 `REPEATABLE READ`를 기준으로 한다. JPA의 영속성 컨텍스트·flush나 다른 트랜잭션 매니저까지 같은 동작으로 일반화하지 않는다.

```java
public Article getArticle(long articleId) {
    return articleRepository.findById(articleId);
}
```

그러다 `@Transactional(readOnly = true)`를 붙이면 정확히 무엇이 달라지는지 궁금해졌다. 처음에는 "조회니까 성능에 조금 유리하고, 실수로 쓴 UPDATE도 막아주겠지" 정도로 생각했다. 실제로 확인하고 나니 맞는 부분과 틀린 부분이 갈렸다.

## 트랜잭션이 없으면 Spring은 무엇을 하나

트랜잭션 애노테이션이 없으면 Spring의 트랜잭션 인터셉터가 메서드 경계를 관리하지 않는다. 데이터 접근 코드가 필요할 때 커넥션을 빌리고, 커넥션의 autocommit 설정에 따라 각 문장을 끝낸다.

```text
Service 메서드
  ↓
Repository 호출
  ↓
DataSource에서 커넥션 획득
  ↓
SELECT 실행
  ↓
커넥션 반환
```

`readOnly = true`를 붙이면 메서드 진입 전에 물리 트랜잭션을 시작한다.

```text
Spring 트랜잭션 프록시
  ↓ 커넥션 획득
  ↓ setReadOnly(true)
  ↓ setAutoCommit(false)
  ↓ 현재 스레드에 커넥션 바인딩
Service와 Repository 실행
  ↓ 같은 커넥션 재사용
메서드 종료
  ↓ commit
  ↓ 커넥션 반환
```

여기서 실제로 의미가 있었던 차이는 세 가지였다.

## 차이 1: 여러 쿼리가 같은 커넥션을 쓴다

트랜잭션이 없는 메서드에서 데이터 접근 호출이 여러 번 일어나면, 각 호출은 트랜잭션에 바인딩된 커넥션이 없으므로 각각 커넥션을 획득하고 반환할 수 있다.

```java
public ArticleDetail getArticle(long articleId) {
    Article article = articleRepository.findById(articleId);
    List<Comment> comments = commentRepository.findAll(articleId);
    Author author = authorRepository.findById(article.authorId());
    return new ArticleDetail(article, comments, author);
}
```

`@Transactional(readOnly = true)` 안에서는 트랜잭션 시작 시 얻은 커넥션이 스레드에 바인딩되고 같은 메서드 범위에서 재사용된다.

```text
findById(articleId)       ─┐
findAll(articleId)        ├─ 커넥션 A
findById(authorId)        ─┘
```

쿼리가 한 개라면 이 차이는 거의 없다. 쿼리가 여러 개면 커넥션 획득 횟수는 줄어든다. 대신 커넥션 A를 메서드가 끝날 때까지 점유한다. 메서드 안에 느린 외부 API 호출이 섞여 있다면 재사용의 이득보다 긴 점유 시간이 더 나쁠 수 있다.

## 차이 2: 조회 결과의 시점이 같아진다

InnoDB의 `REPEATABLE READ`에서 트랜잭션 안의 consistent read는 첫 읽기가 만든 스냅샷을 공유한다. 트랜잭션 시작 시점이 아니라 첫 SELECT 시점이라는 점이 중요하다.

트랜잭션 없이 여러 SELECT를 실행하면 각 문장이 별도 autocommit 트랜잭션이므로 읽는 시점도 서로 다르다.

```text
조회 요청                           다른 요청
────────                           ─────────
SELECT article → view_count 10
                                   UPDATE article SET view_count = 11
                                   INSERT view_history ...
                                   COMMIT
SELECT view_history
→ view_count 11에 해당하는 이력
```

한 응답 안에서 본문은 이전 상태인데 이력은 새 상태일 수 있다.

`@Transactional(readOnly = true)`로 묶으면 첫 SELECT가 만든 스냅샷을 뒤의 SELECT도 사용한다. **여러 테이블을 조합해 하나의 응답을 만드는 API에서는 같은 읽기 시점을 유지하는 것이 분명한 적용 이유가 된다.**

반대로 SELECT 한 문장으로 끝나는 API라면 쿼리 사이의 시점 차이가 생길 수 없다. 이 경우 트랜잭션을 붙여 얻는 읽기 일관성도 없다.

## 차이 3: readOnly는 쓰기 방지 장치가 아닐 수 있다

Spring의 `TransactionDefinition.isReadOnly()` 문서는 read-only가 실제 트랜잭션 시스템에 전달하는 힌트이며, 쓰기 시도가 반드시 실패하는 것은 아니라고 명시한다.

`DataSourceTransactionManager`의 기본 동작은 JDBC `Connection.setReadOnly(true)`를 호출하는 것이다. 서버에 `SET TRANSACTION READ ONLY`를 보내 강제하고 싶다면 `enforceReadOnly` 같은 별도 설정을 검토해야 한다.

검증에 사용한 MariaDB Connector/J 3.4.2의 단일 서버용 `StandardClient.setReadOnly()` 구현은 커넥션이 닫혔는지만 확인하고 서버 명령을 보내지 않았다.

```java
public void setReadOnly(boolean readOnly) throws SQLException {
    if (closed) {
        throw new SQLNonTransientConnectionException(
            "Connection is closed", "08000", 1220
        );
    }
}
```

이 조합에서는 `readOnly = true` 메서드 안의 UPDATE가 그대로 실행될 수 있다. 반면 다른 드라이버나 설정에서는 서버 read-only 모드로 전파돼 실패할 수 있다.

**read-only 애노테이션을 DB가 지키는 자물쇠로 보면 안 된다.** 코드의 의도를 표현하고 트랜잭션 특성을 전달하지만, 실제 쓰기 차단 여부는 트랜잭션 매니저·드라이버·DB 설정을 확인해야 한다.

## InnoDB 최적화는 애노테이션 덕분일까

처음에는 `readOnly = true`가 InnoDB의 읽기 전용 최적화를 특별히 열어줄 거라고 생각했다. MySQL 문서를 확인하니 autocommit 상태의 단일 non-locking SELECT도 InnoDB가 자동으로 read-only 트랜잭션으로 판정한다.

즉 SELECT 한 문장만 실행하는 메서드에 애노테이션이 없다고 해서 읽기 전용 최적화를 모두 놓치는 것은 아니다. 쓰기나 명시적 잠금이 나오기 전까지 InnoDB가 읽기 전용으로 다룰 수 있는 조건도 별도로 존재한다.

이 점 때문에 "readOnly를 붙이면 무조건 더 빠르다"는 결론은 낼 수 없었다. 성능을 말하려면 실제 스택과 쿼리 수, 커넥션 점유 시간을 측정해야 한다.

## COMMIT 비용은 정말 0일까

읽기 전용 트랜잭션에는 변경 내용이 없으니 commit이 no-op이라는 설명도 자주 본다. JPA/Hibernate에서 flush할 변경이 없다는 이야기와 JDBC 물리 트랜잭션이 끝나는 과정은 구분해야 한다.

MyBatis와 `DataSourceTransactionManager` 조합에서는 autocommit을 끈 커넥션으로 SELECT를 실행하고, 종료할 때 `Connection.commit()`을 호출한다. 검증한 MariaDB 드라이버는 서버 상태가 `IN_TRANSACTION`이면 실제 `COMMIT`을 전송했다.

읽기만 한 트랜잭션은 redo나 undo로 내보낼 변경이 없어 commit 자체는 싸다. 그래도 서버 왕복이 완전히 사라지는 것은 아니다.

| 항목 | 트랜잭션 없음 | `readOnly = true` |
|---|---|---|
| 프록시 인터셉션 | 없음 | 있음 |
| 커넥션 | 호출별 획득 가능 | 메서드 범위에서 재사용 |
| 읽기 시점 | 문장마다 독립 | 첫 consistent read 스냅샷 공유 |
| read-only 힌트 | 없음 | JDBC 드라이버에 전달 |
| 종료 | autocommit 문장 종료 | 물리 트랜잭션 commit |

## 그래서 언제 붙일까

내 기준은 "조회 메서드니까 무조건"이 아니라 쿼리의 수와 응답이 요구하는 일관성이다.

### 여러 SELECT를 조합하는 조회

`readOnly = true`를 붙인다. 같은 커넥션을 재사용하고 하나의 스냅샷으로 결과를 조합한다는 분명한 이유가 있다.

### SELECT 하나로 끝나는 조회

트랜잭션이 없어도 실질적인 문제가 없는 경우가 많다. 팀 코드의 일관성을 위해 붙일 수는 있지만, 성능이나 일관성의 큰 차이를 과장하지 않는다.

### 조회 중 느린 외부 호출이 있는 경우

트랜잭션 범위를 다시 나눈다. 커넥션과 스냅샷을 외부 호출 시간 내내 유지할 이유가 있는지 먼저 확인한다.

### 쓰기 방지가 목적인 경우

애노테이션만 믿지 않는다. `enforceReadOnly`, 드라이버 동작, DB 권한이나 읽기 전용 라우팅처럼 실제 강제 지점을 별도로 검증한다.

처음 질문은 "안 붙여도 잘 되는데 왜 붙이지?"였다. 확인하고 남은 답은 생각보다 좁았다. **여러 쿼리의 커넥션과 읽기 시점을 하나로 묶기 위해서다.** `readOnly = true`는 유용하지만, 이름만큼 많은 것을 자동으로 보장해주지는 않는다.
