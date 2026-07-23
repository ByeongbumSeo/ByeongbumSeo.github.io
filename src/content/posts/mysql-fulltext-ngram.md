---
title: "MySQL 한글 부분 검색에서 제한된 LIKE와 FULLTEXT ngram 비교"
slug: "mysql-fulltext-ngram"
description: "한글 부분 검색에서 제한된 LIKE와 ngram FULLTEXT가 만드는 결과·토큰·색인 비용을 비교해, 이번에는 LIKE를 유지한 기준을 제시한다."
kind: "tech"
category: "database"
publishedAt: "2026-01-16"
updatedAt: "2026-07-23"
draft: false
deprecated: false
outdated: false
tags: ["mysql", "database", "search", "performance"]
relatedPosts: []
references:
  - title: "MySQL 8.4 Reference Manual — Range Optimization"
    url: "https://dev.mysql.com/doc/refman/8.4/en/range-optimization.html"
  - title: "MySQL 8.4 Reference Manual — Full-Text Search Functions"
    url: "https://dev.mysql.com/doc/refman/8.4/en/fulltext-search.html"
  - title: "MySQL 8.4 Reference Manual — InnoDB Full-Text Indexes"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-fulltext-index.html"
  - title: "MySQL 8.4 Reference Manual — ngram Full-Text Parser"
    url: "https://dev.mysql.com/doc/refman/8.4/en/fulltext-search-ngram.html"
  - title: "MySQL 8.4 Reference Manual — Fine-Tuning MySQL Full-Text Search"
    url: "https://dev.mysql.com/doc/refman/8.4/en/fulltext-fine-tuning.html"
  - title: "MySQL 8.4 Reference Manual — Full-Text Restrictions"
    url: "https://dev.mysql.com/doc/refman/8.4/en/fulltext-restrictions.html"
---

운영 도구에서 게시글 본문을 검색하는 쿼리를 살펴보다가 `LIKE '%검색어%'`가 눈에 들어왔다. 앞에 와일드카드가 붙었으니 본문에 일반 인덱스를 추가하는 것만으로는 해결되지 않는다. 당시 쿼리는 최근 구간으로 후보 행을 먼저 줄인 뒤 `LIKE`를 적용하고 있었다.

전체 기간을 검색해야 한다면 MySQL의 `FULLTEXT` 인덱스와 ngram 파서를 쓸 수 있지 않을까 싶어 동작을 정리했다. 실제 기능에는 적용하지 않았다. **`FULLTEXT` 도입은 인덱스 하나를 추가하는 일이 아니라 검색 결과의 기준을 바꾸는 일이었다.**

## LIKE와 인덱스를 먼저 구분했다

`LIKE`는 문자열을 비교하는 조건이고 B-tree는 값을 정렬해 두는 인덱스 구조다. 둘은 대체 관계가 아니다. 패턴의 시작이 고정돼 있다면 MySQL은 B-tree에서 범위를 만들 수 있다.

```sql
-- title 인덱스에서 'mysql'로 시작하는 범위를 찾을 수 있다.
SELECT id, title
FROM article
WHERE title LIKE 'mysql%';
```

반면 앞부분을 모르는 패턴은 시작 위치를 정할 수 없다.

```sql
SELECT id, title
FROM article
WHERE title LIKE '%mysql%';
```

MySQL은 와일드카드로 시작하지 않는 상수 패턴만 B-tree의 range 조건으로 다룬다. 따라서 `LIKE '%mysql%'`는 `title` 인덱스에서 검색 범위를 만들지 못한다.

다른 조건으로 후보를 먼저 줄일 수 있다면 MySQL은 그 후보에 대해서만 `LIKE`를 검사한다.

```sql
SELECT id, title
FROM article
WHERE id >= ?
  AND body LIKE CONCAT('%', ?, '%')
ORDER BY id DESC
LIMIT 30;
```

이 방식은 전체 본문 검색을 빠르게 만든 것이 아니다. PK 범위로 검사할 최대 행 수를 줄인 것이다. 최근 데이터만 확인하는 운영 화면이라면 요구사항에 맞을 수 있지만, 오래된 글까지 찾아야 한다면 사용할 수 없다.

## FULLTEXT는 LIKE용 B-tree가 아니다

InnoDB의 `FULLTEXT` 인덱스는 텍스트를 토큰으로 나눈 뒤, 각 토큰이 들어 있는 문서를 가리키는 역색인을 만든다. 검색도 `LIKE` 대신 `MATCH() ... AGAINST()`를 사용한다.

