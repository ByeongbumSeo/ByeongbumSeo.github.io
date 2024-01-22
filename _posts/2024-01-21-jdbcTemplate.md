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

