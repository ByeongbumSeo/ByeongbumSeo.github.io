---
title: JDK, JRE, JVM
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

## JDK 란?
---
JDK는 Java Development Kit의 약자로, Java용 SDK라 생각하면 된다.

> **SDK**
    Software Development Kit(소프트웨어 개발 키트)로 하드웨어 플랫폼, 운영체제 또는 프로그래밍 언어 제작사가 제공하는 툴이다.
    키트의 요소는 제작사마다 다르며 SDK의 대표적인 예로 안드로이드 스튜디오 등이 있다.

    이 SDK를 활용하여 어플리케이션을 개발할 수 있다.

따라서 JDK는 Java 프로그램 실행에 필요한 **JRE** 와 Java 개발 시 필요한 라이브러리들 그리고 javac, javadoc 등의 개발 도구들을 포함하고 있다.



![JDK의 구성요소](/assets/img/posts/2024-02-13-23-44-29.png)
> JDK는 JRE, JVM을 모두 포함하고 있으며 Java 개발 시 필요한 development tools도 포함하고 있다.
> 출처 : [Inpa Dev - JDK 정리](https://inpa.tistory.com/entry/JAVA-%E2%98%95-JDK-JRE-JVM-%EA%B0%9C%EB%85%90-%EA%B5%AC%EC%84%B1-%EC%9B%90%EB%A6%AC-%F0%9F%92%AF-%EC%99%84%EB%B2%BD-%EC%B4%9D%EC%A0%95%EB%A6%AC)

### JDK 버전

Java의 버전을 표현할 때에는 보통 JDK 또는 Java SE 버전으로 나타낸다.

초기 버전인 1.0/1.1 버전에서는 *JDK 1.0* / *JDK 1.2* 와 같이 버전을 표기했지만, JDK 1.2 이후부터는 *J2SE*(Java2 Standard Edition)로 표기 명칭이 바뀌고, 2006년 JDK 1.6부터는 *Java SE*(Java Standard Edition)으로 다시 한번 변경되었다.

따라서 JDK를 다운로드하는 공식 사이트에 가면 다음과 같이 Java 버전이 표기되어 있는 것을 볼 수 있다.

### Java의 다양한 Editions

#### Java SE(Java Standard Edition) : 가장 기본이 되는 표준 에디션의 자바 플랫폼으로 자바 언어의 핵심 기능을 제공

가장 기본적인 클래스 패키지로 구성
PC용 어플리케이션, 애플릿개발, 응용프로그램개발, 웹개발, 안드로이드개발

PC에 설치해서 사용할 수 있는 모든 프로그램 개발에 관련된 것



Java EE(Java Enterprise Edition) : 대규모 기업용 에디션. SE확장판(대형 네트워크환경 프로그램 개발시)

기업환경을 위한 대규모 솔루션 개발, 모바일폰, 셋탑 박스, 차량용 텔레매틱스 시스템 개발


Java ME(Java Micro Edition) : 피쳐폰, PDA폰, 셉톱박스, 프린터와 같은 작은 임베디드 기기들 같은 작은 기기를 다루는데 이용하는 에디션

JAVA SE를 줄여 라이트하게 만든 것이 므로 SE개발을 할 줄 알면 ME기반의 개발도 가능
각각의 OS(ex. Android OS, IOS, Black Berry 등)를 가지고 있는 스마트 폰이 대중화된 지금은 잘 쓰이지 않는다


JavaFX : 가볍고 예쁜 그래픽 사용자 인터페이스(GUI)를 제공하는 에디션

고성능의 하드웨어 그래픽 가속과 미디어 엔진 API를 제공해주어서 프로그램의 성능에 신경을 써야 하는 분야에서 사용
출처: https://inpa.tistory.com/entry/JAVA-☕-JDK-JRE-JVM-개념-구성-원리-💯-완벽-총정리 [Inpa Dev 👨‍💻:티스토리]