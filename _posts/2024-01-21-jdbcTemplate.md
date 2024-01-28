---
title: jdbcTemplate(작성중)
date: 2024-01-21 20:00:22 +09:00
categories:
  - 언어
  - Java
tags:
  - Java
  - JDBC
  - SQL Mapper
  - JdbcTemplate
---

## 공부하게 된 배경
지난 번 JDBC를 포스팅하며 마지막에 **JdbcTemplate은 개발자가 JDBC 기술을 쉽게 사용할 수 있도록 도와주는 클래스**라고 간단하게 언급했다.
> [JDBC 포스팅 보러가기](https://byeongbumseo.github.io/posts/JDBC/)

나와 같은 주니어 개발자들은 이제 사실상 jdbcTemplate보다는 JPA, QueryDsl이나 MyBatis 등을 대부분 이용하고 공부하겠지만 !(이제 MyBatis는 JPA로 대체되고 있지만, 우리나라에서는 아직 많은 회사에서 사용 중이므로 반드시 공부해야하는 스킬이라고 생각한다.)
jdbcTemplate은 허들이 높은 스킬이 아니므로, 간단하게 공부해놓으면 추후에 도움이 될 것이라 생각하므로 정리한다.

## 다루는 내용
이 글에서는 jdbcTemplate 를 설명하며 연관 지식으로
- JDBC
- SQL Mapper
- Spring JDBC

에 대해서도 다룬다.  

우선 SQL Mapper가 무엇인지, 그리고 Spring JDBC가 무엇인지에 대해 설명하고 jdbcTemplate을 설명하는 것이 맞는 순서라고 생각된다.
**SQL Mapper**와 **Spring JDBC**에 대해 간략하게 설명하도록 하겠다.

## SQL Mapper
---
기존의
- 어플리케이션 로직 > JDBC  
구성에서
- 어플리케이션 로직 > SQL Mapper > JDBC  
으로 변경되며 개발자가 SQL만 직접 작성하면 **나머지 일들을 SQL Mapper가 대신 처리**해주게 되었다.

대표적으로 SQL 응답 결과를 객체로 변환해주고, JDBC의 반복 코드를 제거해주는 등의 일을 한다.

이를 통해 JDBC를 보다 편리하게 사용할 수 있게 되었다.

대표적인 기술은 스프링의 JdbcTemplate, MyBatis 가 있다.

## Spring JDBC
---
- Spring JDBC는 스프링 프레임워크에서 제공하는 JDBC 기반의 데이터 액세스 기술

Spring JDBC는 JDBC를 보다 쉽고 효율적으로 사용할 수 있도록 추상화된 기능을 제공하는데, 이를 통해 개발자는 반복적이고 번거로운 JDBC 작업을 간소화하고 생산성을 향상시킬 수 있다.

Spring JDBC는 아래와 같은 특징을 가진다.

**1) DataSource 추상화**

Spring JDBC는 데이터베이스 연결 풀을 관리하기 위한 DataSource 인터페이스를 제공한다.
DataSource를 사용하여 데이터베이스 연결 및 트랜잭션 관리를 편리하게 처리할 수 있다.

**2) 예외 처리 및 자원 관리**

Spring JDBC는 JDBC 작업에서 발생하는 예외를 일관되게 처리하고, 연결 및 리소스 관리를 자동으로 처리하여 개발자가 명시적으로 관리해야 하는 부분을 간소화한다.

**3) SQL 문 실행 및 매핑**

Spring JDBC는 간단하고 직관적인 방식으로 SQL 문을 실행하고 결과를 자바 객체로 매핑하는 기능을 제공한다.
ResultSet을 자동으로 객체로 변환하고, PreparedStatement 및 CallableStatement를 사용하여 SQL 파라미터를 설정할 수 있다.

**4) 트랜잭션 관리**

Spring JDBC는 스프링의 트랜잭션 관리 기능과 통합된다. 기존에는 Service에서 커밋과 롤백을 설정했었다면 Spring에서는 자동으로 관리해준다. 
트랜잭션 경계 설정, 롤백, 커밋 등의 작업을 편리하게 처리할 수 있다.
@Transactional 어노테이션을 사용하여 메서드 레벨에서 트랜잭션을 선언할 수도 있다.

**5) 다양한 Callback 및 템플릿**

Spring JDBC는 JdbcTemplate, NamedParameterJdbcTemplate, SimpleJdbcTemplate 등의 다양한 템플릿과 콜백 기능을 제공한다.
이를 통해 반복적인 JDBC 코드 작성을 간소화하고, 일관성 있는 방식으로 데이터베이스 액세스 작업을 수행할 수 있다.


