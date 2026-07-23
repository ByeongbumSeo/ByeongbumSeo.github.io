---
title: "readOnly 트랜잭션 안에서 쓰기가 필요할 때 — Propagation의 함정"
slug: "spring-transaction-propagation"
description: "readOnly 조회 트랜잭션 안의 부수적인 쓰기가 REQUIRED와 REQUIRES_NEW에서 어떻게 달라지는지와 선택 기준을 살펴본다."
kind: "tech"
publishedAt: "2026-04-01"
draft: false
deprecated: false
outdated: false
tags: ["spring", "transaction", "jdbc", "mysql"]
series:
  slug: "spring-transactions"
  title: "Spring 트랜잭션"
  order: 2
relatedPosts: []
references:
  - title: "Spring Framework Reference — Transaction Propagation"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html"
  - title: "Spring Framework Reference — Declarative Transaction Implementation"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html"
  - title: "Spring Framework Javadoc — DataSourceTransactionManager"
    url: "https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/datasource/DataSourceTransactionManager.html"
  - title: "MySQL Connector/J — Performance Extensions"
    url: "https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-performance-extensions.html"
  - title: "MariaDB Connector/J 3.4.2 — StandardClient.java"
    url: "https://github.com/mariadb-corporation/mariadb-connector-j/blob/3.4.2/src/main/java/org/mariadb/jdbc/client/impl/StandardClient.java"
---

여러 쿼리를 묶는 조회 메서드에 `@Transactional(readOnly = true)`를 적용하던 중, 조회라고 부르기 애매한 코드가 눈에 들어왔다.

이 글의 구체적인 커넥션 동작은 Spring JDBC와 `DataSourceTransactionManager`를 기준으로 설명한다. JPA나 JTA처럼 다른 트랜잭션 매니저를 쓰면 자원 보류와 read-only 전달 방식이 달라질 수 있다.

```java
@Transactional(readOnly = true)
public ArticleDetail getArticle(long articleId) {
    Article article = articleRepository.findById(articleId);
    List<Comment> comments = commentRepository.findAll(articleId);

    viewLogService.record(articleId); // INSERT

    return new ArticleDetail(article, comments);
}
```

응답의 중심은 조회지만 열람 로그, 최근 접속 시각, 조회수처럼 부수적인 쓰기가 섞여 있었다. 하위 메서드에 평범한 `@Transactional`을 붙이면 쓰기 트랜잭션이 따로 열릴 거라고 생각하기 쉽다. Spring의 기본 전파 방식에서는 그렇지 않다.

## readOnly 안의 쓰기는 항상 실패할까

먼저 `readOnly = true`에서 INSERT가 가능한지부터 확인했다. 답은 Spring 애노테이션 하나만으로 결정되지 않았다.

Spring의 `DataSourceTransactionManager`는 read-only 트랜잭션을 시작할 때 JDBC `Connection.setReadOnly(true)`를 호출한다. 이 힌트를 실제 서버의 read-only 모드로 전파하는지는 드라이버와 설정에 따라 다르다.

- MySQL Connector/J는 `readOnlyPropagatesToServer` 설정에 따라 서버에 read-only 상태를 전파할 수 있다. 이때 쓰기는 실패한다.
- 확인한 MariaDB Connector/J 3.4.2의 단일 호스트용 `StandardClient`에서는 `setReadOnly()`가 서버에 쓰기 금지를 강제하지 않아 INSERT가 실행될 수 있다.

같은 코드가 어떤 조합에서는 우연히 성공하고, 드라이버를 바꾼 뒤 실패할 수 있다는 뜻이다. "지금 INSERT가 되니까 괜찮다"는 보장이 아니었다. 오히려 read-only 의도를 서버까지 전달하지 못한 결과일 수 있다.

## REQUIRED는 새 트랜잭션을 뜻하지 않는다

Spring의 전파 방식은 이미 트랜잭션이 있을 때 하위 호출을 어떻게 처리할지 정한다.

