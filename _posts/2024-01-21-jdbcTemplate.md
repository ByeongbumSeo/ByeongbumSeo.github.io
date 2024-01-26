---
title: jdbcTemplate(작성중)
date: 2024-01-21 20:00:22 +09:00
categories:
  - 언어
  - Java
tags:
  - Java
  - JDBC
  - JdbcTemplate
---

## 공부하게 된 배경
지난 번 JDBC를 포스팅하며 마지막에 **JdbcTemplate은 개발자가 JDBC 기술을 쉽게 사용할 수 있도록 도와주는 클래스**라고 간단하게 언급했다.
> [JDBC 포스팅 보러가기](https://byeongbumseo.github.io/posts/JDBC/)

나와 같은 주니어 개발자들은 이제 사실상 jdbcTemplate보다는 JPA, QueryDsl이나 MyBatis 등을 대부분 이용하고 공부하겠지만 !(이제 MyBatis는 JPA로 대체되고 있지만, 우리나라에서는 아직 많은 회사에서 사용 중이므로 반드시 공부해야하는 스킬이라고 생각한다.)
jdbcTemplate은 허들이 높은 스킬이 아니므로, 간단하게 공부해놓으면 추후에 도움이 될 것이라 생각하므로 정리한다.

## 다루는 내용
이 글에서는 jdbcTemplate 를 설명하며 연관 지식으로
- JDBC API
- SQL Mapper, (MyBatis)
- Spring JDBC
- ORM, (JPA)

에 대해서도 다룬다.  

## jdbcTemplate 이란?

jdbcTemplate을 알기 전에 우선 JDBC에 대해서 알아야하는데, 이를 사용하는 이유에 대해서 간략하게 설명하자면 아래와 같다.  
> JDBC API를 통해 추상화된 인터페이스를 제공하고, 각 벤더사에서 각자의 DBMS에 따라 구현해놓은 드라이버를 설치하여 사용하는 방식으로 DB에 접근한다. 이를 통해 어떤 DB를 사용하든 개발자가 JDBC를 사용하는 방법은 변하지 않는다.

JDBC를 사용하는 방법은 아래와 같다.
1. DriverManager를 이용해서 Connection 인스턴스를 얻는다.
2. Connection을 통해서 Statement(혹은 PreparedStatement)를 얻는다.
3. Statement(혹은 PreparedStatement)를 이용해 ResultSet을 얻는다.

또한 JDBC를 사용하기 위해서는 커넥션 연결, SQL 요청 및 응답 이외에도 객체 변환, 예외 처리 등에 대해서 일일이 처리해줘야 한다.

이를 위해서 SQL Mapper가 등장하게 되는데, jdbcTemplate은 MyBatis와 더불어 대표적인 SQL Mapper 기술이다.

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



### SQL Mapper
기존의
- 어플리케이션 로직 > JDBC  
구성에서
- 어플리케이션 로직 > SQL Mapper > JDBC  
으로 변경되며 개발자가 SQL만 직접 작성하면 **나머지 일들을 SQL Mapper가 대신 처리**해주게 되었다.

대표적으로 SQL 응답 결과를 객체로 변환해주고, JDBC의 반복 코드를 제거해주는 등의 일을 한다.

이를 통해 JDBC를 보다 편리하게 사용할 수 있게 되었다.