---
title: Gradle과 Maven(작성중)
date: 2024-02-27 20:00:22 +09:00
categories:
  - 언어
  - Java
tags:
  - Java
  - Gradle
  - Maven
  - 빌드관리도구
  - Groovy
---


## 공부하게 된 배경
---

Gradle과 Maven은 둘 다 프로젝트 빌드, 의존성 관리 등을 자동화하는 빌드 도구다.

서버 개발에서는 여러 모듈과 라이브러리를 사용해 어플리케이션을 개발한다. 따라서 보통 Gradle 또는 Maven을 선택해서 사용하는 것이 대다수다.

나는 사이드 프로젝트에서는 Gradle을 사용해왔지만 회사에서는 Maven을 사용하고 있다.

대표적인 빌드 도구인 Gradle과 Maven에 대해서 자세히 정리하려 한다.

## 다루는 내용
---

- 빌드
- 빌드 관리 도구
- Gradle
- Maven
- Groovy




## 빌드 관리 도구란?
---

일반적으로 다양한 외부 라이브러리들을 사용하여 애플리케이션을 개발해야하는 상황이 많다. 이 때 각 라이브러리들을 번거롭게 모두 다운받을 필요없이, 빌드도구 설정파일(ex. `pom.xml`, `build.gradle`)에 필요한 라이브러리 종류와 버전들, 종속성 정보를 명시하여 필요한 라이브러리들을 자동으로 다운로드하고 관리할 수 있다.

빌드 관리 도구가 수행하는 작업은 다음과 같다.

- 종속성 다운로드
- 전처리(Preprocessing)
- 소스코드를 바이너리 코드로 컴파일(Compile)
- 바이너리 코드를 패키징(Packaging)
- 테스트 실행(Testing)
- 프로덕션 시스템에 배포(distribution)


빌드 툴로는 Ant, Maven, Gradle 등이 있다.


## 빌드란 ?

빌드란 소스 코드 파일을 서버나 런타임 환경과 같은 대상 환경에서 실행하거나 배포할 수 있도록 형식을 변환하는 프로세스를 말한다.

Java 프로젝트의 경우 빌드를 통해 Java 소스 코드 파일(.java)을 바이트 코드(.class)로 컴파일하고 프로젝트에서 쓰인 각각의 파일 및 자원(.xml, .jpa, .jpg, properties)을 구조화하여 애플리케이션이 올바르게 실행되거나 배포될 수 있도록 한다.

빌드 프로세스 중 몇 가지 주요 단계를 설명하면 다음과 같다. (이 부분은 글의 주요 관심사에서 살짝 벗어나는 내용이므로 넘어가도 좋다.)

- 소스 코드 컴파일: Java 컴파일러(javac)는 사람이 읽을 수 있는 Java 소스 코드(.java 파일)를 플랫폼 독립적인 바이트 코드(.class 파일)로 변환한다. 이는 JVM(자바 가상 머신)이 읽을 수 있다.

- 리소스 패키징: 구성 파일, 정적 자산(예: 이미지 또는 HTML 파일) 및 기타 필요한 파일을 포함한 모든 프로젝트 리소스를 수집하고 구성한다. 이러한 리소스는 배포 가능한 아티팩트를 생성하기 위해 컴파일된 바이트코드와 함께 번들로 묶이는 경우가 많다.

- 종속성 해결: 라이브러리나 프레임워크 등 프로젝트에 필요한 종속성이 해결되어 빌드에 포함된다. **Maven 또는 Gradle과 같은 종속성 관리 도구는 레포지토리에서 종속성을 가져와서 이를 자동으로 처리한다.**

- 매니페스트 파일 생성: 실행 가능한 JAR 파일의 경우 매니페스트 파일(일반적으로 'MANIFEST.MF')이 생성되거나 업데이트된다. 매니페스트 파일에는 버전 정보, 기본 클래스, 클래스 경로 항목 등 JAR 파일에 대한 메타데이터가 포함되어 있다.

- 테스트 실행: 단위 테스트, 통합 테스트 및 기타 유형의 테스트를 포함한 자동화된 테스트가 실행되어 애플리케이션의 정확성을 보장한다.

- 패키징 및 배포: 마지막으로 컴파일된 바이트코드는 프로젝트 리소스 및 추가 종속성과 함께 배포에 적합한 배포 가능한 형식으로 패키지된다. 일반적인 형식에는 JAR 파일, WAR 파일(웹 애플리케이션용) 또는 실행 가능한 바이너리 등이 있다.



