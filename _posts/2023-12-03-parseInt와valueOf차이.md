---
title: Integer.parseInt() vs Integer.valueOf()
date: 2023-12-03 22:00:22 +09:00
categories:
  - 언어
  - Java
tags:
  - Java
  - Wrapper클래스
  - 데이터 타입
  - Boxing & UnBoxing
---

## 이 글에서 다루는 내용
- Integer.parseInt() vs Integer.valueOf()
- 기본형 타입과 참조형 타입
- Wrapper 클래스
- Boxing과 UnBoxing


## 공부하게된 계기
---
Java는 자료형에 대해서 엄격하기 때문에 자료형 변환 메소드를 사용할 일이 많다.  
그 중 대부분의 개발자들이 가장 많이 사용하는 변환은 String -> int(or Integer)의 변환일 것이다.(혹은 이의 역변환)

업무 중 String 값으로 저장되어 있는 숫자를 int형으로 변환하다가, 문득 그동안 (인텔리제이에서 추천해주는대로) 무심코 변환했던 메소드들에 대한 의문이 생겨 정리를 시작하게 되었다.

하나하나 정리하다보니, 질문들이 꼬리를 물어 꽤나 많은 내용들에 대해 학습할 수 있었다.

## (핵심) parseInt 와 valueOf 의 차이점
---
문자열을 정수로 변환해주는 Integer.parseInt() 와 Integer.valueOf() 의 주요 차이점은 아래와 같다.  
> parseInt(): 원시데이터인 int 타입을 반환<br/>
> valueOf(): Integer 래퍼(wrapper)객체를 반환


핵심 내용만 외워서는 별로 도움되는게 없으므로 자세한 설명을 덧붙여본다.



## Integer.parseInt()
---

우선 parseInt() 메소드를 타고 들어가 Integer 클래스에 어떻게 정의되어 있는지 확인해보자.(Java 17 기준)
![parseInt](/assets/img/posts/parseInt메소드.png)

내부적으로 `parseInt(String s, int radix)` 메소드를 호출하고, `int`타입으로 리턴하는 것을 알 수 있다.  
추가로 문자열이 정수가 아닌 경우 NumberFormatException을 던진다.



## Integer.valueOf()
---
위와 동일하게 valueOf() 메소드도 타고 들어가 Integer 클래스에 어떻게 정의되어 있는지 확인해보자.(Java 17 기준)  
![valueOf](/assets/img/posts/valueOf메소드.png)


내부적으로 `parseInt(String s, int radix)` 메소드를 호출하여 문자열을 정수로 변환한 후, 해당 값을 `Integer` 객체로 감싸 반환하는 것을 알 수 있다.  
문자열이 정수가 아닌 경우 NumberFormatException을 던진다.


## parseInt와 valueOf 비교
---
결국 두 메소드는 `Integer`객체로 감싸서 반환하는 것 외에는 별도의 다른 부분이 없는 것을 확인할 수 있다.

관련 자료들을 찾아보면,  
JDK 1.5 에서 `Autoboxing and Unboxing in Java` 가 도입된 이후로 차이는 거의 없을 거라고 관련자료에서 말하고 있으며, 또한 이 두 메소드는 대부분의 기본 숫자 데이터타입 래퍼 클래스들인 Integer, Long, Double, Float 등과 같은 클래스 안에 포함되어 있을 거라고한다. 

> The parseXXX() method and valueOf() is almost present in most of the numeric primitive datatypes wrapper class, such as Integer, Long, Double, Float, etc.


따라서 두 메소드 중 사용자의 용도에 맞게 선택하여 사용하면 되겠다.  
예를 들어 기본 int 가 필요하면 parseInt() , Integer 래퍼 객체가 필요하면 valueOf() 를 사용하면 된다.


>There is always a confusion whether to use parseInt() or valueOf() method, the best option would be if we need the primitive int datatype then we can go for parseInt() method. If you want Wrapper Integer object then go for valueOf() method

> 원문 자료 : https://www.javainterviewpoint.com/difference-parseint-vs-valueof-java/


### parseInt 사용 예시
```java
String str = "123";
int num = Integer.parseInt(str); // num에는 123이 저장됨
```