## jdbcTemplate 이란?
---
jdbcTemplate을 알기 전에 우선 JDBC가 무엇이고, 이를 왜 사용하는 지에 대해서 간략하게 설명하자면 아래와 같다.  
> - JDBC : Java에서 DB에 접속할 수 있도록 하는 Java API
> - JDBC API를 통해 추상화된 인터페이스를 제공하고, 각 벤더사에서 각자의 DBMS에 따라 구현해놓은 드라이버를 설치하여 사용하는 방식으로 DB에 접근한다. 이를 통해 어떤 DB를 사용하든 개발자가 JDBC를 사용하는 방법은 변하지 않는다.

JDBC를 사용하는 방법은 아래와 같다.
1. DriverManager를 이용해서 Connection 인스턴스를 얻는다.
2. Connection을 통해서 Statement(혹은 PreparedStatement)를 얻는다.
3. Statement(혹은 PreparedStatement)를 이용해 ResultSet을 얻는다.

순수 JDBC를 이용하면 커넥션 연결, SQL 요청 및 응답 이외에도 리소스 반납, 객체 변환, 예외 처리 등 일일이 처리해줘야 하는 부분이 많다.  
이러한 코드 반복을 줄이기 위해서 **SQL Mapper**가 등장하게 되는데, 이 포스팅에서 설명하고 있는 jdbcTemplate은 MyBatis와 더불어 대표적인 SQL Mapper 기술이다.

- jdbcTemplate 예시 코드

```java
public class CrewDAO{
  private JdbcTemplate jdbcTemplate;
 
  @Autowired
  public void setDataSource(DataSource dataSource){
    this.jdbcTemplate = new JdbcTemplate(dataSource);
  }
 
  public List<Crew> getCrews(){
    return jdbcTemplate.query("select * from crews", new RowMapper<Crew>(){
      @Override
      public Crew mapRow(ResultSet rs, int rowNum) throws SQLException{
        return new Crew(rs.getInt("id"), rs.getString("name"));
      }
    });
  }
}
```
> 코드 출처: 유튜브 우아한Tech - 코즈님의 JDBC, SQLMAPPER, ORM 영상 참고


JDBC API만을 사용할 때보다, Connection에 대한 Configuration을 JdbcTemplate이라는 클래스에 담아 Spring을 통해 주입받는다. 또, 메소드에 쿼리를 매핑해두고 RowMapper를 통해 쿼리 메소드의 결과를 통해 DB의 각 row마다 하나의 인스턴스화를 지원해준다. 추상화가 많이 이뤄져 이전보다 편하게 사용하고 있는 모습을 볼 수 있다.

개발자는 어떤 DB를 사용할 것인지에 대해 연결 파라미터를 넣어주면 Spring이 알아서 연결을 열어준다. 또, 개발자가 원하는 쿼리를 설정하고 해당 쿼리에 들어가는 파라미터를 넣어주면 Spring이 해당 statement를 알아서 수행해주며, 결과 resultset에 대한 루프, 예외처리, 트랜잭션, 종료까지 많은 부분을 대신해주며 기존 방식에서의 불편을 덜어줬다.

- jdbcTemplate을 사용하게 되면서 Spring이 어플리케이션 개발자 대신 처리해주는 동작을 정리하자면 다음 표와 같다.

| 동작                                       | Spring                                       | 어플리케이션 개발자                        |
|--------------------------------------------|----------------------------------------------|--------------------------------------------|
| 연결 파라미터 정의                            |                                             | O                                          |
| 연결 오픈                                   | O                                            |                                           |
| SQL문 지정                                  |                                             | O                                          |
| 파라미터 선언과 파라미터 값 제공             |                                             | O                                          |
| statement 준비와 실행                      | O                                            |                                          |
| (존재한다면) 결과를 반복하는 루프 설정      | O                                            |                                           |
| 각 iteration에 대한 작업 수행             |                                             | O                                          |
| 모든 예외 처리                             | O                                            |                                           |
| 트랜잭션 제어                               | O                                            |                                           |
| 연결, statement, resultSet 닫기            | O                                            |                                           |


그 외에 jdbcTemplate의 주요한 기능을 살펴보면, 
- PreparedStatement 사용 : SQL 파라미터 값을 설정하기 위해 ?(placeholder)를 사용하고, JdbcTemplate이 자동으로 PreparedStatement를 생성하고 파라미터 값을 설정한다. 이를 통해 **SQL 인젝션 공격을 방지**할 수 있다.
- ResultSet 매핑 : JdbcTemplate은 ResultSet을 자동으로 자바 객체로 매핑한다
  - RowMapper 인터페이스를 구현하여 ResultSet의 각 행을 객체로 변환할 수 있다.
  - BeanPropertyRowMapper와 같은 구현체를 사용하여 자바 객체의 프로퍼티와 ResultSet의 컬럼을 자동으로 매핑할 수도 있다.



## JdbcTemplate 사용법
---
Spring Framework에서 제공하는 Spring JDBC