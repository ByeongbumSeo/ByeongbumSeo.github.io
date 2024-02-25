---
title: JDK, JRE, JVM, JIT
date: 2024-02-13 20:00:22 +09:00
categories:
  - 언어
  - Java
tags:
  - Java
  - JDK
  - JRE
  - JVM
  - JIT
---

## 공부하게 된 배경
---
IDE에서 새로운 프로젝트를 생성하게 되면, 반드시 JDK를 설정해주어야 한다. 그렇지 않으면 그 프로젝트를 실행시킬 수 없다.
IntelliJ로 새로운 프로젝트를 생성하던 중, JDK에 대해서 정확히 정리해야겠다는 생각이 들었다.

JDK, JRE, JVM은 Java를 다루는 개발자들에게는 필수적으로 알아야할 요소이기 때문이다.

> 한 번 쓰고 모든 곳에서 실행한다 (Write Once, Run Anywhere, WORA)

라는 Java의 철학을 구현한 JVM과 그것을 포함하는 JRE, JDK에 대해서 상세히 설명하려 한다.


## 다루는 내용
---
이 글에서는

- JDK
- JRE
- JVM
- JIT
- 컴파일 방식 vs 인터프리터 방식

외에도 전반적인 Java의 실행 방식을 자세히 설명하고 있다.

아래 사진은 글에서 설명하려는 JDK,JRE,JVM,JIT의 요약도다.