```sql
ALTER TABLE article
ADD FULLTEXT INDEX ft_article_title_body (title, body);

SELECT id,
       title,
       MATCH(title, body) AGAINST(?) AS relevance
FROM article
WHERE MATCH(title, body) AGAINST(?)
ORDER BY relevance DESC;
```

이 쿼리는 문자열이 포함됐는지를 한 글자씩 확인하는 쿼리가 아니다. 파서가 만든 토큰을 찾고 자연어 모드의 관련도 점수를 계산한다. Boolean mode를 사용하면 포함·제외나 접두사 같은 연산자를 쓸 수 있지만, 여전히 FULLTEXT의 토큰 규칙 안에서 검색한다.

그래서 `LIKE`를 `MATCH ... AGAINST`로 기계적으로 치환하면 안 된다. 다음 항목이 달라질 수 있다.

- 어떤 문자열이 하나의 검색 단위가 되는가
- 짧은 단어와 불용어가 결과에서 빠지는가
- 여러 단어 중 하나만 포함해도 되는가, 모두 이어져 있어야 하는가
- 결과를 최신순으로 볼 것인가, 관련도순으로 볼 것인가

또한 InnoDB에서는 `MATCH()`에 적은 컬럼 목록과 일치하는 `FULLTEXT` 인덱스가 있어야 한다. `(title, body)` 인덱스를 만들었다면 검색도 `MATCH(title, body)`로 맞춰야 한다. 일반 복합 B-tree 인덱스의 선두 컬럼 규칙처럼 일부 컬럼만 골라 쓰는 방식으로 생각하면 안 된다.

## 한글 검색에서 ngram이 필요한 이유

MySQL의 기본 full-text 파서는 공백을 기준으로 단어의 경계를 찾는다. 공백만으로 검색 단위를 나누기 어려운 CJK 텍스트를 위해 MySQL은 ngram 파서를 제공한다. ngram은 문자열을 연속한 `n`개의 문자로 자른다.

예를 들어 `ngram_token_size=2`일 때 `김밥천국`은 다음 토큰으로 나뉜다.

```text
김밥, 밥천, 천국
```

인덱스를 만들 때 파서를 명시한다.

```sql
ALTER TABLE article
ADD FULLTEXT INDEX ft_article_title_body (title, body)
WITH PARSER ngram;
```

ngram은 독립된 인덱스 종류가 아니다. `FULLTEXT` 인덱스가 텍스트를 토큰화하는 방법이다. 형태소를 분석해 `먹었다`, `먹는`, `먹음`을 같은 의미로 묶어 주는 검색기도 아니다. 단지 연속한 문자 조각을 색인한다.

검색 모드에 따라서도 결과가 달라진다. MySQL 문서의 ngram 규칙을 `n=2`인 `김밥천국`에 대입하면 다음과 같다.

- Natural language mode는 검색어를 `김밥`, `밥천`, `천국`의 합집합으로 변환한다. 일부 토큰만 있는 문서도 결과에 들어올 수 있다.
- Boolean mode는 같은 검색어를 ngram 구문 검색으로 변환한다. 토큰이 이어진 문서를 찾기 때문에 연속 문자열 검색에 더 가깝다.

Boolean mode도 `LIKE '%검색어%'`와 완전히 같지는 않다. 공백 처리, 불용어, collation과 검색어 길이에 따라 결과가 달라지므로 실제 데이터로 비교해야 한다.[^ngram-wildcard]

## 두 글자 검색이면 어떤 설정을 바꿔야 할까

기본 full-text 파서를 쓸 때 InnoDB는 기본적으로 세 글자보다 짧은 단어를 색인하지 않는다. 이 동작은 `innodb_ft_min_token_size`가 제어한다. 하지만 ngram 파서를 선택하면 이 설정은 무시된다. 둘을 함께 조정하는 것이 아니다.

ngram에서는 `ngram_token_size`가 토큰 크기를 결정한다. MySQL 8.4의 기본값은 `2`이고 허용 범위는 `1`부터 `10`까지다. 이 변수는 읽기 전용이라 서버 시작 옵션이나 설정 파일에서 지정해야 한다. 인덱스마다 따로 정하는 옵션이 아니라 서버 전역 변수이므로, 같은 인스턴스의 다른 ngram 인덱스도 같은 토큰 크기를 사용한다.

```ini
[mysqld]
ngram_token_size=2
```

