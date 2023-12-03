---
title: Integer.parseInt() vs Integer.valueOf()
date: 2023-12-03 22:00:22 +09:00
categories:
  - 언어
  - Java
tags:
  - Java
  - Integer클래스
---

## 이 글에서 다루는 내용
- Integer.parseInt() vs Integer.valueOf()
- 기본형 타입과 참조형 타입
- Wrapper 클래스


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
> JDK 1.5 에서 `Autoboxing and Unboxing in Java` 가 도입된 이후로 차이는 거의 없을 거라고 관련자료에서 말하고 있으며, 또한 이 두 메소드는 대부분의 기본 숫자 데이터타입 래퍼 클래스들인 Integer, Long, Double, Float 등과 같은 클래스 안에 포함되어 있을 거라고한다. 

```
The parseXXX() method and valueOf() is almost present in most of the numeric primitive datatypes wrapper class, such as Integer, Long, Double, Float, etc.
```

따라서 두 메소드 중에 어느 것을 사용할지는 사용의 용도에 맞게 사용하면 되겠다.  
예를 들어 기본 int 가 필요하면 parseInt() , Integer 래퍼 객체가 필요하면 valueOf() 를 사용하면 된다.

```
There is always a confusion whether to use parseInt() or valueOf() method, the best option would be if we need the primitive int datatype then we can go for parseInt() method. If you want Wrapper Integer object then go for valueOf() method
```
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
즉, 메모리의 힙(heap)에 실제 값을 저장하고, 참조값(주소값)을 갖는 변수는 스택(stack)에 저장하게 되며, 참조형 변수는 `null`로 초기화 시킬 수 있다.

[^2]: 8가지 기본형 타입들을 제외한 모든 타입들은 참조형 타입이다. 기본적으로 제공하는 클래스, 프로그래머가 스스로 만든 클래스, 배열, 열거 타입 등이 있다.

### Wrapper 클래스

따라서 기본형과 참조형의 성격이 꽤나 다르기 때문에, 프로그래밍을 하다보면 데이터를 **객체**로 표현해야하는 경우가 종종 생기게 된다.

> 예를 들어 메소드의 인수로 객체 타입만이 요구되면, 기본 타입의 데이터를 그대로 사용할 수 없기 때문에 어떠한 변환 작업이 필요해진다.<br/>
> 또한 멀티스레드 환경에서 동기화 데이터를 사용해야할 경우 이를 객체화 해야할 필요성이 생긴다.

이럴 때에 기본 타입(primitive type)을 객체로 다루기 위해서 사용하는 클래스들을 **래퍼 클래스(wrapper class)**라고 한다.  
말 그대로 기본 타입의 값을 내부에 두고, 객체로 만들기 위해 감싼다 혹은 포장(Wrapping)한다고 생각하면 된다.[^3]  

[^3]: 자바는 모든 기본타입(primitive type)은 값을 갖는 객체를 생성할 수 있고, 포장된 물건을 바꿀수 없듯이, 래퍼 클래스로 감싸고 있는 기본 타입 값은 외부에서 변경할 수 없다. 
만약 값을 변경하고 싶다면 새로운 포장 객체를 만들어야 한다. 박싱과 언박싱에 대해서 추가로 찾아보면 도움이 될 것이다.


이러한 클래스들을 사용하는 이유는 위의 예시 이외에도 몇 가지가 더 있다.

1. 객체 지향적인 환경에서 사용 가능

Wrapper 클래스는 기본 데이터 타입을 객체로 감싸서 객체 지향적인 환경에서 기능을 확장하고 사용할 수 있게 해준다.

2. 컬렉션 및 제네릭과의 호환성

컬렉션 및 제네릭에서는 객체를 요구하는 경우가 많다.[^4]  
따라서 Wrapper 클래스를 이용하여 기본 데이터 타입을 객체로 변환하여 사용한다.  

[^4]: 자바의 컬렉션의 경우 객체만을 저장할 수 있다. 이러한 이유는 컬렉션의 설계와 자바의 언어적 제약 때문이다. 또한 컬렉션은 객체를 저장하고 다루는 자료 구조를 제공하는데, 자바의 컬렉션은 제네릭을 이용하여 타입 안전성을 보장한다. 이 말은 컬렉션에 저장되는 객체의 타입이 컴파일 시점에서 결정되어야 한다는 것을 의미합니다.


3. Null 값을 표현 가능

기본 데이터 타입은 `null` 값을 가질 수 없다. 그러나 Wrapper 클래스는 객체이므로 `null`을 허용한다.


## : Reference

[Integer.parseInt() vs Integer.valueOf() 차이](https://m.blog.naver.com/sthwin/221000179980)  
[자바 Wrapper 클래스와 Boxing & UnBoxing 총정리](https://inpa.tistory.com/entry/JAVA-%E2%98%95-wrapper-class-Boxing-UnBoxing)  
[JAVA 변수의 기본형 & 참조형 타입 차이 이해하기](https://inpa.tistory.com/entry/JAVA-%E2%98%95-%EB%B3%80%EC%88%98%EC%9D%98-%EA%B8%B0%EB%B3%B8%ED%98%95-%EC%B0%B8%EC%A1%B0%ED%98%95-%ED%83%80%EC%9E%85)


