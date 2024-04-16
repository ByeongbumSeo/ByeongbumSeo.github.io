---
title: Ajax, Axios, fetch
date: 2024-04-04 14:38:22 +09:00
categories:
  - 언어
  - JavaScript
tags:
  - JavaScript
  - Ajax
  - Axios
  - fetch
---

## 공부하게 된 배경
---

JavaScript에서는 서버와 통신하기 위해 흔히 Ajax 방식을 사용하는데, 이 ajax가 정확히 무엇이고 어떻게 동작하는 지에 대해서 정확히 알아보려 한다.

이와 더불어 Axios와 fetch에 대해서도 같이 공부하려 한다.


통신 방법에 대해서 그 맥락을 같이하는 REST API에 대해서도 정확히 알아두면 좋겠다는 생각에 이 포스트와 함께 정리했지만, 이는 JavaScript 기술이 아니므로 별도의 포스트로 정리했다.

[REST API 포스트 보러가기](https://byeongbumseo.github.io/posts/RESTAPI/)

## 다루는 내용
---

- Ajax
- 비동기
- Axios
- fetch

## AJAX 란?
---

- **Asynchronous Javascript And Xml(비동기식 자바스크립트와 xml)**의 약자
- 자바스크립트를 이용해 서버와 브라우저가 비동기 방식으로 데이터를 교환할 수 있는 통신 기능
- 브라우저가 가지고 있는 `XMLHttpRequest` 객체를 이용해서 전체 페이지를 새로 고치지 않고 페이지의 일부만을 위한 데이터 로드하는 기법

즉, **자바스크립트를 통해서 서버에 데이터를 비동기 방식으로 요청하는 것**

### 비동기(async)방식이란?
![비동기](/assets/img/posts/2024-04-05-23-44-20.png)

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

Jquery를 통해 Ajax를 사용하면 코드가 훨씬 직관적이고 간단해진다.

또한 Ajax만을 사용하면 브라우저에 따라 각기 다른 코드를 작성해야 하는 경우가 있는데, Jquery를 사용하면 동일한 코드로 호환성을 보장할 수 있다.


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

## Axios 란?
---

- **Promise based HTTP client for the browser and node.js**
- node.js와 브라우저를 위한 **HTTP 통신 라이브러리**
- 비동기로 HTTP 통신을 가능하게 해주며 return을 promise 객체로 해주기 때문에 response 데이터를 다루기도 쉽다.

```javascript
axios({
  method: 'get',
  url: 'http://localhost:8000/api/v1/polls/',
	baseURL: 
	headers: 
  data: {}
	params: 
});
```

- **method** : 요청방식. (get이 디폴트)
- **url** : 서버 주소
- baseURL : url을 상대경로로 쓸대 url 맨 앞에 붙는 주소.
    - 예를 들어, url이 /post 이고 baseURL이 https://some-domain.com/api/ 이면,https://some-domain.com/api/post로 요청 가게 된다.
- **headers** : 요청 헤더
- **data** : 요청 방식이 'PUT', 'POST', 'PATCH' 해당하는 경우 body에 보내는 데이터
- **params** : URL 파라미터 ( ?key=value 로 요청하는 url get방식을 객체로 표현한 것)


**axios를 사용한 ajax 요청 예시**

```javascript
const requestURL = "http://localhost:8000/api/v1/polls/";

// 1
axios({
    method: "get", // 통신 방식
    url: requestURL, // 서버
}).then(function (response) {
    console.log(response.data);
});


// 2
axios
    .get(requestURL)
    .then(function (response) {
        // 성공했을 때
        console.log(response);
    })
    .catch(function (error) {
        // 에러가 났을 때
        console.log(error);
    })
    .finally(function () {
        // 항상 실행되는 함수
    });

// 3 
// async/await 를 쓰고 싶다면 async 함수/메소드를 만듭니다.
async function getData() {
    try {
        const response = await axios.get(requestURL);
        console.log(response);
    } catch (error) {
        console.error(error);
    }
}
```


## fetch
---

fetch는 **ES6부터 JavaScript의 내장 라이브러리**로 들어왔다.

promise기반으로 만들어졌기에 Axios와 마찬가지로 데이터를 다루는데 어렵지 않으며, 내장 라이브러리라는 장점으로 인해 상당히 편리하다.

**fetch 기본적인 문법**

```javascript
fetch("url", option)
	.then(res => res.text())
	.then(text => console.log(text));
```

- fetch에는 기본적으로 첫번째 인자에 요청할 url이 들어간다.
- 기본적으로 http 메소드 중 `GET`으로 동작한다.
- fetch를 통해 ajax를 호출 시 해당 주소에 요청을 보낸 다음, **응답 객체(Promise object Response)를 받는다.**
- 첫번째 then에서 그 응답을 받게 되고, `res.text()` 메서드로 파싱한 text값을 리턴한다.
- 그 다음 then에서 리턴받은 text 값을 받고, 원하는 처리를 할 수 있게 된다.


**fetch를 사용한 요청 예시**


```javascript
const requestURL = 'http://localhost:8000/api/v1/polls/';

fetch(requestURL)
	.then((response) => response.json())
	.then((data) => console.log(data))

```

응답(response) 객체는 `json()` 메서드를 제공하고, 이 메서드를 호출하면 응답(response) 객체로부터 **JSON 형태의 데이터를 자바스크립트 객체**로 변환하여 얻을 수 있음.



## Axios vs fetch
---

### Axios

**장점**

- response timeout 처리 방법이 존재 (fetch에는 존재하지 않는 기능)
- promise 기반으로 데이터를 다루기가 쉬움
- **크로스 브라우징에 신경을 많이 썼기에 브라우저 호환성이 뛰어나다.**
- XSRF 보호를 해줌
- 자동으로 JSON 데이터 형식으로 변환 해줌

**단점**

- 별도 모듈 설치가 필요

### fetch

**장점**

- 내장 라이브러리이기에 별도의 import를 해줄 필요가 없다.
- promise 기반으로 다루기가 쉽다.
- 내장 라이브러리이므로 사용하는 프레임워크가 안정적이지 않을 때 사용하기 좋다.

**단점**

- internet explorer의 경우에는 **fetch를 지원하지 않는 버전도 존재**한다. (브라우저 호환성이 상대적으로 떨어진다.)
- **기능이 부족하다.**
- `.json()` 메서드를 사용해 변환해야 함


> 따라서, **간단하게 사용할때는 fetch**를 쓰고, 이외의 **확장성을 염두해봤을 땐 axios**를 쓰면 좋다고 보면 된다.




## : Reference
---
- [https://velog.io/@surim014/AJAX란-무엇인가](https://velog.io/@surim014/AJAX%EB%9E%80-%EB%AC%B4%EC%97%87%EC%9D%B8%EA%B0%80)
- [https://inpa.tistory.com/entry/AXIOS-📚-설치-사용](https://inpa.tistory.com/entry/AXIOS-%F0%9F%93%9A-%EC%84%A4%EC%B9%98-%EC%82%AC%EC%9A%A9)
- [https://velog.io/@kysung95/개발상식-Ajax와-Axios-그리고-fetch](https://velog.io/@kysung95/%EA%B0%9C%EB%B0%9C%EC%83%81%EC%8B%9D-Ajax%EC%99%80-Axios-%EA%B7%B8%EB%A6%AC%EA%B3%A0-fetch)