기본값이 2라고 해서 한글 서비스에는 언제나 2가 정답인 것은 아니다. 한 글자 검색을 지원해야 하는지, 주로 몇 글자짜리 검색어가 들어오는지, 허용할 오탐 범위가 어디까지인지에 따라 선택이 달라진다. 토큰 크기를 바꿨다면 기존 인덱스에도 새 규칙을 반영하도록 다시 만들어야 한다.

불용어 처리도 따로 확인해야 한다. 기본 파서는 토큰이 불용어와 같을 때 제외하지만, ngram 파서는 불용어를 포함한 토큰을 제외한다. 기본 불용어 목록은 영어 중심이므로 한국어 검색 정책이 있다면 별도의 목록과 테스트가 필요하다.

## 성능 숫자보다 먼저 확인할 운영 비용

검토 자료에는 큰 테이블에서 `LIKE`와 ngram `FULLTEXT`의 예상 응답 시간이 적혀 있었다. 실제 환경에서 실행한 결과는 아니었기 때문에 글에서는 비교 수치로 사용하지 않았다. 행 수가 같아도 본문 길이, 검색어의 빈도, 동시 쓰기 양, 버퍼 풀 상태, 정렬과 추가 필터에 따라 결과가 크게 달라진다.

읽기 성능만 빠르게 재면 판단이 기울기 쉽다. 도입 전에는 적어도 다음 비용을 함께 봐야 한다.

- 기존 데이터가 있는 큰 테이블에 인덱스를 만드는 시간과 배포 방식
- 토큰을 보관할 저장 공간과 백업 크기
- INSERT, UPDATE, DELETE 때 추가되는 색인 유지 비용
- 상태나 카테고리 조건을 함께 걸고 정렬할 때의 실행 계획
- Natural language mode와 Boolean mode의 결과 정확도

FULLTEXT 인덱스를 처음 만들거나 대상 컬럼을 갱신할 때는 별도의 저장 공간과 쓰기 비용이 든다.[^fts-internals] 읽기 쿼리 하나의 속도만 측정해서는 이 비용을 알 수 없다.

제약도 있다. MySQL 8.4에서 `FULLTEXT`는 InnoDB와 MyISAM의 `CHAR`, `VARCHAR`, `TEXT` 컬럼에만 만들 수 있고 파티션 테이블에는 지원되지 않는다. 여러 컬럼을 한 인덱스에 묶을 때는 문자 집합과 collation도 같아야 한다.

## 이번에는 제한된 LIKE를 유지했다

검토한 화면은 최근 데이터만 찾는 운영 기능이었고, 기존 PK 범위 조건으로 검사할 행 수도 제한할 수 있었다. `FULLTEXT`를 추가하면 검색 결과를 다시 검증하고 인덱스 운영 비용도 감수해야 했지만, 그만한 이점은 확인하지 못했다.

그래서 ngram `FULLTEXT`는 적용안으로 남기고 기존 방식을 유지했다. 다음 조건이 생기면 다시 검토할 생각이다.

- 최근 구간이 아니라 전체 기간 검색이 실제 요구사항이 된다.
- 앞뒤가 열린 한글 부분 검색이 자주 사용된다.
- 토큰 기반 검색 결과가 기존 `LIKE`의 결과와 어떻게 다른지 합의할 수 있다.
- 운영 데이터와 비슷한 분포로 읽기 지연, 쓰기 비용, 인덱스 크기를 함께 측정할 수 있다.

그때는 제한된 범위의 `LIKE`, 기본 `FULLTEXT`, ngram `FULLTEXT`를 같은 검색 시나리오로 비교할 것이다. 형태소 분석, 동의어, 오타 보정이 중요하다면 MySQL 밖의 검색 도구도 검토해야 한다.

**원하는 검색 결과를 먼저 정한 뒤, 제한된 `LIKE`와 `FULLTEXT`의 정확도와 운영 비용을 비교해야 한다.**

[^fts-internals]: InnoDB는 FULLTEXT 색인을 위해 보조 테이블과 `FTS_DOC_ID`를 사용한다. 기존 데이터가 있는 테이블에 처음 인덱스를 만들면 테이블 재구성이 필요할 수 있고, 컬럼 변경에 따른 색인은 커밋 시 처리된다.

[^ngram-wildcard]: ngram 와일드카드 검색에서 접두사가 토큰보다 짧으면 해당 접두사로 시작하는 ngram을 찾는다. 접두사가 토큰보다 길면 검색어를 ngram 구문으로 바꾸고 `*`는 무시하므로, 일반적인 접두사 검색과 동작이 다르다.
