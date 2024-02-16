---
title: JDK, JRE, JVM (작성 중)
date: 2024-02-13 20:00:22 +09:00
categories:
  - 언어
  - Java
tags:
  - Java
  - JDK
  - JRE
  - JVM
---

## 공부하게 된 배경

IDE에서 새로운 프로젝트를 생성하게 되면, 반드시 JDK를 설정해주어야 한다. 그렇지 않으면 그 프로젝트를 실행시킬 수 없다.
IntelliJ로 새로운 프로젝트를 생성하던 중, JDK에 대해서 정확히 정리해야겠다는 생각이 들었다.

JDK, JRE, JVM은 Java를 다루는 개발자들에게는 필수적으로 알아야할 요소이기 때문이다.

> 한 번 쓰고 모든 곳에서 실행한다 (Write Once, Run Anywhere, WORA)

라는 Java의 철학을 구현한 JVM과 그것을 포함하는 JRE, JDK에 대해서 상세히 설명하려 한다.


## 다루는 내용
- JDK
- JRE
- JVM
- JIT
- javac

## JDK 란?
---
JDK는 Java Development Kit의 약자로, Java용 SDK라 생각하면 된다.

> **SDK**  
    Software Development Kit(소프트웨어 개발 키트)로 하드웨어 플랫폼, 운영체제 또는 프로그래밍 언어 제작사가 제공하는 툴이다.  
    키트의 요소는 제작사마다 다르며 SDK의 대표적인 예로 안드로이드 스튜디오 등이 있다.
    이 SDK를 활용하여 어플리케이션을 개발할 수 있다.

따라서 JDK는 Java 프로그램 실행에 필요한 **JRE** 와 Java 개발 시 필요한 라이브러리들 그리고 javac, javadoc 등의 개발 도구들을 포함하고 있다.