즉, 프로젝트에서 작성한 java 코드와 프로젝트 내에 필요한 각종 xml, properties, jar 파일들을 JVM이나 WAS가 인식할 수 있도록 패키징 해주는 것이 빌드이고,

Maven, Gradle 및 Ant와 같은 도구는 빌드 프로세스에 대한 자동화 및 표준화를 제공하여 복잡한 프로젝트 및 종속성을 더 쉽게 관리할 수 있도록 해준다.



​
## Maven
---
개발 시 많은 라이브러리들을 사용하게 되면 이를 관리하는 것이 힘들어지는데 Maven은 이러한 문제를 해결해줄 수 있는 도구다.

Maven은 내가 사용할 라이브러리뿐만 아니라 해당 라이브러리가 작동하는데 필요한 다른 라이브러리들까지 관리하여 자동으로 다운로드하여 준다.
​
- Maven은 Java용 프로젝트 관리도구로 Apache의 Ant 대안으로 만들어졌다.

- XML스크립트를 기반으로 하며, 빌드 중인 프로젝트, 빌드 순서, 다양한 외부 라이브러리 종속성 관계를 `pom.xml` 파일에 명시한다.

- Maven은 외부저장소에서 필요한 라이브러리와 플러그인들을 다운로드 한다음, 로컬시스템의 캐시에 모두 저장한다.