![JDK,JRE,JVM,JIT의 요약도](/assets/img/posts/2024-02-26-02-56-43.png)
> 출처 : [https://catch-me-java.tistory.com/11](https://catch-me-java.tistory.com/11)

## JDK (Java Development Kit)
---
JDK는 Java Development Kit의 약자로, Java용 SDK라 생각하면 된다.
개발자가 Java로 프로그래밍하는 전 과정을 도와준다.

> **SDK**  
    Software Development Kit(소프트웨어 개발 키트)로 하드웨어 플랫폼, 운영체제 또는 프로그래밍 언어 제작사가 제공하는 툴이다. 
    키트의 요소는 제작사마다 다르며 SDK의 대표적인 예로 안드로이드 스튜디오 등이 있다. 
    이 SDK를 활용하여 어플리케이션을 개발할 수 있다.

따라서 JDK는 Java 프로그램 실행에 필요한 **JRE** 와 Java 개발 시 필요한 라이브러리들 그리고 javac(컴파일러), javadoc, 디버거 등의 개발 도구들을 포함하고 있다.


![JDK의 구성요소](/assets/img/posts/2024-02-24-23-33-34.png)

> 출처 : [Inpa Dev - JDK 정리](https://inpa.tistory.com/entry/JAVA-%E2%98%95-JDK-JRE-JVM-%EA%B0%9C%EB%85%90-%EA%B5%AC%EC%84%B1-%EC%9B%90%EB%A6%AC-%F0%9F%92%AF-%EC%99%84%EB%B2%BD-%EC%B4%9D%EC%A0%95%EB%A6%AC)
> - JDK는 JRE, JVM을 모두 포함하고 있으며 Java 개발 시 필요한 development tools도 포함하고 있다.



### JDK 버전
---
현재 Java 언어는 Oracle이 맡아서 관리하고 있으며 Java 언어의 표준을 정하고 새로운 버전들을 개발한다.

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

[^2]: Oracle 등의 회사에서 Java와 같은 소프트웨어 제품에 대해서 장기 지원한다는 것을 의미한다. 이는 기업 및 조직이 안정적이고 신뢰할 수 있는 환경에서 Java 애플리케이션을 개발하고 운영할 수 있게 하고 따라서 많은 기업은 LTS 버전을 기반으로 Java 애플리케이션을 개발하고 운영한다. 8,11,17 버전이 이에 해당한다. 이 버전들은 오랫동안 업데이트나 보안 수정이 장기간 제공되며 '오래 쓰라고 제대로 각잡고 만든 버전'이라고 생각하면 된다. LTS 버전 사이의 버전들은 다음 LTS를 위한 실험적 버전이라고 생각하면 된다. 새로운 기능들을 빠르게 사용할 수 있긴 하지만 해당 버전의 지원이 짧기 때문에 실무에서는 사용하지 않는다.

추가로,
JDK는 개발자의 자바 프로그램에 대한 컴파일러를 제공하기 때문에 곧, 코드를 작성할 수 있는 자바 버전을 결정한다.  
예를 들어, 화살표 람다 연산자(Lambda Operator)처럼 자바 8에 있는 좀 더 새로운 기능 지원을 사용하고 싶다면, 컴파일을 위해 최소한 자바 8 JDK가 필요할 것이다. 그렇지 않은 경우, javac 명령이 구문 오류를 표시하면서 해당 코드를 거부할 것이다.


### Java의 다양한 Editions (JDK 패키지)
---
자바 버전 선택과 함께, 자바 패키지도 선택해야 한다. 

패키지(Package)란 서로 다른 유형의 개발을 표적으로 하는 자바 개발 키트다. 가용 패키지로는 Java SE(Standard Edition), Java EE(Enterprise Edition), 그리고 Java ME(Mobile Edition) 등이 있다.
일반적으로, 개별 JDK 버전은 자바 SE를 포함하고 있다. Java EE나 Java ME를 다운로드하면, 표준 에디션(Standard Edition, SE)도 얻는 것이다. 

초보 개발자라면 어느 패키지가 자신의 프로젝트에 맞는지 확신이 서지 않을 수 있는데, 다행히도 나중에 다른 JDK로 전환하는 것이 어렵지 않으니 알맞은 자바 버전과 JDK 패키지 선정에 대해 너무 걱정하지 않아도 괜찮다.

대표적인 Java Pakage에는 아래와 같은 것들이 있다.

#### Java SE(Java Standard Edition)
: 가장 기본이 되는 표준 에디션의 자바 플랫폼으로 자바 언어의 핵심 기능을 제공

- 가장 기본적인 클래스 패키지로 구성
- PC용 어플리케이션, 애플릿개발, 응용프로그램개발, 웹개발, 안드로이드개발
- PC에 설치해서 사용할 수 있는 모든 프로그램 개발에 관련된 것


#### Java EE(Java Enterprise Edition)
: 대규모 기업용 에디션. SE확장판(대형 네트워크환경 프로그램 개발시)

- 자바 빈(JavaBeans)이나 객체 관계 매핑(Object Relational Mapping, ORM) 지원
- 기업환경을 위한 대규모 솔루션 개발, 모바일폰, 셋탑 박스, 차량용 텔레매틱스 시스템 개발
- 명칭 변경 : J2EE -> Java EE -> Jakarta EE(Oracle이 이클립스재단에 Java EE 이관 이후 명칭 변경. `javax.` 에서 `jakarta.`로 패키지명 변경)

#### Java ME(Java Micro Edition)
: 피쳐폰, PDA폰, 셉톱박스, 프린터와 같은 작은 임베디드 기기들 같은 작은 기기를 다루는데 이용하는 에디션

- JAVA SE를 줄여 라이트하게 만든 것이므로 SE개발을 할 줄 알면 ME기반의 개발도 가능
- 각각의 OS(ex. Android OS, IOS, Black Berry 등)를 가지고 있는 스마트 폰이 대중화된 지금은 잘 쓰이지 않는다


#### JavaFX
: 가볍고 예쁜 그래픽 사용자 인터페이스(GUI)를 제공하는 에디션

- 고성능의 하드웨어 그래픽 가속과 미디어 엔진 API를 제공해주어서 프로그램의 성능에 신경을 써야하는 분야에서 사용


### JDK 종류
---
Oracle에서는 Java의 버전들을 만들 뿐 아니라 이를 개발할 때 사용하는 JDK도 출시한다.
Oracle에서 출시하는 JDK에는 두 종류가 있는데 상업적으로 사용하는 유료 'Oracle JDK' 와 무료 오픈소스 버전인 'Open JDK' 이다.

당연하게도 유료인 Oracle JDK가 보다 많은 기능과 좋은 성능을 갖추고 있지만 무료인 Open JDK도 개인이나 소규모 기업에서 사용하기에는 충분한 안정성을 갖고 있다고 한다.
> Oracle JDK에는 NFTC(No-Fee Terms and Conditions) 라이센스가 적용되어 회사에서는 사용할 수 없다. (따로 구매해야함.) 
> 참고 : [Oracle No-Fee Terms and Conditions (NFTC)](https://www.oracle.com/downloads/licenses/no-fee-license.html)

JDK는 Oracle에서만 만드는 것이 아니라 Microsoft, IBM, Red Hat, Amazon, Eclipse 등에서 무료 또는 유료로 만들어서 배포하고 있다.

즉, Java란 언어와 그 표준은 Oracle에서 관리하지만, Java로 소프트웨어를 개발하고 실행하는 JDK는 여러 곳에서 다양한 제품들이 만들어져 출시된다. JDK도 결국 소프트웨어 제품이기 때문이다.

![JVM](/assets/img/posts/2024-02-25-22-40-18.png)
> 이 그림은 JVM으로 설명하고 있지만, JDK도 같은 구성도를 가지기 때문에 가져왔다.  
> 출처 : [https://catch-me-java.tistory.com/11](https://catch-me-java.tistory.com/11)

[https://whichjdk.com/](https://whichjdk.com/) 에서 각각의 특성과 권장 용도를 확인할 수 있다. 각 JDK는 기본적으로 기능 자체는 동일하나 성능과 비용에 약간의 차이가 있을 수 있다.  
예를 들어 Amazon의 Corretto JDK는 자사에서 제공하는 AWS 환경에서 동작하는데 최적화되어 있다. 어떤 용도로, 어느 규모의 조직이나 회사에서 사용하느냐에 따라 알맞은 JDK를 다운받아서 사용하면 된다.


- 각 Vendor별 JDK에 대한 간단한 비교는 아래 표를 참고

| Provider           | Free Builds from Source | Free Binary Distributions | Extended Updates | Commercial Support | Permissive License | Website                                             |
|--------------------|-------------------------|---------------------------|------------------|-------------------|--------------------|-----------------------------------------------------|
| AdoptOpenJDK       | Yes                     | Yes                       | Yes              | No                | Yes                | [adoptopenjdk.net](https://adoptopenjdk.net)       |
| Amazon – Corretto  | Yes                     | Yes                       | Yes              | No                | Yes                | [aws.amazon.com/corretto](https://aws.amazon.com/corretto) |
| Azul Zulu          | No                      | Yes                       | Yes              | Yes               | Yes                | [azul.com/downloads/zulu/](https://www.azul.com/downloads/zulu/) |
| BellSoft Liberica  | No                      | Yes                       | Yes              | Yes               | Yes                | [bell-sw.com/java.html](https://bell-sw.com/java.html) |
| IBM                | No                      | No                        | Yes              | Yes               | Yes                | [ibm.com/developerworks/java/jdk](https://www.ibm.com/developerworks/java/jdk) |
| jClarity           | No                      | No                        | Yes              | Yes               | Yes                | [jclarity.com/adoptopenjdk-support/](https://www.jclarity.com/adoptopenjdk-support/) |
| OpenJDK            | Yes                     | Yes                       | Yes              | No                | Yes                | [adoptopenjdk.net/upstream.html](https://adoptopenjdk.net/upstream.html) |
| Oracle JDK         | No                      | Yes                       | No**             | Yes               | No                 | [oracle.com/technetwork/java/javase/downloads](https://www.oracle.com/technetwork/java/javase/downloads) |
| Oracle OpenJDK     | Yes                     | Yes                       | No               | No                | Yes                | [jdk.java.net](https://jdk.java.net)               |
| ojdkbuild          | Yes                     | Yes                       | No               | No                | Yes                | [github.com/ojdkbuild/ojdkbuild](https://github.com/ojdkbuild/ojdkbuild) |
| RedHat             | Yes                     | Yes                       | Yes              | Yes               | Yes                | [developers.redhat.com/products/openjdk/overview](https://developers.redhat.com/products/openjdk/overview) |
| SapMachine         | Yes                     | Yes                       | Yes              | Yes               | Yes                | [sap.github.io/SapMachine](https://sap.github.io/SapMachine) |

> 출처 : [stackoverflow - difference-between-openjdk-and-adoptium-adoptopenjdk](https://stackoverflow.com/questions/52431764/difference-between-openjdk-and-adoptium-adoptopenjdk)



### JDK 디렉토리 구성 요소
---
JAVA_HOME : Java(JDK)가 설치된 Directory. 이 디렉토리의 /bin 폴더안에 Java.exe, Javac.exe 등이 있다.

#### JAVA_HOME 안에 들어있는 대표적인 디렉토리
- bin : 자바 개발, 실행에 필요한 도구와 유틸리티 명령
- include : 네이티브 코드 프로그래밍에 필요하는 C언어 헤더 파일
- lib : 실행 시간에 필요한 라이브러리 클래스들

#### bin 디렉토리에 들어있는 대표적인 개발 프로그램
- javac : 자바 컴파일러로 자바 소스를 바이트 코드로 컴파일
- java : 자바 인터프리터. 컴파일러가 생성한 바이트 코드를 해석하고 실행
- javadoc : 자바 소스로부터 HTML 형식의 API 도큐먼트 생성
- jar : 자바 클래스 파일을 압축한 자바 아카이브 파일(.jar) 생성, 관리하는 압축 프로그램 (zip 같은거라 생각하면 된다)
- jmod : 자바의 모듈 파일(.jmd)을 만들거나 모듈 파일의 내용 출력
- jlink : 응용프로그램에 맞춘 맞춤형 JRE 생성
- jdb : 자바 응용프로그램의 실행 중 오류를 찾는 데 사용하는 디버거
- javap : 역어셈블러. 컴파일된 클래스 파일을 원래의 소스로 변환


## JRE (Java Runtime Environment)
---
JRE는 자바 실행환경(Java Runtime Environment)의 약자로서, **JVM과 자바 프로그램을 실행(동작)시킬 때 필요한 라이브러리 API[^3]를 함께 묶어서 배포되는 패키지** 이다. 이외에도 자바 런타임 환경에서 사용하는 프로퍼티 세팅이나 리소스 파일(jar 파일)을 가지고 있다.

[^3]: 이 표준 라이브러리는 산술기능, 출력기능, 통신기능 등 널리 사용되는 다양한 기초, 필수 기능들을 직접 구현하지 않아도 되도록 미리 작성된 코드들을 말한다. (ex. System.out.println)

JRE는 단지 자바 프로그램을 구동하기 위한 독립형 구성요소로써 사용될 수도 있지만, 동시에 JDK의 일부이기도 하다. 자바 프로그램을 구동하는 것이 자바 프로그램 개발의 일환이기 때문에 JDK는 JRE를 필요로 한다.

과거에는 Java를 실행만 할 컴퓨터(ex. 서버)에는 JRE만 설치해서 사용했다. 하지만 JDK11 버전부터는 JRE를 따로 제공하지 않고 이를 포함하는 JDK 전체를 다운받도록 하고 있다.
즉, JRE와 JDK의 경계가 이제는 사실 모호해졌다고봐도 무방하다.


## JVM(Java Virtual Machine)
---
Java는 기본적으로 **'어떠한 운영체제에서도 실행될 수 있다.'** 라는 강력한 장점을 갖고 있다. 그럴 수 있는 이유는 JVM의 존재 때문이다.

Java는 JVM 위에서 실행되기 때문이다.

![JVM이 실행하는 과정](/assets/img/posts/2024-02-25-22-35-37.png)

기본적인 Java 프로그램의 실행 순서를 설명하면 다음과 같다.

`.java` (프로그래머에 의해 코딩되어진 소스코드) -> 컴파일(javac.exe 컴파일러에 의해 변환)  
-> `.class`(바이트코드) -> 클래스 로더에 의해 로딩 -> JVM에서 바이너리 코드로 변환 -> 실행

> - `.java` => 사람이 코딩하기 위한 언어로된 파일
> - `.class` => 0 또는 1로 해석된 JVM이 알아들을 수 있는 파일 (바이트 코드 형태. 이 파일은 플랫폼에 의존하지 않는 중간 형태의 파일)

컴퓨터는 그 종류마다 쓰는 기계 언어가 다르다. C언어로 짠 코드를 윈도우 용으로 컴파일하게 되면, 맥이나 리눅스에서는 돌리지 못한다. 
따라서 기존의 C언어는 각 OS마다 컴파일을 따로 해주어야했다.

하지만 Java는 OS 이전에 JVM이라는 가상머신을 만듦으로써, 
자바를 실행'할' 컴퓨터 및 기기에 이 JVM을 설치해서 해당 OS에 맞는 바이너리 코드(기계어)로 변환이 가능하기 때문에, 기존에 '프로그램을 실행하는 OS에 맞춰 컴파일하던 것'에 대해 전혀 신경쓰지 않아도 된다.[^4]

[^4]: 단, 간과하지 말아야 할 점은 자바 프로그램과는 달리 자바 가상 머신(JVM)은 운영체제에 종속적이므로, 각 운영체제에 맞는 자바 가상 머신을 설치해야 한다는 점이다. 어쩌면 사용자 입장에선 C로 작성된 프로그램이든, JAVA로 작성된 프로그램이든 똑같이 운영체제에서 프로그램을 구동하기 위해선 머신을 설치해야 한다는 점에서 별 차이가 없게 느껴질수도 있다. 하지만 개발자 입장에선 윈도우용 C 코드와 리눅스용 C 코드로 작성된 프로그램을 각기 만들어야 하고 또 이들을 각기 유지보수해야 되는 불편함을, JAVA는 한번만 작성되면 각 OS에 맞는 JVM만 잘 설치해주면 구동되기에 효율성과 생산성이 높아진다는 큰 장점을 가지게 된다.

이 부분에 대한 전체 과정을 순서대로 작성하면 아래와 같다.

1. 작성된 코드를 Java 바이트 코드로 변환해둔다.(javac.exe)
2. 실행하려는 쪽에서 자신에게 맞는(OS) JVM을 설치한다.
3. JVM이 바이트코드를 해당 OS에 맞는 실행 언어(바이너리 코드)로 변환해준다.(java.exe)
4. 이상없이 실행 가능.

> - 바이너리 코드 : 컴퓨터가 인식할 수 있는 0과 1로 구성된 이진 코드를 의미한다.
> - 바이트 코드 : 가상 머신이 이해할 수 있는 0과 1로 구성된 이진 코드를 의미한다. 바이트 코드는 다시 실시간 번역기 또는 JIT(Just-In-Time) 컴파일러에 의해 바이너리 코드로 변환된다.

이러한 JVM은 코틀린, 스칼라, 그루비, Clojure 등에서도 사용가능하다. (즉, 이 언어들도 자바 바이트코드로 컴파일되도록 만들어졌다.)

안드로이드 앱을 만들거나 스프링부트로 서버를 프로그래밍할 때 자바 외에 코틀린도 사용 가능한 이유가 바로 여기에 있다. 

### JVM 방식의 단점
---
컴파일러가 소스 코드를 바로 기계어로 변환해두는 경우, 기계 상에서 실행될 때 매우 효율적으로 실행될 수 있다.
이는 게임이나 임베디드에서 아직 C계열 언어를 사용하는 이유이기도 하다.[^5]

[^5]: 그러나 이는 특정 기계나 운영 체제에 종속되므로 이식성이 낮다는 말과 같다. 따라서 게임이나 임베디드 시스템과 같이 '특정 환경에서 최적의 성능을 요구하는 경우'에 주로 사용한다는 점을 알아두자.

하지만 자바는 소스 코드를 바이트코드로 컴파일한 후, JVM에서 바이트코드를 **인터프리팅 하는 방식을 사용**한다.
인터프리팅 방식은 프로그램이 실행될 때마다 바이트코드를 해석하여 실행하기 때문에 실행 시간이 길어지고, 이는 일반적으로 컴파일러를 통해 바이너리 코드로 미리 변환되어 있는 일반 프로그램과 비교했을 때 느린 실행 속도를 가져온다.

이러한 문제를 개선하기 위해 나온 것이 JIT 컴파일러다. 초기의 JVM에서는 인터프리터 방식만을 사용했지만, 이후 JIT 컴파일러를 추가해서 필요한 부분만을 기계어로 바꾸어 줌으로써 성능을 개선했다.

![JVM 방식의 단점](/assets/img/posts/2024-02-25-22-47-01.png)
> 출처 : [https://www.youtube.com/watch?v=MmIxahj9vnY](https://www.youtube.com/watch?v=MmIxahj9vnY)


## JIT (Just-In-Time) 컴파일러 
---

JVM은 처음에는 Java 프로그램의 바이트 코드를 인터프리터를 통해 한 줄씩 해석하고 실행한다. 이는 초기에는 빠르게 시작할 수 있지만, 반복적으로 실행되는 코드의 경우에는 성능이 낮을 수 있다.

반복적으로 실행되는 코드를 인식하면, JIT 컴파일러는 해당 코드를 네이티브 코드(기계어)로 변환하여 캐싱한다. 이후에는 같은 코드를 반복 실행할 때마다 인터프리터를 통해 실행하는 대신, 캐싱된 네이티브 코드를 직접 실행하여 성능을 향상시킨다.

따라서, JIT 컴파일러는 인터프리터의 성능을 보완하는 역할을 한다고 보면 된다. 인터프리터와 JIT 컴파일러는 함께 동작하여 Java 프로그램의 실행을 최적화한다.

![JIT 동작방식1](/assets/img/posts/2024-02-25-22-56-29.png)

![JIT 동작방식2](/assets/img/posts/2024-02-25-22-56-49.png)

JIT 컴파일은 코드가 실행되는 과정에 실시간으로 일어나며(그래서 Just-In-Time이다), 전체 코드의 필요한 부분만 변환한다. 기계어로 변환된 코드는 캐시에 저장되기 때문에 재사용 시 컴파일을 다시 할 필요가 없다.[^6]

[^6]: JIT 컴파일러가 컴파일하는 조건은 '얼마나 자주 코드가 실행됐는가' 이다. 일정한 횟수만큼 실행되고 나면 컴파일 임계치에 도달하고 컴파일러는 컴파일하기에 충분한 정보가 쌓였다고 생각한다. 임계치는 메서드가 호출된 횟수, 메서드의 루프를 빠져나오기까지 돈 횟수 두 개를 기반으로 한다. 이 두 수의 합계를 확인하고 메서드가 컴파일될 자격이 있는지 여부를 결정한다. 자격이 있다면 메서드는 컴파일되기 위해 큐에서 대기한다. 이후 메서드들은 컴파일 스레드에 의해 컴파일된다. 아주 오랫동안 돌아가는 루프 문의 카운터가 임계치를 넘어가면 해당 루프는 컴파일 대상이 된다. JVM은 루프를 위한 코드의 컴파일이 끝나면 루프가 다시 반복될 때는 코드를 컴파일된 코드로 교체하고 더 빠르게 실행된다. 이 교체 과정을 "스택 상의 교체(on-stack replacement, ORS)"라고 부른다.


## (막간 상식) Compiled(번역) vs Interpreted(통역)
---
컴파일이란 정확하게는 프로그래밍 언어로 작성된 소스 코드를 컴퓨터가 이해할 수 있는 기계어로 번역하는 과정을 말한다.
인터프리팅 과정에서도 소스 코드를 컴퓨터가 이해할 수 있는 기계어로 변환하는 과정이 일어나지만, 컴파일과는 다른 방식의 번역 프로세스를 따르므로 일반적으로는 컴파일된다고 말하지 않는다.

따라서 통상적으로 컴파일과 인터프리팅은 아래와 같은 특징으로 나누어 분류하고 있다.

**번역 : Compiled**

- 프로그래밍 언어로 코드를 짜고 나서 프로그램이 실행되기 전 미리 컴퓨터가 읽을 수 있는 언어로 번역 작업을 해두는 것을 의미
- 컴파일 시, 소스 코드를 '한꺼번에' 컴퓨터가 읽을 수 있는 Native Machine Code(기계어)로 변환
- 번역 과정이 번거롭긴 하지만, 이 과정에서 오류를 발견할 수 있고 컴퓨터가 그대로 읽을 수 있으므로 실행속도가 빠르다.
- C, C++, Java[^7] 등이 해당

[^7]: Java는 엄밀히 말하면 반쪽짜리 컴파일 언어이자 인터프리터 언어이다. 그 이유는 소스코드를 바이트 코드로 컴파일한 후 JVM에서 인터프리터 방식으로 바이너리 코드로 변환하기 때문이다.

**통역 : Interpreted**
- 사람이 작성한 언어(프로그래밍 언어) 그대로 컴퓨터에게 건네준 뒤, 통역을 해주는 인터프리터가 실시간으로 해당 코드를 컴퓨터에게 읽어주면서(바이너리 코드로 변환) 실행하는 것.
- 소스 코드 빌드 시에는 별도의 변환을 하지않고, '런타임 시에' 한줄 한줄 읽어가며 변환
- 전체 코드를 미리 읽지 않으므로 개발 시 실행하기 간편하지만 오류에 더 취약하다. 또한 실행 속도도 상대적으로 느리다.
- Javascript 등이 해당


## : Reference
---
- [Oracle - Java Archive](https://www.oracle.com/kr/java/technologies/downloads/archive/#JavaSE)
- [위키백과 - 자바 버전 역사](https://ko.wikipedia.org/wiki/%EC%9E%90%EB%B0%94_%EB%B2%84%EC%A0%84_%EC%97%AD%EC%82%AC)
- [위키백과 - 자바 개발 키트](https://ko.wikipedia.org/wiki/%EC%9E%90%EB%B0%94_%EA%B0%9C%EB%B0%9C_%ED%82%A4%ED%8A%B8)
- [위키백과 - JIT 컴파일러](https://ko.wikipedia.org/wiki/JIT_%EC%BB%B4%ED%8C%8C%EC%9D%BC)
- [whichjdk.com](https://whichjdk.com/ko/)
- [Inpa Dev - JDK, JRE, JVM 개념 & 구성 원리](https://inpa.tistory.com/entry/JAVA-%E2%98%95-JDK-JRE-JVM-%EA%B0%9C%EB%85%90-%EA%B5%AC%EC%84%B1-%EC%9B%90%EB%A6%AC-%F0%9F%92%AF-%EC%99%84%EB%B2%BD-%EC%B4%9D%EC%A0%95%EB%A6%AC)
- [얄팍한 코딩사전 - 자바를 알아보자 (+ JVM, JRE, JDK의 정체)](https://www.youtube.com/watch?v=OxvtGYvVkRU)
- [기술노트with 알렉 - JDK, JRE, JVM](https://www.youtube.com/watch?v=x4XDInEA8Xk)
- [hyeinisfree - JIT 컴파일러란?](https://hyeinisfree.tistory.com/26)
- [maru's 원자적 사고 - JVM과 JIT 컴파일러](https://catch-me-java.tistory.com/11)