### valueOf 사용 예시
```java
String str = "456";
Integer value = Integer.valueOf(str); // value에는 Integer 객체가 저장되며 값은 456
```
<br/>

그렇다면 Integer 객체로 감싸서 반환하는 메소드는 왜 있는 것일까? **어떤 경우에 사용할까?** 를 고민해봐야한다.  


## 원시타입이 아닌 Wrapper 클래스를 사용하는 이유
---

우선 변수의 기본형 타입과 참조형 타입에 대해서 제대로 알아야한다.

### 기본형 타입과 참조형 타입

변수(variable)란 데이터(data)를 저장하기 위해 프로그램에 의해 이름을 할당받은 메모리 공간을 의미하고,  
자바에서 말하는 데이터 타입(자료형)이란, 변수에 적재할 데이터가 메모리에 어떻게 저장되고 프로그램에서 어떻게 처리되어야 하는지를 명시적으로 알려주는 키워드이다.

데이터 타입은 크게 기본형 타입과 참조형 타입으로 나뉘어지며, 간단하게 설명하자면 아래와 같다.
1. **기본형(primitive type)** : 계산을 위해 실제 값을 저장한다.
2. **참조형(reference type)** : 객체의 주소를 저장한다. null 또는 객체의 주소(4byte, 0x0 ~ 0xffffffff)를 갖는다.

좀 더 자세히 설명하자면,  

**기본형 타입**은[^1] 비객체로서 기본값이 정해져 있고 `null`값을 가질 수 없다.  
또한 변수의 선언과 동시에 메모리가 생성되고, 이 값들은 메모리의 스택(stack)에 저장되어 실제 자료값을 가진다.

[^1]: 기본형 타입에는 논리형(boolean), 문자형(char), 정수형(byte, short, int, long), 실수형(float, double)이 있다.

반면 **참조형 타입**들은[^2] 자료가 저장된 공간의 주소를 저장하며 이 주소를 참조해서 실제 값들을 가져오게 된다.  
즉, 메모리의 힙(heap)에 실제 값을 저장하고 참조값(주소값)을 갖는 변수는 스택(stack)에 저장하게 되며, 참조형 변수는 `null`로 초기화 시킬 수 있다.

[^2]: 8가지 기본형 타입들을 제외한 모든 타입들은 참조형 타입이다. 기본적으로 제공하는 클래스, 프로그래머가 스스로 만든 클래스, 배열, 열거 타입 등이 있다.

### Wrapper 클래스

따라서 기본형과 참조형의 성격이 꽤나 다르기 때문에, 프로그래밍을 하다보면 데이터를 **객체**로 표현해야하는 경우가 종종 생기게 된다.  

예를 들어
-  메소드의 인수로 객체 타입만이 요구되면, 기본 타입의 데이터를 그대로 사용할 수 없기 때문에 어떠한 변환 작업이 필요해진다.
-  또한 멀티스레드 환경에서 동기화 데이터를 사용해야할 경우 이를 객체화 해야할 필요성이 생긴다.

이런 때에 기본 타입(primitive type)을 객체로 다루기 위해서 사용하는 클래스들을 **래퍼 클래스(Wrapper Class)**라고 한다.  
말 그대로 기본 타입의 값을 내부에 두고, 객체로 만들기 위해 감싼다 혹은 포장(Wrapping)한다고 생각하면 된다.[^3]  

[^3]: 자바의 모든 기본타입은 값을 갖는 객체를 생성할 수 있고, 포장된 물건을 바꿀수 없듯이, 래퍼 클래스로 감싸고 있는 기본 타입 값은 외부에서 변경할 수 없다. 만약 값을 변경하고 싶다면 새로운 포장 객체를 만들어야 한다. 박싱과 언박싱에 대해서 추가로 찾아보면 도움이 될 것이다.


이러한 래퍼 클래스는 여러 상황에서 유용하게 활용되는데, 정리해보자면 아래와 같다.