| Propagation | 기존 트랜잭션이 있을 때 | 없을 때 |
|---|---|---|
| `REQUIRED` | 기존 트랜잭션에 참여 | 새 트랜잭션 생성 |
| `REQUIRES_NEW` | 기존 트랜잭션을 보류하고 새로 생성 | 새 트랜잭션 생성 |
| `SUPPORTS` | 기존 트랜잭션에 참여 | 트랜잭션 없이 실행 |
| `NOT_SUPPORTED` | 기존 트랜잭션을 보류 | 트랜잭션 없이 실행 |
| `NESTED` | savepoint 기반 중첩 범위 | 새 트랜잭션 생성 |

기본값은 `REQUIRED`다.

여기서 `NESTED`는 모든 트랜잭션 매니저가 똑같이 지원하는 옵션이 아니다. 이 글의 JDBC 기준에서는 savepoint 지원과 트랜잭션 매니저 설정이 갖춰졌을 때 사용할 수 있다.

```java
@Transactional(readOnly = true)
public ArticleDetail getArticle(long articleId) {
    Article article = articleRepository.findById(articleId);
    viewLogService.record(articleId);
    return ArticleDetail.of(article);
}

@Transactional // REQUIRED, readOnly = false
public void record(long articleId) {
    viewLogRepository.insert(articleId);
}
```

하위의 `record()`는 별도 쓰기 트랜잭션을 만들지 않는다. 이미 열린 상위 트랜잭션에 참여한다. 물리 트랜잭션은 하나이고 그 특성은 상위 범위에서 정해졌다.

```text
getArticle()
└─ readOnly 트랜잭션 시작, 커넥션 A
   ├─ SELECT
   └─ record() — REQUIRED
      └─ 커넥션 A의 기존 readOnly 트랜잭션에 참여
         └─ INSERT
```

Spring 문서가 설명하듯 참여하는 트랜잭션의 로컬 read-only, 격리 수준, timeout 선언은 기본적으로 무시된다. 하위에 `readOnly = false`가 명시되어 있어도 상위 물리 트랜잭션을 쓰기 가능하게 바꾸지 않는다.

이 불일치를 조용히 허용하고 싶지 않다면 트랜잭션 매니저의 `validateExistingTransaction`을 활성화할 수 있다. 그러면 read-only 외부 트랜잭션에 read-write 내부 범위가 합류하려 할 때 fail-fast로 거부한다.

## REQUIRES_NEW로 물리 트랜잭션을 분리한다

상위 조회와 원자성을 공유할 필요가 없는 부수 효과라면 `REQUIRES_NEW`로 분리할 수 있다.

```java
@Transactional(readOnly = true)
public ArticleDetail getArticle(long articleId) {
    Article article = articleRepository.findById(articleId);
    viewLogService.record(articleId);
    return ArticleDetail.of(article);
}

@Transactional(propagation = Propagation.REQUIRES_NEW)
public void record(long articleId) {
    viewLogRepository.insert(articleId);
}
```

동작은 다음과 같다.

```text
상위 readOnly 트랜잭션, 커넥션 A
  ↓ 보류
하위 read-write 트랜잭션, 커넥션 B
  ↓ INSERT, COMMIT
커넥션 B 반환
  ↓
상위 트랜잭션과 커넥션 A 재개
```

새 물리 트랜잭션은 상위의 read-only 속성을 물려받지 않는다. 하지만 이 독립성이 장점인 상황에서만 써야 한다.

## 독립 커밋은 의미도 독립시킨다

하위 `REQUIRES_NEW`가 커밋된 다음 상위 로직에서 예외가 나도 하위 커밋은 되돌아가지 않는다.

```java
@Transactional(readOnly = true)
public ArticleDetail getArticle(long articleId) {
    Article article = articleRepository.findById(articleId);
    viewLogService.record(articleId); // 이미 별도 커밋

    throw new IllegalStateException("response mapping failed");
}
```

열람 시도 자체를 남기는 로그라면 이 결과를 받아들일 수 있다. 반면 "알림을 읽음 처리하고 목록을 반환한다"처럼 쓰기가 API의 핵심 의미라면 상위 실패와 함께 롤백되어야 할 수 있다. 이때 `REQUIRES_NEW`는 해결책이 아니라 원자성을 깨는 선택이다. 상위 트랜잭션에서 `readOnly`를 제거하고 하나의 쓰기 트랜잭션으로 다루는 편이 맞다.

