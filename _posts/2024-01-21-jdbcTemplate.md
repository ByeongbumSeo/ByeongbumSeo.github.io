---
title: Spring JDBC, JdbcTemplate
date: 2024-01-21 20:00:22 +09:00
categories:
  - 언어
  - Java
tags:
  - Java
  - JDBC
  - SQL Mapper
  - JdbcTemplate
  - NamedParameterJdbcTemplate
---

## 공부하게 된 배경
지난 번 JDBC를 포스팅하며 마지막에 **JdbcTemplate은 개발자가 JDBC 기술을 쉽게 사용할 수 있도록 도와주는 클래스**라고 간단하게 언급했다.
> [JDBC 포스팅 보러가기](https://byeongbumseo.github.io/posts/JDBC/)

나와 같은 주니어 개발자들은 이제 사실상 jdbcTemplate보다는 JPA, QueryDsl이나 MyBatis 등을 대부분 이용하고 공부하겠지만 !(이제 MyBatis는 JPA로 대체되고 있지만, 우리나라에서는 아직 많은 회사에서 사용 중이므로 반드시 공부해야하는 스킬이라고 생각한다.)
jdbcTemplate은 허들이 높은 스킬이 아니므로, 간단하게 공부해놓으면 추후에 도움이 될 것이라 생각하므로 정리한다.

jdbcTemplate을 알기 전에 우선 JDBC가 무엇이고, 이를 왜 사용하는 지에 대해서 간략하게 설명하자면 아래와 같다.  
> - JDBC : Java에서 DB에 접속할 수 있도록 하는 Java API
> - JDBC API를 통해 추상화된 인터페이스를 제공하고, 각 벤더사에서 각자의 DBMS에 따라 구현해놓은 드라이버를 설치하여 사용하는 방식으로 DB에 접근한다. 이를 통해 어떤 DB를 사용하든 개발자가 JDBC를 사용하는 방법은 변하지 않는다.

## 다루는 내용
이 글에서는 JdbcTemplate 를 설명하며 연관 지식으로
- JDBC
- SQL Mapper
- Spring JDBC
- NamedParameterJdbcTemplate
- RowMapper(BeanPropertyRowMapper)

에 대해서도 다룬다.  

우선 SQL Mapper가 무엇인지, 그리고 Spring JDBC가 무엇인지에 대해 설명하고 jdbcTemplate을 설명하는 것이 맞는 순서라고 생각된다.
**SQL Mapper**와 **Spring JDBC**에 대해 간략하게 설명하도록 하겠다.

jdbcTemplate에 대한 설명으로 바로 가려면 [여기](#jdbctemplate-이란)를 클릭
 

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
- Spring JDBC는 Spring Framwork에서 제공하는 JDBC 기반의 데이터 액세스 기술
- Spring JDBC는 JDBC를 보다 쉽고 효율적으로 사용할 수 있도록 추상화된 기능(라이브러리)을 제공하는데, 이를 통해 개발자는 JDBC의 모든 저수준 처리를 스프링 프레임워크에 위임하며 반복적이고 번거로운 작업을 간소화하고 생산성을 향상시킬 수 있다.
- 패키지명 : org.springframe.jdbc.core
- JdbcTemplate, SimpleJdbcInsert, NamedParameterJdbcTemplate 객체와 Helper 객체(RowMapper) 등을 포함한다.

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

기존 JDBC를 사용하는 방법은 아래와 같았다.
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
### 0) JdbcTemplate 설정

#### spring-jdbc 라이브러리 추가
JdbcTemplate을 사용하기 위해서는 먼저 jdbc 라이브러리를 프로젝트에 추가해야 한다. (spring-jdbc에 jdbcTemplate 포함)

- (Gradle 기준)build.gradle에 추가  
```gradle
//JdbcTemplate 추가
implementation 'org.springframework.boot:spring-boot-starter-jdbc'
```

#### DataSource 주입

그 후 DataSource 를 주입해준다.

```java
private final JdbcTemplate jdbcTemplate;

public JdbcTemplateItemRepository(DataSource dataSource) {
	this.jdbcTemplate = new JdbcTemplate(dataSource);
}
```

JdbcTemplate은 DataSource를 필요로 한다. DataSource는 스프링 빈으로 등록되어 있어야 한다. (DB관련 Config 파일은 생략하도록 하겠다.)
이렇게 JdbcTemplate을 사용할 때 DataSource를 의존 관계 주입받는 방법과, JdbcTemplate을 스프링 빈으로 직접 등록하고 주입받는 방법이 있지만 전자를 관례상 많이 사용한다.

- (상세 예시) spring 공식 문서에는 아래와 같이 jdbcTemplate을 주입한다. (xml 설정파일에서 `DataSource` bean 생성 후 Dao클래스에 의존성 주입.)

```java
public class JdbcCorporateEventDao implements CorporateEventDao {

	private JdbcTemplate jdbcTemplate;

	public void setDataSource(DataSource dataSource) {
		this.jdbcTemplate = new JdbcTemplate(dataSource);
	}

	// JDBC-backed implementations of the methods on the CorporateEventDao follow...
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	xmlns:context="http://www.springframework.org/schema/context"
	xsi:schemaLocation="
		http://www.springframework.org/schema/beans
		https://www.springframework.org/schema/beans/spring-beans.xsd
		http://www.springframework.org/schema/context
		https://www.springframework.org/schema/context/spring-context.xsd">

	<bean id="corporateEventDao" class="com.example.JdbcCorporateEventDao">
		<property name="dataSource" ref="dataSource"/>
	</bean>

	<bean id="dataSource" class="org.apache.commons.dbcp.BasicDataSource" destroy-method="close">
		<property name="driverClassName" value="${jdbc.driverClassName}"/>
		<property name="url" value="${jdbc.url}"/>
		<property name="username" value="${jdbc.username}"/>
		<property name="password" value="${jdbc.password}"/>
	</bean>

	<context:property-placeholder location="jdbc.properties"/>

</beans>
```


### 1) SELECT 쿼리
> - 단건 조회에 대해서는 `queryForObject(..)` 사용 : 이 때 조회 대상이 객체가 아닌 단순 데이터라면 타입을 지정해줄 수 있다.(아래 예시 참고)
> - 단순 데이터 타입이 아닌 객체를 조회할 시에는 `RowMapper` 클래스를 통해 JDBC 쿼리 반환 결과인 ResultSet을 객체로 변환해줄 수 있다.
> - 여러 건을 조회할 경우 `query(..)` 사용 : 동일하게 `RowMapper`를 사용할 수 있다.

- 관계있는 행의 수를 세는 쿼리  
```java
int rowCount = this.jdbcTemplate.queryForObject("select count(*) from t_actor", Integer.class);
```

- 바인드 변수를 사용하는 쿼리  
```java
int countOfActorsNamedJoe = this.jdbcTemplate.queryForObject(
		"select count(*) from t_actor where first_name = ?", Integer.class, "Joe");
```

- String 값 조회 쿼리  
```java
String lastName = this.jdbcTemplate.queryForObject(
		"select last_name from t_actor where id = ?",
		String.class, 1212L);
```

- 단일 행 조회 후 Mapping  
```java
Actor actor = jdbcTemplate.queryForObject(
		"select first_name, last_name from t_actor where id = ?",
		(resultSet, rowNum) -> {
			Actor newActor = new Actor();
			newActor.setFirstName(resultSet.getString("first_name"));
			newActor.setLastName(resultSet.getString("last_name"));
			return newActor;
		},
		1212L);
```

- 복수 행(List) 조회 후 Mapping  
```java
List<Actor> actors = this.jdbcTemplate.query(
		"select first_name, last_name from t_actor",
		(resultSet, rowNum) -> {
			Actor actor = new Actor();
			actor.setFirstName(resultSet.getString("first_name"));
			actor.setLastName(resultSet.getString("last_name"));
			return actor;
		});
```

값을 Mapping 시키는 람다식(RowMapper)이 중복되는 경우, 아래와 같이 별도의 메서드로 분리할 수 있다.  
```java
private final RowMapper<Actor> actorRowMapper = (resultSet, rowNum) -> {
	Actor actor = new Actor();
	actor.setFirstName(resultSet.getString("first_name"));
	actor.setLastName(resultSet.getString("last_name"));
	return actor;
};

public List<Actor> findAllActors() {
	return this.jdbcTemplate.query("select first_name, last_name from t_actor", actorRowMapper);
}
```

### 2) INSERT, UPDATE 및 DELETE 쿼리
> - 모두 .update(..) 메서드를 사용한다.
> - SQL 실행 결과에 영향받은 로우 수를 int로 반환한다.

- INSERT 문  
```java
this.jdbcTemplate.update(
		"insert into t_actor (first_name, last_name) values (?, ?)",
		"Leonor", "Watling");
```

- UPDATE 문  
```java
this.jdbcTemplate.update(
		"update t_actor set last_name = ? where id = ?",
		"Banjo", 5276L);
```

- DELETE 문  
```java
this.jdbcTemplate.update(
		"delete from t_actor where id = ?",
		Long.valueOf(actorId));
```

### 3) 기타 쿼리
- 테이블 생성문  
```java
this.jdbcTemplate.execute("create table mytable (id integer, name varchar(100))");
```
- 프로시저 호출  
```java
this.jdbcTemplate.update(
		"call SUPPORT.REFRESH_ACTORS_SUMMARY(?)",
		Long.valueOf(unionId));
```

Spring JDBC가 제공하는 템플릿에는 `JdbcTemplate` 이외에도 `NamedParameterJdbcTemplate` 등이 있는데 모두 JdbcTemplate을 기반으로 한 확장의 개념이다. JdbcTemplate을 포함하고 있다.

## `NamedParameterJdbcTemplate` 사용법
---
: 기존 JDBC 의 ? 방식 대신 명명된 매개변수를 사용할 수 있도록 변경한 Template. 이를 통해 SQL문에 여러 파라미터를 가지고 있는 경우, 유지보수가 편리해졌다.

```java
// some JDBC-backed DAO class...
private NamedParameterJdbcTemplate namedParameterJdbcTemplate;

public void setDataSource(DataSource dataSource) {
	this.namedParameterJdbcTemplate = new NamedParameterJdbcTemplate(dataSource);
}

public int countOfActorsByFirstName(String firstName) {
	String sql = "select count(*) from t_actor where first_name = :first_name";
	SqlParameterSource namedParameters = new MapSqlParameterSource("first_name", firstName);
	return this.namedParameterJdbcTemplate.queryForObject(sql, namedParameters, Integer.class);
}
```

또는 아래와 같이 Map(java.util.Map) 구조의 변수로 매개변수를 전달할 수 있다.
- key : 매개변수 이름, value : 매개변수 값

```java
// some JDBC-backed DAO class...
private NamedParameterJdbcTemplate namedParameterJdbcTemplate;

public void setDataSource(DataSource dataSource) {
	this.namedParameterJdbcTemplate = new NamedParameterJdbcTemplate(dataSource);
}

// 입력할 내용이 딱 한개라면 singletonMap을 활용해도 된다.
public int countOfActorsByFirstName(String firstName) {
	String sql = "select count(*) from t_actor where first_name = :first_name";
	Map<String, String> namedParameters = Collections.singletonMap("first_name", firstName);
	return this.namedParameterJdbcTemplate.queryForObject(sql, namedParameters, Integer.class);
}
```

그 외에 `NamedParameterJdbcTemplate`에는 `SqlParameterSource` 인터페이스가 존재하는데 이는 `NamedParameterJdbcTemplate`에서 사용하는 파라미터 값들의 소스이다.  

`SqlParameterSource` 의 구현체 별로 예시 코드를 작성해보겠다.

### SqlParameterSource - MapSqlParameterSource
- 생성자 또는 `addValue()` 메서드를 통해서 파라미터 이름과 값을 짝지어서 지정할 수 있다.

```java
/**
 * MapSqlParameterSource public <T> T queryForObject(String sql, SqlParameterSource paramSource, Class<T>
 * requiredType)
 */

// 생성자 방식
public int useMapSqlParameterSource(String firstName) {
    String sql = "select count(*) from customers where first_name = :first_name";
    final MapSqlParameterSource namedParameters = new MapSqlParameterSource("first_name", firstName);
    return namedParameterJdbcTemplate.queryForObject(sql, namedParameters, Integer.class);
}
// addValue 메서드 방식(체이닝으로 계속 연결 가능)
public int useMapSqlParameterSource(String firstName) {
    String sql = "select count(*) from customers where first_name = :first_name";
    final MapSqlParameterSource namedParameters = new MapSqlParameterSource()
            .addValue("first_name", firstName);
    return namedParameterJdbcTemplate.queryForObject(sql, namedParameters, Integer.class);
}
```

### SqlParameterSource - BeanPropertySqlParameterSource
- 자바 빈 객체[^1]의 프로퍼티 이름과 값을 매핑하여 파라미터 맵을 생성한다.

[^1]: 자바 빈 객체는 자바 언어에서 사용되는 객체 중 하나로, 데이터를 저장하고 전달하는 데 사용된다. 일반적으로 DB에서 가져온 데이터를 저장하기 위해 사용되며, 내부에 캡슐화된 데이터에 접근을 하도록 getter 메서드를 구현한다. 자바 빈 객체는 일반적으로 직렬화가 가능한 객체이고, 보통 DTO 패턴으로 구현하며 getter와 setter 메서드를 가진다.

```java
public class Actor {

	private Long id;
	private String firstName;
	private String lastName;

	public String getFirstName() {
		return this.firstName;
	}

	public String getLastName() {
		return this.lastName;
	}

	public Long getId() {
		return this.id;
	}

	// setters omitted...
}
```

생성자 방식으로 사용한다.

```java

// some JDBC-backed DAO class...
private NamedParameterJdbcTemplate namedParameterJdbcTemplate;

public void setDataSource(DataSource dataSource) {
	this.namedParameterJdbcTemplate = new NamedParameterJdbcTemplate(dataSource);
}

public int countOfActors(Actor exampleActor) {
	// notice how the named parameters match the properties of the above 'Actor' class
	String sql = "select count(*) from t_actor where first_name = :firstName and last_name = :lastName";
	SqlParameterSource namedParameters = new BeanPropertySqlParameterSource(exampleActor);
	return this.namedParameterJdbcTemplate.queryForObject(sql, namedParameters, Integer.class);
}
```

`BeanPropertySqlParameterSource`를 사용하면 Java Bean의 프로퍼티 이름과 값을 매핑하므로, 프로퍼티의 이름을 잘못 지정하거나, 값의 타입이 맞지 않는 경우 오류가 발생할 수 있다. 


## RowMapper 란?
RowMapper는 데이터베이스의 반환 결과인 ResultSet을 객체로 변환해주는 클래스이다. 

순수 JDBC를 사용할 때는 다음과 같이 수동으로 결과값을 세팅했는데, RowMapper를 사용하면 이러한 반복 작업을 자동화 해준다.

```java
// 쿼리 날리기
ResultSet rs = stat.excuteQuery("SELECT * FROM Item");

// 결과값 가져오기
while(rs.next()) {
     // item 객체에 값 저장
     item = new Item();
     item.setId(rs.getInt(1));
     item.setItemName(rs.getString(2));
     item.setPrice(rs.getInt(3));
     
     // 리스트에 추가
     itemList.add(item);
}
```

- RowMapper 인터페이스 정의  
```java
public interface RowMapper<T> {
    T mapRow(ResultSet resultSet, int rowNum) throws SQLException;
}
```

mapRow 메서드는 각 행의 데이터를 ResultSet에서 추출하고, 이를 Java 객체로 매핑하는 역할을 한다. 이 메서드는 query() 메서드에서 각 행의 결과가 사용될 때마다 호출된다.

```java
public class PersonRowMapper implements RowMapper<Person> {

    @Override
    public Person mapRow(ResultSet resultSet, int rowNum) throws SQLException {
        Person person = new Person();
        person.setPersonId(resultSet.getLong("person_id"));
        person.setFirstName(resultSet.getString("first_name"));
        person.setLastName(resultSet.getString("last_name"));
        return person;
    }
}
```

```java
public class PersonDAO {
    private JdbcTemplate jdbcTemplate;

    public Person findById(Long id) {
        String sql = "SELECT person_id, first_name, last_name FROM person WHERE person_id = ?";
        return jdbcTemplate.queryForObject(sql, new Object[]{id}, new PersonRowMapper());
    }
}
```


### `BeanPropertyRowMapper` 사용법
`RowMapper` 인터페이스의 구현체로서 Java Bean의 프로퍼티와 ResultSet의 컬럼을 매핑해주는 RowMapper를 자동으로 생성해준다.
여기서 Java Bean은 특별한 규칙을 따르는 클래스를 의미하며, 해당 클래스는 기본 생성자와 프로퍼티에 대한 getter와 setter 메서드를 가져야 한다.
Java Bean의 프로퍼티와 SQL 쿼리 결과의 컬럼명이 일치하는 경우에 자동으로 매핑이 수행되며 Java의 관례에 따라서 Java Bean의 프로퍼티는 Camel 표현을 사용하는 것이 일반적이다.

```java
public class Person {
    private Long personId;
    private String firstName;
    private String lastName;

    // 기본 생성자, getter 및 setter 메서드
}

```

- PERSON_ID, FIRST_NAME, LAST_NAME에 대해서 각각 매핑

```java
import org.springframework.jdbc.core.BeanPropertyRowMapper;

public class PersonDAO {
    private JdbcTemplate jdbcTemplate;

    public Person findById(Long id) {
        String sql = "SELECT PERSON_ID, FIRST_NAME, LAST_NAME FROM person WHERE person_id = ?";
        return jdbcTemplate.queryForObject(sql, new Object[]{id}, new BeanPropertyRowMapper<>(Person.class));
    }
}
```

단, `BeanPropertyRowMapper`는 SQL로 조회할 데이터에 (예시)Role의 모든 필드가 존재할 때만 사용할 수 있다.  
하나라도 빠져있으면 `MapSqlParameterSource`를 사용해야 한다.


## : Reference
[Spring 공식문서 JDBC Core 클래스 기본 사용법](https://docs.spring.io/spring-framework/reference/data-access/jdbc/core.html)  
[HS_dev_log - JdbcTemplate 사용법 및 적용예제](https://innovation123.tistory.com/69#JdbcTemplate%20%EC%82%AC%EC%9A%A9%20%EC%84%A4%EC%A0%95-1)  
[Bibi's DevLog - Spring JdbcTemplate 가이드](https://bibi6666667.tistory.com/300)  
[깃짱코딩 - NamedParameterJdbcTemplate](https://engineerinsight.tistory.com/59)  
[코드 연구소 - JdbcTemplate, RowMapper](https://code-lab1.tistory.com/277)  
[jhj.sharon - Spring JDBC의 정의와 특징](https://sharonprogress.tistory.com/194)