1. **컬렉션 및 제네릭과의 호환성 확보** <br/>
컬렉션은 객체들을 모아놓은 자료 구조를 다루는데, 일반적으로 **컬렉션에는 객체만 저장**된다.[^4]  
따라서 기본 데이터 타입은 직접 컬렉션에 저장할 수 없으므로, Wrapper 클래스를 사용하여 객체로 래핑한 뒤에 컬렉션에 저장해야 한다.  
제네릭 또한 마찬가지로 객체 타입에 대해서만 동작한다.  
즉, Wrapper 클래스를 이용하여 기본 데이터 타입을 객체로 변환해줌으로써 컬렉션 및 제네릭과 호환성을 확보할 수 있다.   

[^4]: 컬렉션과 제네릭은 객체 지향 프로그래밍의 관점에서 객체를 중심으로 설계되었기 때문에, 기본적으로 객체만을 다루도록 되어 있다.

2. **메소드의 인수로 객체 타입만이 요구되는 경우** <br/>
특정 메소드에서 파라미터로 객체 타입을 요구할 수 있다.  
이때 Wrapper 클래스를 사용하면 기본 데이터 타입을 객체로 감싸 메소드의 요구사항에 부합시킬 수 있다.  

3. **멀티스레드 환경에서 동기화 데이터를 사용해야할 경우** <br/>
한 번 생성된 Wrapper 클래스의 객체는 내부의 상태가 변경되지 않는다.  
즉, Wrapper 클래스는 불변성(Immutable)을 가지고 있으므로 멀티스레드 환경에서 동기화가 필요한 경우에도 Wrapper 클래스를 사용하여 안전하게 데이터를 공유하고 변경할 수 있다.

4. **Null 값을 표현 가능** <br/>
기본 데이터 타입은 `Null`값을 가질 수 없어, 값이 없음을 표현할 수 있는 방법이 없다.  
하지만 Wrapper 클래스를 사용하면 `Null` 값이 허용되어 값이 없음을 나타낼 수 있다.

5. **자료형 변환 메소드** <br/>
객체를 포장하는 기능 외에도, 래퍼 클래스는 자체 지원하는 parse타입() 메소드를 이용하여 데이터 타입을 형 변환 할때도 유용히 쓰인다.
> 자료형 변환 메소드
```java
String str = "10";
String str2 = "10.5";
String str3 = "true";

byte b = Byte.parseByte(str);
int i = Integer.parseInt(str);
short s = Short.parseShort(str);
long l = Long.parseLong(str);
float f = Float.parseFloat(str2);
double d = Double.parseDouble(str2);
boolean bool = Boolean.parseBoolean(str3);
```


그러나 기본 데이터 타입을 래핑해서 사용하는 것이 항상 효율적이지는 않다.  
Wrapper 클래스로 래핑하는 과정에서 생각보다 큰 오버헤드가 발생할 수 있어서 때로는 기본 데이터 타입을 직접 사용하는 것이 더 효율적일 수 있다.

이에 대해서 구체적인 예시를 통해 알아보도록 하자.

## Boxing & Unboxing 과 오버헤드
위에서 래퍼 클래스는 값을 포장하여 객체로 만드는 것이라고 했는데, 만일 값을 더하는 등 변환시켜야 할 필요가 생길 경우 포장을 다시 뜯을 필요가 있다.[^5]  
이러한 행위를 박싱(Boxing) 과 언박싱(UnBoxing) 이라고 한다.

[^5]:래퍼 클래스는 산술 연살을 위해 정의된 클래스가 아니다. 생성된 인스턴스의 값만을 참조할수 있기 때문에 따라서 래퍼 클래스 인스턴스에 저장된 값을 직접 변경이 불가능하다. 그래서 래퍼 클래스를 언박싱 한 뒤에 값을 변경한 뒤 박싱해야 하는 중간 단계를 거칠 필요가 있다.

- **Boxing** : 기본 타입의 데이터 → 래퍼 클래스의 인스턴스로 변환
- **UnBoxing** : 래퍼 클래스의 인스턴스에 저장된 값 → 기본 타입의 데이터로 변환

```java
// 박싱
Integer num = new Integer(20); // Integer 래퍼 클래스 num 에 21 의 값을 저장

// 언박싱 (intValue)
int n = num.intValue(); // 래퍼 클래스 num 의 값을 꺼내 가져온다.

// 재 포장(박싱)
n = n + 100; // 120
num = new Integer(n);
```