## 커넥션 풀에서는 동시에 두 개를 쓴다

`REQUIRES_NEW`는 상위 커넥션을 반환한 뒤 새 커넥션을 얻는 방식이 아니다. 커넥션 A를 보류한 채 커넥션 B를 추가로 빌린다.

```text
요청 1: A 보류 + B 사용
요청 2: C 보류 + D 사용
요청 3: E 보류 + 새 커넥션 대기
```

동시 요청이 많고 풀 여유가 작다면 여러 요청이 상위 커넥션을 하나씩 쥔 채 내부 커넥션을 기다리는 상황이 생긴다. Spring 문서도 `REQUIRES_NEW`를 사용할 때 동시 스레드 수보다 충분히 큰 풀을 요구한다.

이 문제는 단순히 "메서드 하나가 커넥션 두 개를 쓴다"에서 끝나지 않는다. 내부 트랜잭션 획득 대기와 풀 타임아웃을 부하 환경에서 검증해야 한다.

## 같은 클래스에서 호출하면 애노테이션이 적용되지 않는다

코드를 한 클래스에 모으면 더 짧아 보인다.

```java
@Service
public class ArticleService {

    @Transactional(readOnly = true)
    public ArticleDetail getArticle(long articleId) {
        Article article = articleRepository.findById(articleId);
        this.record(articleId);
        return ArticleDetail.of(article);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(long articleId) {
        viewLogRepository.insert(articleId);
    }
}
```

하지만 기본 proxy mode에서 `this.record()`는 프록시를 거치지 않는다. `REQUIRES_NEW` 인터셉터가 실행되지 않고 INSERT는 여전히 상위 read-only 트랜잭션 안에서 수행된다.

그래서 쓰기 범위를 별도 빈으로 분리했다.

```java
@Service
public class ArticleQueryService {
    private final ViewLogService viewLogService;

    @Transactional(readOnly = true)
    public ArticleDetail getArticle(long articleId) {
        Article article = articleRepository.findById(articleId);
        viewLogService.record(articleId);
        return ArticleDetail.of(article);
    }
}

@Service
public class ViewLogService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(long articleId) {
        viewLogRepository.insert(articleId);
    }
}
```

별도 빈은 단지 프록시를 타기 위한 우회가 아니다. 조회와 독립 커밋이라는 서로 다른 트랜잭션 의미가 클래스 경계에도 드러난다.

## 먼저 물어야 할 것은 전파 옵션이 아니다

상황별 판단을 정리하면 다음과 같다.

| 쓰기 | 선택 | 이유 |
|---|---|---|
| 열람 로그, 독립 통계 | `REQUIRES_NEW` 검토 | 상위 실패와 무관하게 남길 수 있음 |
| 최근 접속 시각 | 독립 의미라면 `REQUIRES_NEW` | 실패 허용 정책을 명시해야 함 |
| 읽음 처리 후 목록 반환 | 상위를 read-write로 | 쓰기가 API 핵심 의미 |
| DB가 아닌 캐시 워밍 | 트랜잭션 밖으로 분리 | DB 트랜잭션을 유지할 이유가 없음 |

내가 먼저 볼 기준은 하나다.

> 이 쓰기가 조회의 부수 효과인가, 아니면 성공 응답을 구성하는 핵심 상태 변경인가?

부수 효과라면 독립 트랜잭션의 커밋 의미와 커넥션 비용을 받아들일 수 있는지 확인한다. 핵심 상태 변경이라면 "조회 API니까 readOnly"라는 이름부터 다시 생각해야 한다.

`REQUIRED`는 기존 트랜잭션에 참여한다. 이 한 줄을 놓치면 하위의 `readOnly = false`가 상위를 덮어쓸 것 같은 착각이 생긴다. 전파 옵션은 애노테이션을 강하게 만드는 스위치가 아니라, 물리 트랜잭션 경계를 어떻게 나눌지 정하는 정책이다.
