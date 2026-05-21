# Smart Grip Car

STM32 기반 UART 통신 및 센서 제어를 활용한 Smart RC Car 프로젝트

<p align="center">
  <img width="400" alt="Smart Grip Car Main" src="https://github.com/user-attachments/assets/f23a325c-8e20-4b4a-86e5-423071622102" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCU-STM32-blue" />
  <img src="https://img.shields.io/badge/Language-C-orange" />
  <img src="https://img.shields.io/badge/UART-Communication-green" />
  <img src="https://img.shields.io/badge/PWM-MotorControl-red" />
  <img src="https://img.shields.io/badge/Sensor-Ultrasonic-yellow" />
  <img src="https://img.shields.io/badge/IDE-STM32CubeIDE-lightgrey" />
</p>

---

# 📌 Project Overview

Smart Grip Car는 STM32F103 기반의 스마트 RC Car 프로젝트입니다.

조이스틱 입력값을 UART 통신으로 전달하여 차량을 실시간으로 제어하고,  
초음파 센서와 조도 센서를 활용하여 주변 환경을 인식하도록 구현하였습니다.

본 프로젝트를 통해 MCU 제어, UART 통신, PWM 제어, 센서 데이터 처리 및 디버깅 경험을 학습하였으며,  
하드웨어와 소프트웨어가 연동되는 임베디드 시스템 구조를 이해할 수 있었습니다.

---

# 🚀 Main Features

- UART 기반 실시간 원격 제어
- PWM 기반 DC Motor 속도 제어
- 초음파 센서 기반 거리 측정
- 조도 센서 기반 환경 인식
- GPIO 제어
- STM32 기반 MCU 제어 시스템 구현

---

# 🛠 System Architecture

<p align="center">
  <img width="650" alt="System Architecture" src="https://github.com/user-attachments/assets/d62af670-b893-4f67-83b0-0959d6d57c99" />
</p>

---

# 📷 Project Images

<p align="center">
  <img width="450" alt="Project Image 1" src="https://github.com/user-attachments/assets/db2f03e8-db1f-4624-aea5-6c8bbdd3994e" />
  <img width="450" alt="Project Image 2" src="https://github.com/user-attachments/assets/d27daded-d00e-44e1-ac68-9632e67e192d" />
</p>

---

# 🎥 Demo Video

- [RC카 주행 영상](https://github.com/user-attachments/assets/bd490959-5aa7-4c3c-83e8-b82d0b823698)

- [센서 및 제어 시연 영상](https://github.com/user-attachments/assets/37e4f377-a42b-440f-a023-9bb9e8f8d4ec)

---

# ⚙ Tech Stack

| Category | Skills |
|---|---|
| MCU | STM32F103 |
| Language | C |
| Communication | UART |
| Control | PWM, GPIO |
| Sensor | Ultrasonic Sensor, CDS Sensor |
| Development Tool | STM32CubeIDE |

---

# 📂 Repository Structure

```text
Smart-Grip-Car/
 ┣ README.md
 ┣ Core/
 ┣ Drivers/
 ┣ images/
 ┣ videos/
 ┗ docs/
```

---

# 👨‍💻 My Role

- STM32 기반 MCU 제어 구현
- UART 송수신 통신 구현
- PWM 기반 모터 제어 구현
- 센서 데이터 처리 로직 구현
- 시스템 디버깅 및 테스트
- 하드웨어 연결 및 통합 테스트

---

# 🔧 Troubleshooting

## UART 통신 데이터 누락 문제

UART 송수신 과정에서 데이터 손실 및 입력 지연 문제가 발생하였습니다.

통신 속도와 데이터 처리 로직을 수정하여 안정적인 송수신이 가능하도록 개선하였습니다.

---

## 초음파 센서 거리 측정 오차 문제

초음파 센서 측정 과정에서 거리값 오차가 발생하였습니다.

반복 측정 및 평균값 처리 방식을 적용하여 측정 안정성을 향상시켰습니다.

---

# 📈 Future Improvements

- ROS2 기반 시스템 확장
- 카메라 기반 영상 처리 기능 추가
- 자율주행 알고리즘 적용
- 장애물 회피 기능 고도화
- Bluetooth 통신 최적화

---

# 📚 What I Learned

본 프로젝트를 통해 단순 코드 작성이 아닌,  
하드웨어와 소프트웨어가 실제로 연결되어 동작하는 임베디드 시스템 구조를 이해할 수 있었습니다.

또한 UART 통신, PWM 제어, 센서 데이터 처리 및 디버깅 과정을 경험하며  
실제 자동화 및 제어 시스템 개발 역량을 키울 수 있었습니다.

---

# ✅ Project Results

- STM32 기반 임베디드 제어 시스템 구현 완료
- UART 기반 실시간 원격 제어 구현
- 초음파 및 조도 센서 연동 성공
- PWM 기반 모터 제어 구현
- 임베디드 시스템 통합 제어 경험 확보
