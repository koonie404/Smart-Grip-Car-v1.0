
# Smart Grip Car

STM32 기반의 스마트 RC카 프로젝트로, UART 통신을 활용한 원격 제어와 초음파·조도 센서를 이용한 환경 인식 기능을 구현한 임베디드 시스템 프로젝트입니다.

---

# 프로젝트 소개

Smart Grip Car는 STM32F103 마이크로컨트롤러 기반으로 제작된 스마트 RC카 프로젝트입니다.

조이스틱을 활용한 실시간 원격 제어와 초음파 센서 및 조도 센서를 활용한 환경 인식 기능을 구현하였으며, UART 통신을 통해 송수신 시스템을 구성하였습니다.

본 프로젝트를 통해 임베디드 제어, MCU 프로그래밍, 센서 데이터 처리, 실시간 제어 로직 및 하드웨어 연동 기술을 학습하고 실제 시스템 구현 경험을 쌓았습니다.

---

# 프로젝트 목적

* STM32F103 기반 MCU 제어 원리 학습
* UART 기반 송수신 통신 구현
* 조이스틱 기반 원격 제어 시스템 구현
* 초음파 센서를 활용한 거리 측정
* 조도 센서를 활용한 환경 인식 기능 구현
* 센서 데이터 기반 실시간 제어 로직 구현
* 임베디드 하드웨어 및 소프트웨어 통합 제어 경험 습득

---

# 개발 환경

## Hardware

* STM32F103
* 초음파 센서
* 조도 센서
* 조이스틱 모듈
* DC Motor
* Motor Driver
* Bluetooth/UART 통신 모듈

## Software

* C Language
* STM32CubeIDE
* UART Communication
* PWM Control
* GPIO Control

---

# 시스템 구조

```text
[Joystick]
     ↓
 UART 통신
     ↓
[STM32F103]
     ↓
Motor Driver 제어
     ↓
DC Motor 동작

센서 입력:
- 초음파 센서
- 조도 센서
```

---

# 주요 기능

## 1. 조이스틱 기반 원격 제어

* 조이스틱 입력값을 UART 통신으로 전송
* 실시간 차량 이동 제어
* 전진 / 후진 / 좌회전 / 우회전 구현

---

## 2. 초음파 센서 기반 거리 측정

* 장애물 거리 측정
* 일정 거리 이하 접근 시 충돌 방지 로직 적용

---

## 3. 조도 센서 기반 환경 인식

* 주변 밝기 측정
* 환경 변화에 따른 동작 제어

---

## 4. PWM 기반 모터 제어

* PWM 신호를 이용한 속도 제어
* 모터 회전 방향 제어

---

# 담당 역할

* STM32 기반 MCU 제어 구현
* UART 송수신 통신 구현
* 센서 데이터 처리 로직 구현
* PWM 모터 제어 구현
* 시스템 디버깅 및 테스트
* 하드웨어 연결 및 통합 테스트

---

# 문제 해결 경험

## UART 통신 안정화

UART 통신 과정에서 데이터 누락 및 입력 지연 문제가 발생하였으며,
통신 속도와 데이터 처리 로직을 수정하여 안정적인 송수신이 가능하도록 개선하였습니다.

---

## 센서 데이터 오차 보정

초음파 센서 측정 과정에서 거리값 오차가 발생하였으며,
반복 측정 및 평균값 처리 방식을 적용하여 측정 안정성을 향상시켰습니다.

---

# 프로젝트 결과

* STM32 기반 임베디드 제어 시스템 구현 완료
* UART 기반 실시간 원격 제어 구현
* 초음파 및 조도 센서 연동 성공
* PWM 기반 모터 제어 구현
* 임베디드 시스템 통합 제어 경험 확보

---

# 기술적 성과

* MCU 제어 및 GPIO 활용 경험
* UART 통신 구현 경험
* PWM 기반 모터 제어 경험
* 센서 데이터 처리 경험
* 임베디드 시스템 디버깅 경험
* 하드웨어·소프트웨어 통합 제어 경험

---

# 프로젝트 사진 및 시연 영상

## 프로젝트 사진

<img width="500" alt="KakaoTalk_20260130_102116478_01" src="https://github.com/user-attachments/assets/db2f03e8-db1f-4624-aea5-6c8bbdd3994e" />

<img width="500" alt="KakaoTalk_20260324_102254142_01" src="https://github.com/user-attachments/assets/d27daded-d00e-44e1-ac68-9632e67e192d" />

## 시연 영상

- [RC카 주행 영상]https://github.com/user-attachments/assets/bd490959-5aa7-4c3c-83e8-b82d0b823698

- [센서 및 제어 시연 영상]https://github.com/user-attachments/assets/37e4f377-a42b-440f-a023-9bb9e8f8d4ec

---

# 향후 개선 방향

* ROS2 기반 시스템 확장
* 카메라 기반 영상 처리 기능 추가
* 자율주행 알고리즘 적용
* 장애물 회피 기능 고도화
* Bluetooth 통신 최적화

---

# 느낀 점

본 프로젝트를 통해 단순 코드 작성이 아닌,
하드웨어와 소프트웨어가 실제로 연결되어 동작하는 임베디드 시스템의 구조를 이해할 수 있었습니다.

또한 UART 통신, 센서 처리, PWM 제어 및 디버깅 과정을 경험하며
실제 자동화 및 제어 시스템 개발 역량을 키울 수 있었습니다.

---

# 사용 기술 요약

| 분야               | 기술            |
| ---------------- | ------------- |
| MCU              | STM32F103     |
| Language         | C             |
| Communication    | UART          |
| Control          | PWM, GPIO     |
| Sensor           | 초음파 센서, 조도 센서 |
| Development Tool | STM32CubeIDE  |

---

# GitHub Repository Structure

```text
Smart-Grip-Car/
 ┣ README.md
 ┣ Core/
 ┣ Drivers/
 ┣ images/
 ┣ videos/
 ┗ docs/
```