![JDK의 구성요소](/assets/img/posts/2024-02-13-23-44-29.png)
> 출처 : [Inpa Dev - JDK 정리](https://inpa.tistory.com/entry/JAVA-%E2%98%95-JDK-JRE-JVM-%EA%B0%9C%EB%85%90-%EA%B5%AC%EC%84%B1-%EC%9B%90%EB%A6%AC-%F0%9F%92%AF-%EC%99%84%EB%B2%BD-%EC%B4%9D%EC%A0%95%EB%A6%AC)
> - JDK는 JRE, JVM을 모두 포함하고 있으며 Java 개발 시 필요한 development tools도 포함하고 있다.



### JDK 버전

Java의 버전을 표현할 때에는 보통 JDK 또는 Java SE 버전으로 나타낸다.

초기 버전인 1.0/1.1 버전에서는 *JDK 1.0* / *JDK 1.2* 와 같이 버전을 표기했지만, JDK 1.2 이후부터는 *J2SE* (Java2 Standard Edition)로 표기 명칭이 바뀌고, 2006년 JDK 1.6부터는 *Java SE* (Java Standard Edition)으로 다시 한번 변경되었다.

따라서 JDK를 다운로드하는 공식 사이트에 가면 다음과 같이 Java 버전이 표기되어 있는 것을 볼 수 있다.
![JDK 버전 표기](/assets/img/posts/2024-02-14-00-10-47.png)

즉 Java의 버전은 곧 JDK의 버전을 의미한다. 그리고 나아가 Java를 설치한다는 것은 JDK를 설치한다 라고 할 수 있다.[^1]

[^1]: Java 애플리케이션을 실행하는 데만 관심이 있다면 JRE만 설치하여도 충분하다. 하지만 일반적으로는 Java 애플리케이션을 개발하기 위해 필요한 도구와 라이브러리가 포함된 JDK를 설치하여 개발한다.

Java 상세 버전 표기법은 다음과 같다.
![Java 상세 버전 표기법](/assets/img/posts/2024-02-14-00-29-51.png)
> 출처 : [Inpa Dev - JDK 정리](https://inpa.tistory.com/entry/JAVA-%E2%98%95-JDK-JRE-JVM-%EA%B0%9C%EB%85%90-%EA%B5%AC%EC%84%B1-%EC%9B%90%EB%A6%AC-%F0%9F%92%AF-%EC%99%84%EB%B2%BD-%EC%B4%9D%EC%A0%95%EB%A6%AC)

- 주 버전 : 자바 언어에 많은 변화가 있을 경우 증가
- 개선 버전 : 주 버전에서 일부 사항이 개선될 때 증가. 
- 업데이트 버전 : 1~3개월 주기로 버그가 수정될 때마다 증가.
- LTS : 장기 지원 서비스(Long Term Support)를 받을 수 있는 버전.[^2]

[^2]: Oracle 등의 회사에서 Java와 같은 소프트웨어 제품에 대해서 장기 지원한다는 것을 의미한다. 이는 기업 및 조직이 안정적이고 신뢰할 수 있는 환경에서 Java 애플리케이션을 개발하고 운영할 수 있게 하고 따라서 많은 기업은 LTS 버전을 기반으로 Java 애플리케이션을 개발하고 운영한다.

추가로,
JDK는 개발자의 자바 프로그램에 대한 컴파일러를 제공하기 때문에 곧, 코드를 작성할 수 있는 자바 버전을 결정한다.  
예를 들어, 화살표 람다 연산자(Lambda Operator)처럼 자바 8에 있는 좀 더 새로운 기능 지원을 사용하고 싶다면, 컴파일을 위해 최소한 자바 8 JDK가 필요할 것이다. 그렇지 않은 경우, javac 명령이 구문 오류를 표시하면서 해당 코드를 거부할 것이다.



### Java의 다양한 Editions (JDK 패키지)

자바 버전 선택과 함께, 자바 패키지도 선택해야 한다. 

패키지(Package)란 서로 다른 유형의 개발을 표적으로 하는 자바 개발 키트다. 가용 패키지로는 Java SE(Standard Edition), Java EE(Enterprise Edition), 그리고 Java ME(Mobile Edition) 등이 있다.

일반적으로, 개별 JDK 버전은 자바 SE를 포함하고 있다. Java EE나 Java ME를 다운로드하면, 표준 에디션(Standard Edition, SE)도 얻는 것이다. 

초보 개발자라면 어느 패키지가 자신의 프로젝트에 맞는지 확신이 서지 않을 수 있는데, 다행히도 나중에 다른 JDK로 전환하는 것이 어렵지 않으니 알맞은 자바 버전과 JDK 패키지 선정에 대해 너무 걱정하지 않아도 괜찮다.


#### Java SE(Java Standard Edition)
: 가장 기본이 되는 표준 에디션의 자바 플랫폼으로 자바 언어의 핵심 기능을 제공

- 가장 기본적인 클래스 패키지로 구성
- PC용 어플리케이션, 애플릿개발, 응용프로그램개발, 웹개발, 안드로이드개발
- PC에 설치해서 사용할 수 있는 모든 프로그램 개발에 관련된 것


#### Java EE(Java Enterprise Edition)
: 대규모 기업용 에디션. SE확장판(대형 네트워크환경 프로그램 개발시)

- 자바 빈(JavaBeans)이나 객체 관계 매핑(Object Relational Mapping, ORM) 지원
- 기업환경을 위한 대규모 솔루션 개발, 모바일폰, 셋탑 박스, 차량용 텔레매틱스 시스템 개발


#### Java ME(Java Micro Edition)
: 피쳐폰, PDA폰, 셉톱박스, 프린터와 같은 작은 임베디드 기기들 같은 작은 기기를 다루는데 이용하는 에디션

- JAVA SE를 줄여 라이트하게 만든 것이므로 SE개발을 할 줄 알면 ME기반의 개발도 가능
- 각각의 OS(ex. Android OS, IOS, Black Berry 등)를 가지고 있는 스마트 폰이 대중화된 지금은 잘 쓰이지 않는다


#### JavaFX
: 가볍고 예쁜 그래픽 사용자 인터페이스(GUI)를 제공하는 에디션

- 고성능의 하드웨어 그래픽 가속과 미디어 엔진 API를 제공해주어서 프로그램의 성능에 신경을 써야하는 분야에서 사용


## JRE

RE는 단지 자바 프로그램을 구동하기 위한 독립형 구성요소로써 사용될 수도 있지만, 동시에 JDK의 일부이기도 하다. 자바 프로그램을 구동하는 것이 자바 프로그램 개발의 일환이기 때문에 JDK는 JRE를 필요로 한다.



## : Reference

- [Oracle - Java Archive](https://www.oracle.com/kr/java/technologies/downloads/archive/#JavaSE)
- [Inpa Dev - JDK, JRE, JVM 개념 & 구성 원리](https://inpa.tistory.com/entry/JAVA-%E2%98%95-JDK-JRE-JVM-%EA%B0%9C%EB%85%90-%EA%B5%AC%EC%84%B1-%EC%9B%90%EB%A6%AC-%F0%9F%92%AF-%EC%99%84%EB%B2%BD-%EC%B4%9D%EC%A0%95%EB%A6%AC)