- 예를 들어, "Spring Boot Data JPA Starter" 모듈을 사용하여 프로젝트를 개발하고 싶다면 [메이븐 레포지토리](https://mvnrepository.com/artifact/org.springframework.boot/spring-boot-starter-data-jpa/2.2.4.RELEASE)에서 해당 모듈을 검색하여 xml 설정파일에 추가하여 사용할 수 있다.

```xml
<!-- https://mvnrepository.com/artifact/org.springframework.boot/spring-boot-starter-data-jpa -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
    <version>2.2.4.RELEASE</version>
</dependency>
```

### POM - Project Object Model

pom은 이름 그대로 Project Object Model의 정보를 담고있는 파일이다. 이 파일에서 주요하게 다루는 기능들은 다음과 같다.

- 프로젝트 정보 : 프로젝트의 이름, 개발자 목록, 라이센스 등
- 빌드 설정 : 소스, 리소스, 라이프 사이클별 실행한 플러그인(goal)등 빌드와 관련된 설정
- 빌드 환경 : 사용자 환경 별로 달라질 수 있는 프로파일 정보
- POM연관 정보 : 의존 프로젝트(모듈), 상위 프로젝트, 포함하고 있는 하위 모듈 등

Maven의 기능을 이용하기 위해 POM(`pom.xml`)이 사용된다.


### Maven의 Life Cycle

메이븐(Maven)에서는 미리 정의하고 있는 빌드 순서가 있는데 이 순서를 라이프사이클(Life Cycle)이라고 하며, 정해진 Lifecycle에 의하여 작업을 수행한다.

라이프 사이클에서 각각의 빌드 단계를 Phase라고 하는데 Phase들은 의존 관계를 가지고 있어 해당 Phase가 수행되려면 이전 단계의 Phase가 모두 수행되어야 한다.

> clean - validate - compile - test - package - verify - install - site - deploy의 라이프 사이클을 가진다.

- Clean : 이전 빌드에서 생성된 파일들을 삭제하는 단계
- Validate : 프로젝트가 올바른지 확인하고 필요한 모든 정보를 사용할 수 있는지 확인하는 단계
- Compile : 프로젝트의 소스 코드를 컴파일하는 단계
- Test : 유닛(단위) 테스트를 수행하는 단계 - (테스트 실패 시 빌드 실패로 처리한다. 스킵 가능)
- Package : 실제 컴파일된 소스 코드와 리소스들을 jar 등의 배포를 위한 패키지로 만드는 단계
- Verify : 통합 테스트 결과에 대한 검사를 실행하여 품질 기준을 충족하는지 확인하는 단계
- Install : 패키지를 로컬 저장소에 설치하는 단계
- Site : 프로젝트 문서를 생성하는 단계
- Deploy : 만들어진 패키지(Package)를 원격 저장소에 release 하는 단계

위의 라이프 사이클(Life Cycle) 외에도 더 많은 라이프 사이클이 존재한다.

이를 크게 Clean, Build, Site 3가지 라이프 사이클로 나누고 있고, 각 단계를 모두 수행하는 것이 아니라 원하는 단계까지만 수행할 수 있다.


### 장점

- 컴파일과 빌드를 동시에 수행할 수 있다.
- 서버의 Deploy 자원을 관리할 수 있는 환경을 제공한다.
- pom.xml 파일을 통해 관리하므로 개발, 유지보수 측면에서 오픈소스 라이브러리, 프로젝트 등 관리가 용이하다.
- IDE에 종속된 부분들을 제거할 수 있다.
- Maven Profile 기능을 통해 배포 설정 파일을 관리하고 배포 파일을 생성할 수 있다.

### 단점

- Maven에서 기본적으로 지원하지 않는 빌드 과정을 추가해야 하는 경우 상당한 고생이 따른다.
- 특정 플러그인이 설정이 약간만 달라도 해당 설정을 분리해서 중복 기술할 때가 발생한다. 불필요하게 설정이 길어지고 중복, 가독성 저하가 발생하여 유지보수성을 떨어뜨린다.
- 이와 같은 단점을 해결하기 위해, Gradle(그레이들)이라는 새로운 빌드 툴이 등장하였다. Gradle은 안드로이드 애플리케이션의 기본 빌드 툴로 채택되었다.


### Apache Ant vs Maven
Apache Ant는 비교적 자유도가 높은 편이고, Maven은 정해진 라이프사이클에 의하여 작업을 수행하며, 전반적인 프로젝트 관리 기능까지 포함하는 차이점이 있다. (Maven은 Build Tool + Project Management)


## Gradle
---

그래들(Gradle)은 Maven 이후에 나온 최신 Java 빌드 도구로 '그루비(Groovy)[^2]' 문법을 사용해서 작성한다.

`Build.gradle`에 스크립트를 작성하며, 대규모 프로젝트에서 복잡해지는 경향이 있는 XML 기반 스크립트에 비해 관리가 편하다는 장점이 있다. 현재 안드로이드(Android) 프로젝트의 표준 빌드 도구로 채택되어 있기도 하다.

Groovy 스크립트 언어로 구성되어 있기에 XML과 달리 변수선언, if, else, for 등의 로직을 구현할 수 있고 간결한 작성이 가능하다.

- Apacahe Maven과 Apache Ant에서 볼수 있는 개념들을 사용하는 대안으로써 나온 프로젝트 빌드 관리 툴이다. (완전한 오픈소스). 따라서 Maven을 완전 지원한다.[^1]

- Java, Groovy, Kotlin 등의 언어들을 지원한다.

- Build Script를 Groovy 기반의 DSL(Domail Specific Language)를 사용하여 코드로서 설정 정보를 구성하므로 xml파일을 사용하는 Maven보다 코드가 훨씬 간결하다.

- multi-project 빌드를 도울 수 있도록 디자인되었다.

- Gradle은 바뀐 파일들에 대해서만 재빌드가 일어난다. 따라서 빌드 속도가 Maven에 비해 10~100배 가량 빠르다.

[^1]: 메이븐(Maven)의 pom.xml을 Gradle 용으로 변환할 수도 있으며 Maven의 중앙 저장소도 지원하기 때문에 라이브러리를 모두 그대로 가져다 사용할 수 있다.

[^2]: Groovy는 JVM에서 실행되는 스크립트 언어이다. 따라서 JVM에서 동작하지만 소스코드를 컴파일할 필요 없다. Java와 호환되며, Java class 파일들을 Groovy class로 사용 가능하다.
Java 문법과 유사하여 빌드 처리를 관리할 수 있다.

### 빌드 라이프 사이클

Gradle 빌드에는 세 가지 단계가 있다.

1. Initialization(초기화)

Gradle은 단일 및 다중 프로젝트 빌드를 지원한다. 초기화 단계에서 Gradle은 빌드에 참여할 프로젝트를 결정하고 각 프로젝트에 대한 Project 인스턴스를 생성한다.

2. Configuration(구성)

빌드에 속하는 모든 프로젝트의 빌드 스크립트를 실행한다. 이를 통해 프로젝트 객체를 구성한다.

3. Execution(실행)

구성 단계에서 생성하고 설정된 태스크 중에 실행할 것을 결정한다. 이 때 gradle 명령행에 인자로 지정한 태스크 이름과 현재 디렉토리를 기반으로 태스크를 결정하여 선택된 것들을 실행한다.



### 프로젝트 설정 방법
- `build.gradle` : 빌드에 대한 모든 기능을 정의, 환경 설정, 빌드 방법, 라이브러리 정보를 기술하여 프로젝트의 관리 환경을 구성

- `setting.gradle` : 프로젝트 구성을 할 때 작성하는 파일. 프로젝트간의 의존성 및 멀티 프로젝트를 구성할 때 사용


#### setting.gradle

gradle에는 빌드 파일 말고도 설정 파일도 있다. 설정 파일은 명명규칙에 따라 Gradle이 자동 인식한다. 기본 파일명은 `settings.gradle`이다.

설정 파일은 초기화 단계에서 실행된다. 멀티 프로젝트는 무조건 최상위 프로젝트에 `settings.gradle`이 있어야 한다. 어느 프로젝트가 멀티 프로젝트 빌드에 속하는지를 여기서 정한다. 단일 프로젝트 빌드에서는 설정 파일이 없어도 된다.

- 단일 프로젝트에서의 `settings.gradle`

```gradle
println 'This is executed during the initialization phase.'
```

- `build.gradle`

```gradle
println 'This is executed during the configuration phase.'
 
task configured {
    println 'This is also executed during the configuration phase.'
}
 
task test << {
    println 'This is executed during the execution phase.'
}
```

실행하면
```
> gradle test
This is executed during the initialization phase.
This is executed during the configuration phase.
This is also executed during the configuration phase.
:test
This is executed during the execution phase.

BUILD SUCCESSFUL
```

> 즉 init -> configure -> exec 순으로 라이프 사이클이 실행된다.
> - **init** 사이클에서는 `settings.gradle` 파일의 내용이 실행된다.
> - **configure** 사이클에서는 `build.gradle` 파일에 있는 모든 내용이 실행된다. (task.doFirst, task.doLast 등은 제외)
> - **exec** 사이클에서 실제로 사용자가 매개변수로 넘긴 task 명으로 task를 실행한다.

### Gradle의 장점
 
#### (1) 간결한 스크립트
Gradle 이전의 빌드 도구인 Ant와 Maven은 XML 문법으로 스크립트를 작성하였다.
XML은 여는 태그와 닫는 태그를 넣어야 하기에 복잡한 빌드 스크립트를 작성하기가 어려우며 가독성이 떨어진다.
반면, Gradle은 Groovy 문법으로 간결한 스크립트를 작성할 수 있다.
 
#### (2) 빌드 속도
프로젝트 규모가 커지게 되면 빌드 속도 차이가 개발 생산성에 큰 영향을 미치게 된다.

Gradle은 캐싱(caching)을 하기 때문에 이전 빌드 도구들보다 빌드 속도가 빠르다. 만약 두개 이상의 빌드가 돌아가고, 하나의 빌드에서 사용되는 파일들이 다른 빌드에 사용된다면 Gradle은 빌드 캐시를 이용해 이전 빌드의 결과물을 다른 빌드에서 사용할 수 있다.

빌드 속도가 빠른 또 다른 이유는 점진적 빌드를 하기 때문인데, 이는 이미 빌드된 파일들을 모두 다시 빌드하는 것이 아니라 바뀐 파일들에 대해서만 빌드하는 것을 뜻한다.

※ 하단 링크 페이지에 빌드 캐시(Build cache)를 이용할 경우 Gradle이 Maven의 빌드 속도가 최대 100배까지 벌어질 수 있다고 적혀 있다.  
[Gradle 공식페이지 - Gradle vs Maven Comparison](https://gradle.org/maven-vs-gradle/)


#### (3) 멀티 프로젝트 빌드
대규모 Java 프로젝트는 대부분 다중 모듈로 구성된다.

즉, 하나의 프로젝트 안에 여러 모듈이 동시에 개발되며, 각 모듈이 공통으로 사용하는 모듈도 만들어지게 되는데 이렇게 동시에 여러 모듈을 개발하게 되는 경우 각각 따로 빌드 작업을 하면 번거로울 뿐만 아니라 실수가 생기기도 쉽다.

[Gradle의 멀티 프로젝트 빌드 기능](https://kwonnam.pe.kr/wiki/gradle/multiproject)을 이용하면 이런 번거로움과 실수를 획기적으로 줄일 수 있다.


## Gradle vs Maven
---
Maven은 고정적이고 선형적인 단계의 모델을 기반으로 한다. 반면 Gradle은 작업 의존성 그래프를 기반으로 한다.

둘 다 다중 모듈 빌드를 병령으로 실행할 수 있지만, Gradle은 task의 업데이트 여부를 체크하기 때문에 incremental build를 허용한다. 이미 업데이트 된 태스크에 대해서는 작업을 실행하지 않으므로 빌드 시간이 단축된다.

Maven은 멀티 프로젝트에서 특정 설정을 다른 모듈에 사용하려면 상속을 받아야 하지만, Gradle은 설정 주입 방식을 제공한다.

Gradle은 concurrent에 안전한 캐시를 허용한다. 2개 이상의 프로젝트에서 동일한 캐시를 사용 할 경우, 서로 overwrite되지 않도록 checksum 기반의 캐시를 사용하고, 캐시를 repository와 동기화 시킬 수 있다.

Gradle은 커스터마이징이 Maven에 비해 간편하다.



Build라는 동적인 요소를 XML로 정의하기에는 어려운 부분이 많다.
설정 내용이 길어지고 가독성 떨어짐
의존관계가 복잡한 프로젝트 설정하기에는 부적절
상속구조를 이용한 멀티 모듈 구현
특정 설정을 소수의 모듈에서 공유하기 위해서는 부모 프로젝트를 생성하여 상속하게 해야함 (상속의 단점 생김)
Gradle은 그루비를 사용하기 때문에, 동적인 빌드는 Groovy 스크립트로 플러그인을 호출하거나 직접 코드를 짜면 된다.
Configuration Injection 방식을 사용해서 공통 모듈을 상속해서 사용하는 단점을 커버했다.
설정 주입시 프로젝트의 조건을 체크할 수 있어서 프로젝트별로 주입되는 설정을 다르게 할 수 있다.
Gradle은 메이븐보다 최대 100배 빠르다.



---

1. 

2. 


3. 의존성이 늘어날 수록 성능과 스크립트 품질의 차이가 심해질 것이다.

maven은 프로젝트가 커질수록 빌드 스크립트의 내용이 길어지고 가독성이 떨어집니다.

반면에 gradle은 훨씬 적은 양의 스크립트로 짧고 간결하게 작성할 수 있습니다.

 
maven이 정적인 형태의 XML 기반으로 작성되어 동적인 빌드를 적용할 경우 어려움이 많다면,

gradle은 Groovy를 사용하기 때문에 동적인 빌드는 Groovy 스크립트로 플러그인을 호출하거나 직접 코드를 짜면 됩니다.



의존성이 늘어날 수록 스크립트 품질의 차이가 커진다.
Maven은 멀티 프로젝트에서 특정 설정을 다른 모듈에서 사용하려면 상속 받아야하지만, gradle은 설정 주입 방식을 사용하므로 멀티 프로젝트에 적합하다.



### 1. 모델: 
Maven은 고정 및 선형 모델을 기반으로 하는 반면 Gradle은 작업 종속성 그래프를 기반으로 한다.

Maven은 컴파일, 테스트, 패키지 등과 같은 단계로 사전 정의된 수명 주기를 따르는 반면 Gradle은 종속성을 기반으로 작업을 정의하고 조정하는 데 더 많은 유연성을 제공한다.


### 2. 증분 빌드:
Gradle은 증분 빌드를 지원한다. 즉, 마지막 빌드 이후 변경된 작업만 실행하므로 빌드 시간이 더 빨라진다. 

반면 Maven은 기본적으로 증분 빌드를 지원하지 않는다.

### 3. 구성:
Maven은 여러 프로젝트/모듈에서 구성을 공유하기 위해 상속에 의존하는 반면   Gradle은 Configuration Injection 방식을 제공하여 더 많은 유연성을 제공하고 상속의 함정[^3]을 피할 수 있다.

[^3]: 특정 설정을 소수의 모듈에서 공유하기 위해서는 부모 프로젝트를 생성하여 상속하게 해야하는 등. 상속에는 단점들이 존재한다.

### 4. 성능:
Gradle은 특히 대규모 프로젝트의 경우 Maven보다 훨씬 빠른 것으로 알려져 있다. 이는 Gradle이 동시 안전 캐시 메커니즘을 사용하고 작업을 병렬로 실행하는 기능에 기인한다.


> 빌드와 테스트 실행 결과 gradle이 더 빠르다. (gradle은 캐시를 사용하기 때문에 테스트 반복 시 차이가 더 커진다.)
![Gradle vs Maven 속도 비교](/assets/img/posts/2024-03-16-21-59-28.png)


### 5. 스크립팅:
Gradle은 Groovy를 스크립팅 언어로 사용하므로 개발자는 간결하고 표현력이 풍부한 빌드 스크립트를 작성할 수 있다.  
반면에 Maven은 구성을 위해 XML을 사용하는데, 이는 복잡한 빌드의 경우 장황하고 읽기가 어려울 수 있다.

즉, 스크립트 길이와 가독성 면에서 gradle이 우세하다.

### 6. 커뮤니티 및 생태계:
Maven은 역사가 상대적으로 길기 때문에 광범위한 문서, 플러그인 및 템플릿을 쉽게 사용할 수 있는 더 큰 사용자 커뮤니티와 더 성숙한 생태계를 갖추고 있다.

Gradle의 커뮤니티와 생태계는 빠르게 성장하고 있지만 여전히 Maven에 비해 덜 확립되었다고 볼 수도 있다.


### 7. 사용자 정의:
Gradle은 Maven에 비해 사용자 정의에 더 많은 유연성을 제공한다.

개발자는 플러그인을 통해 또는 Groovy에서 사용자 정의 스크립트를 작성하여 Gradle의 기능을 쉽게 확장할 수 있다.


### 무엇을 선택해야하나 ?
두 도구 모두 종속성 관리, 빌드 자동화, 서버 측 개발 환경에서 프로젝트 관리 촉진에 탁월하다.

전반적으로 Maven과 Gradle 사이의 선택은 프로젝트 요구 사항, 팀 선호도, 도구에 대한 친숙도와 같은 요소에 따라 달라진다.

Maven은 강력한 커뮤니티 지원을 갖춘 업계 표준 빌드 도구로 남아 있으며 Gradle은 특히 크고 복잡한 프로젝트에 더 많은 유연성과 성능 이점을 제공한다.



## 빌드 툴의 역사
---
### 1세대 Make
- 빌드 개념을 확립
- Unix 계열 OS에서 사용

### 2세대 Ant
- 범용성을 높임(크로스 플랫폼 대응)
- Make를 java에 적용하려다보니 문제, 보완하기 위해 탄생
- Java + XML 도입

### 3세대 Maven
- 작성 효율을 높임
- 빌드 생명주기와 프로젝트 객체모델(POM)개념을 도입 → Ant의 문제점인 장황한 빌드스크립트 문제를 해결

### 4세대 Gradle
- 스크립트 언어로 유연성을 증대
- Maven보다 빠름
- 기존 Maven, Ivy 등 다른 빌드도구와 호환 가능



## : Reference
---
- [지수의 개발 기록장 - Maven,Gradle](https://jisooo.tistory.com/entry/Spring-%EB%B9%8C%EB%93%9C-%EA%B4%80%EB%A6%AC-%EB%8F%84%EA%B5%AC-Maven%EA%B3%BC-Gradle-%EB%B9%84%EA%B5%90%ED%95%98%EA%B8%B0)
- [무작정 개발 - Maven,Gradle](https://backendcode.tistory.com/199)
- [smlee - Maven과 Gradle의 개념 및 비교](https://velog.io/@leesomyoung/Maven%EA%B3%BC-Gradle%EC%9D%98-%EC%B0%A8%EC%9D%B4-%EB%B0%8F-%EB%B9%84%EA%B5%90)
- [HyoJun Blog - Maven과 Gradle의 차이](https://hyojun123.github.io/2019/04/18/gradleAndMaven/)
- [coco3o - 메이븐(Maven)과 그래들(Gradle)의 개념 및 비교](https://dev-coco.tistory.com/65)
- [조세영의 Kotlin World - Gradle이란 무엇인가?](https://kotlinworld.com/311)
- [권남 - Gradle Build Lifecycle](https://kwonnam.pe.kr/wiki/gradle/buildlifecycle)
- [Dreamy - Gradle Build Lifecycle](https://blog.naver.com/writer0713/221659376934)

