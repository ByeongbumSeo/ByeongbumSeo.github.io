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

jdbcTemplate을 알기 전에 우선 JDBC에 대해서 알아야하는데, 간략하게 설명하자면 아래와 같다.
> JDBC API를 통해 추상화된 인터페이스를 제공하고, 각 벤더사에서 각자의 DBMS에 따라 구현해놓은 드라이버를 설치하여 사용하는 방식으로 DB에 접근한다. 이를 통해 어떤 DB를 사용하든 개발자가 JDBC를 사용하는 방법은 변하지 않는다.

1. DriverManager를 이용해서 Connection 인스턴스를 얻는다.
2. Connection을 통해서 Statement를 얻는다.
3. Statement를 이용해 ResultSet을 얻는다.