다행히도 JDK 1.5 부터는 박싱과 언박싱이 필요한 상황에 자바 컴파일러가 **자동으로 처리**해주기 시작했다. (AutoBoxing & AutoUnBoxing)  
기본타입 값을 직접 박싱, 언박싱하지 않아도 래퍼 클래스 변수에 대입만 하면 자동으로 박싱과 언박싱이 된다.

```java
/* 기존 박싱 & 언박싱 */
Integer num = new Integer(17); // 박싱
int n = num.intValue();        // 언박싱

/* 오토 박싱 & 언박싱 */
Integer num = 17; // new Integer() 생략
int n = num; // intValue() 생략
```
> 이처럼 오토 박싱을 이용하면 new 키워드를 사용하지 않고도 자동으로 인스턴스를 생성할 수 있으며, 언박싱 메소드를 사용하지 않고도, 오토 언박싱을 이용하여 인스턴스에 저장된 값을 바로 참조할 수 있게 된다.

<br/>
우리가 여기서 주목해야할 부분은, **오토 박싱과 오토 언박싱을 인지하고 있지 않다면 추후 생각지 못한 오버헤드가 발생할 수 있다는 것**이다.

### Auto Boxing을 포함한 연산
```java
public static void main(String[] args) {
  long t = System.currentTimeMillis(); // 현재 시간(밀리초)를 저장
  
  Long sum = 0L; // 래퍼 객체로 오토 박싱으로 정수 값을 저장
  
  // 백만번 도는 동안 더하기 연산
  for (long i = 0; i < 1000000; i++) {
  	sum += i;
  }
  
  System.out.println("processing time: " + (System.currentTimeMillis() - t) + " ms") ;
}
```
> processing time: 10 ms


### Auto Boxing을 포함하지 않은 연산 (primitive 타입간 연산)
```java
public static void main(String[] args) {
    long t = System.currentTimeMillis();
    
    long sum = 0L; // 기본형 정수 타입인 long 자료형에 정수 저장
    
    for (long i = 0; i < 1000000; i++) {
        sum += i;
    }
    
    System.out.println("processing time: " + (System.currentTimeMillis() - t) + " ms") ;
}
```
> processing time: 2 ms


위와 같이 총 100만번의 sum 연산을 통해 두 코드의 결과를 비교해 보면, 거의 5배의 결과 차이를 보여준다.

만일 실제 대용량 트래픽이 발생하는 서비스에서는 100만건을 넘어 1000만건, 1억건의 처리가 필요할지도 모르고, **단지 똑같은 자료값을 저장하지만 어떤 타입 방식으로 선언했느냐에 따라** 어플리케이션 성능 차이는 유의미하게 벌어지게 될 것이다.

따라서 기능적 편의성을 위하여 오토 박싱/언박싱을 제공하지만, 다른 타입간의 형 변환은 어플리케이션의 성능에 영향을 미치게 된다는 것을 미리 인지하고 있어야한다. 그리고 비록 사소한 차이 일지라도 반드시 필요한 상황이 아니라면 지양해야 하는 것이 옳다.



결국, 
> Wrapper 클래스를 사용하여 기본 데이터 타입을 객체로 변환하면 객체 지향적인 컨텍스트에서 더 다양한 기능을 활용할 수 있지만, 
> 상황에 따라서는 기본 데이터 타입을 직접 사용하는 것이 더 적합할 수 있기 때문에 사용하는 상황과 성능에 따라 적절한 선택을 해야한다.



## : Reference

[Integer.parseInt() vs Integer.valueOf() 차이](https://m.blog.naver.com/sthwin/221000179980)  
[인파 - 자바 Wrapper 클래스와 Boxing & UnBoxing 총정리](https://inpa.tistory.com/entry/JAVA-%E2%98%95-wrapper-class-Boxing-UnBoxing)  
[인파 - JAVA 변수의 기본형 & 참조형 타입 차이 이해하기](https://inpa.tistory.com/entry/JAVA-%E2%98%95-%EB%B3%80%EC%88%98%EC%9D%98-%EA%B8%B0%EB%B3%B8%ED%98%95-%EC%B0%B8%EC%A1%B0%ED%98%95-%ED%83%80%EC%9E%85)
[TCP SCHOOL 래퍼 클래스(Wrapper class)](https://www.tcpschool.com/java/java_api_wrapper)