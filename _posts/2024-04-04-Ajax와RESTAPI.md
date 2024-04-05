---
title: Ajax, RESTful API, Axios (작성중)
date: 2024-04-04 14:38:22 +09:00
categories:
  - 언어
  - JavaScript
tags:
  - JavaScript
  - Ajax
  - RESTful API
  - Axios
  - fetch
---

## 공부하게 된 배경
---

JavaScript에서 서버와 통신하기 위해 Ajax 방식을 사용한다.

이는 우리가 흔히 알고 있는 REST API와 어떻게 다른지 정확히 알아보고자 한다.

이와 더불어 Axios에 대해서도 같이 공부하려 한다.

## 다루는 내용
---

- Ajax
- 비동기
- RESTful API
- Axios
- fetch

## AJAX 란?
---

- **Asynchronous Javascript And Xml(비동기식 자바스크립트와 xml)**의 약자
- 자바스크립트를 이용해 서버와 브라우저가 비동기 방식으로 데이터를 교환할 수 있는 통신 기능
- 브라우저가 가지고 있는 `XMLHttpRequest` 객체를 이용해서 전체 페이지를 새로 고치지 않고 페이지의 일부만을 위한 데이터 로드하는 기법

즉, **자바스크립트를 통해서 서버에 데이터를 비동기 방식으로 요청하는 것**

### 비동기(async)방식이란?
![](/assets/img/posts/2024-04-05-23-44-20.png)

비동기 방식은 웹페이지를 리로드하지 않고 데이터를 불러오는 방식이다.

페이지 리로드의 경우 전체 리소스를 다시 불러와야 하므로 이미지, 스크립트, 기타 코드 등을 모두 재요청하여 불필요한 리소스 낭비가 발생하게 된다.

비동기 방식을 이용할 경우 필요한 리소스만 불러와 사용할 수 있다는 장점이 있다.



### Ajax의 장단점

**Ajax의 장점**

1. 웹페이지의 속도 향상
2. 서버의 처리가 완료 될 때까지 **기다리지 않고 처리 가능**하다.
3. 서버에서 Data만 전송하면 되므로 전체적인 코딩의 양이 줄어든다.
4. 기존 웹에서는 불가능했던 다양한 UI를 가능하게 해준다. 
   (사진 공유 사이트 Flickr의 경우 사진의 제목이나 태그를 **페이지 리로드 없이 수정**할 수 있다.)


**Ajax 의 단점**

1. 연속으로 데이터를 요청하면 서버 부하가 증가할 수 있다.
2. XMLHttpRequest를 통해 통신을 하는 경우 사용자에게 아무런 진행 정보가 주어지지 않는다.


### AJAX의 진행 과정
1. XMLHttpRequest Object를 만든다.
    - request를 보낼 준비를 브라우저에게 시키는 과정
    - 이것을 위해서 필요한 method를 갖춘 object가 필요함
2. callback 함수를 만든다.
    - 서버에서 response가 왔을 때 실행시키는 함수
    - HTML 페이지를 업데이트 함
3. Open a request
    - 서버에서 response가 왔을 때 실행시키는 함수
    - HTML 페이지를 업데이트 함
4. send the request

**Ajax 요청 예시**

```javascript
const requestURL = 'http://localhost:8000/api/v1/polls/';
const button = document.getElementById('button');
button.addEventListener('click', getData);

function getData() {
	const xhr = new XMLHttpRequest();
	// 요청을 초기화
	xhr.open('GET', requestURL);
	xhr.onload = () => {
		console.log(xhr.response);
	};
	// 서버에 요청을 보냄
	xhr.send();
}
```


### jquery ajax

jquery ajax의 기본적인 문법

- **url** : 요청 url을 의미
- **type** : 데이터 전송 방식. `GET` 또는 `POST`
- **cache** : 요청 페이지의 캐시 여부. **false 또는 true**
- **datatype** : 서버에서 받아올 데이터를 어떤 형태로 해석할 것인지. **xml, json, html, script**를 선택
- **data** : **서버로 데이터를 전송할 때 사용**. "name="+name 이런 형태로
- **success** : Ajax 통신에 **성공했을 때 실행되는 이벤트.**
- **error** : Ajax 통신에 **실패했을 때 실행되는 이벤트**. request, status, error로 에러 정보를 확인할 수 있다.

- 기본 예시

    ```javascript
    $.ajax({ 
        url: "", 
        type: "", 
        cache: , 
        dataType: "", 
        data: "", 
        success: function(data){
        }, 
        error: function (request, status, error){ 
        } 
    });
    ```


**jquery 사용해 ajax 요청 예시**

```javascript
const requestURL = 'http://localhost:8000/api/v1/polls/';
const button = document.getElementById('button');
button.addEventListener('click', getData);

// jQuery의 .get 메소드 사용
$.ajax({
    url: requestURL,
    type: 'GET',
    success: function onData (data) {
        console.log(data);
    },
    error: function onError (error) {
        console.error(error);
    }
});
```


## : Reference
---
- [https://velog.io/@surim014/AJAX란-무엇인가](https://velog.io/@surim014/AJAX%EB%9E%80-%EB%AC%B4%EC%97%87%EC%9D%B8%EA%B0%80)
- [https://inpa.tistory.com/entry/AXIOS-📚-설치-사용](https://inpa.tistory.com/entry/AXIOS-%F0%9F%93%9A-%EC%84%A4%EC%B9%98-%EC%82%AC%EC%9A%A9)
- [https://velog.io/@kysung95/개발상식-Ajax와-Axios-그리고-fetch](https://velog.io/@kysung95/%EA%B0%9C%EB%B0%9C%EC%83%81%EC%8B%9D-Ajax%EC%99%80-Axios-%EA%B7%B8%EB%A6%AC%EA%B3%A0-fetch)
- https://gmlwjd9405.github.io/2018/09/21/rest-and-restful.html