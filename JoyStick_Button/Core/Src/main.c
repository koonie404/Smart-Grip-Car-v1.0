/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2025 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include "stm32f1xx_hal.h"
#include <stdio.h>
#include <string.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
#define ADC_BUFFER_SIZE 2
#define FILTER_SIZE 8
#define ADC_MAX_VALUE 4095
#define DEADZONE_THRESHOLD 20

#define DEBOUNCE_MS         50      /* Debounce time in ms */
#define LONG_PRESS_MS       700    /* Long press threshold */
#define DOUBLE_CLICK_MS     500     /* Double click window */

//// 스위치 디바운싱 설정
//#define DEBOUNCE_TIME_MS 200

// 캘리브레이션 샘플 수
#define CALIBRATION_SAMPLES 32

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
ADC_HandleTypeDef hadc1;
DMA_HandleTypeDef hdma_adc1;

TIM_HandleTypeDef htim2;

UART_HandleTypeDef huart2;

/* USER CODE BEGIN PV */
uint16_t adc_buffer[ADC_BUFFER_SIZE];
uint16_t joystick_x_raw = 0;
uint16_t joystick_y_raw = 0;

// X축 필터 변수
uint32_t x_filter_buffer[FILTER_SIZE] = {0};
uint8_t x_filter_index = 0;
uint8_t x_filter_init = 0;

// Y축 필터 변수
uint32_t y_filter_buffer[FILTER_SIZE] = {0};
uint8_t y_filter_index = 0;
uint8_t y_filter_init = 0;

uint16_t joystick_x_filtered = 0;
uint16_t joystick_y_filtered = 0;

// 캘리브레이션 값 (중립 위치)
uint16_t joystick_x_center = ADC_MAX_VALUE / 2;  // 기본값 2048
uint16_t joystick_y_center = ADC_MAX_VALUE / 2;  // 기본값 2048
uint8_t calibration_done = 0;

int16_t joystick_x_percent = 0;
int16_t joystick_y_percent = 0;

char direction_char = 'X';
char prev_direction_char = 'X';

// 스위치 관련 변수
volatile uint8_t switch_pressed = 0;
volatile uint32_t last_switch_time = 0;

char uart_buffer[100];

volatile uint32_t button_press_time = 0;
volatile uint32_t button_release_time = 0;
volatile uint32_t last_click_time = 0;
volatile uint8_t button_state = 0;
volatile uint8_t click_count = 0;
volatile uint32_t press_count = 0;
volatile uint8_t pending_click = 0;

/* Event flags */
volatile uint8_t event_short_press = 0;  // HOLD (U)
volatile uint8_t event_long_press = 0;   // HOME (Y)
volatile uint8_t event_double_click = 0; // RELEASE (I)

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_DMA_Init(void);
static void MX_USART2_UART_Init(void);
static void MX_ADC1_Init(void);
static void MX_TIM2_Init(void);
/* USER CODE BEGIN PFP */
void process_joystick_data(void);
void calibrate_joystick(void);
uint16_t apply_moving_average_x(uint16_t new_value);
uint16_t apply_moving_average_y(uint16_t new_value);
int16_t convert_to_percentage_calibrated(uint16_t adc_value, uint16_t center);
char get_direction_char(int16_t x_percent, int16_t y_percent);

/* 버튼 및 통신 관련 프로토타입 추가 */
void Process_Button(void);
void Handle_Events(void);
void UART_SendString(char *str);

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
#ifdef __GNUC__
#define PUTCHAR_PROTOTYPE int __io_putchar(int ch)
#else
#define PUTCHAR_PROTOTYPE int fputc(int ch, FILE *f)
#endif

PUTCHAR_PROTOTYPE
{
    if (ch == '\n')
        HAL_UART_Transmit(&huart2, (uint8_t*)"\r", 1, 0xFFFF);
    HAL_UART_Transmit(&huart2, (uint8_t*)&ch, 1, 0xFFFF);
    return ch;
}

// X축 전용 이동 평균 필터
uint16_t apply_moving_average_x(uint16_t new_value)
{
    uint32_t sum = 0;

    // 첫 호출 시 버퍼 초기화
    if (!x_filter_init) {
        for (int i = 0; i < FILTER_SIZE; i++) {
            x_filter_buffer[i] = new_value;
        }
        x_filter_init = 1;
        return new_value;
    }

    // 현재 인덱스에 새 값 저장
    x_filter_buffer[x_filter_index] = new_value;
    x_filter_index = (x_filter_index + 1) % FILTER_SIZE;

    // 평균 계산
    for (int i = 0; i < FILTER_SIZE; i++) {
        sum += x_filter_buffer[i];
    }

    return (uint16_t)(sum / FILTER_SIZE);
}

// Y축 전용 이동 평균 필터
uint16_t apply_moving_average_y(uint16_t new_value)
{
    uint32_t sum = 0;

    // 첫 호출 시 버퍼 초기화
    if (!y_filter_init) {
        for (int i = 0; i < FILTER_SIZE; i++) {
            y_filter_buffer[i] = new_value;
        }
        y_filter_init = 1;
        return new_value;
    }

    // 현재 인덱스에 새 값 저장
    y_filter_buffer[y_filter_index] = new_value;
    y_filter_index = (y_filter_index + 1) % FILTER_SIZE;

    // 평균 계산
    for (int i = 0; i < FILTER_SIZE; i++) {
        sum += y_filter_buffer[i];
    }

    return (uint16_t)(sum / FILTER_SIZE);
}

// 캘리브레이션된 퍼센트 변환
int16_t convert_to_percentage_calibrated(uint16_t adc_value, uint16_t center)
{
    int16_t centered_value = (int16_t)adc_value - (int16_t)center;
    int16_t percentage;

    if (centered_value >= 0) {
        // 양의 방향: center ~ ADC_MAX_VALUE
        uint16_t range = ADC_MAX_VALUE - center;
        if (range == 0) range = 1;  // 0으로 나누기 방지
        percentage = (centered_value * 100) / range;
    } else {
        // 음의 방향: 0 ~ center
        uint16_t range = center;
        if (range == 0) range = 1;  // 0으로 나누기 방지
        percentage = (centered_value * 100) / range;
    }

    // 범위 제한
    if (percentage > 100) percentage = 100;
    if (percentage < -100) percentage = -100;

    return percentage;
}

// 조이스틱 캘리브레이션 (시작 시 호출)
void calibrate_joystick(void)
{
    uint32_t x_sum = 0;
    uint32_t y_sum = 0;

    printf("Calibrating joystick... Keep neutral position!\n");
    HAL_Delay(500);  // 안정화 대기

    // 여러 샘플 수집
    for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
        x_sum += adc_buffer[0];
        y_sum += adc_buffer[1];
        HAL_Delay(10);
    }

    joystick_x_center = x_sum / CALIBRATION_SAMPLES;
    joystick_y_center = y_sum / CALIBRATION_SAMPLES;
    calibration_done = 1;

    printf("Calibration done! Center: X=%d, Y=%d\n",
           joystick_x_center, joystick_y_center);
}

// 방향 문자 결정
char get_direction_char(int16_t x_percent, int16_t y_percent)
{
    int16_t abs_x = (x_percent >= 0) ? x_percent : -x_percent;
    int16_t abs_y = (y_percent >= 0) ? y_percent : -y_percent;

    // 데드존 내에 있으면 중립
    if (abs_x < DEADZONE_THRESHOLD && abs_y < DEADZONE_THRESHOLD) {
        return 'X';
    }

    // Y축이 더 크거나 같으면 W/S
    if (abs_y >= abs_x) {
        if (y_percent >= DEADZONE_THRESHOLD) {
            return 'W';
        } else if (y_percent <= -DEADZONE_THRESHOLD) {
            return 'S';
        }
    }

    // X축이 더 크면 D/A
    if (abs_x > abs_y) {
        if (x_percent >= DEADZONE_THRESHOLD) {
            return 'D';
        } else if (x_percent <= -DEADZONE_THRESHOLD) {
            return 'A';
        }
    }

    return 'X';
}

// 조이스틱 데이터 처리
void process_joystick_data(void)
{
    // 캘리브레이션 완료 전에는 처리하지 않음
    if (!calibration_done) return;

    joystick_x_raw = adc_buffer[0];
    joystick_y_raw = adc_buffer[1];

    // 각 축별 독립적인 필터 적용
    joystick_x_filtered = apply_moving_average_x(joystick_x_raw);
    joystick_y_filtered = apply_moving_average_y(joystick_y_raw);

    // 캘리브레이션된 중심값 기준으로 퍼센트 계산
    joystick_x_percent = convert_to_percentage_calibrated(joystick_x_filtered, joystick_x_center);
    joystick_y_percent = convert_to_percentage_calibrated(joystick_y_filtered, joystick_y_center);

    direction_char = get_direction_char(joystick_x_percent, joystick_y_percent);
}

/**
  * @brief  외부 인터럽트 콜백 (조이스틱 스위치)
  */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
    uint32_t current_time = HAL_GetTick();

    // PA4 (조이스틱 스위치) 또는 PC13 (Blue Button)
    if (GPIO_Pin == GPIO_PIN_4 || GPIO_Pin == GPIO_PIN_13) {
        // 디바운싱: 마지막 입력 후 일정 시간 경과했는지 확인
        if ((current_time - last_switch_time) > DEBOUNCE_MS) {
            switch_pressed = 1;
            last_switch_time = current_time;
        }
    }
}

// 타이머 인터럽트 콜백
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM2) {
        process_joystick_data();

        // 방향이 바뀌었을 때만 전송 (개행 문자 \n 추가)
        if (direction_char != prev_direction_char) {
            if (direction_char != 'X') { // 'X'(정지)가 아닐 때만 출력하고 싶다면 조건 추가
                printf("%c\n", direction_char);
            } else {
                printf("X\n"); // 정지 상태 전송
            }
            prev_direction_char = direction_char;
        }
    }
}
void Process_Button(void)
{
    static uint8_t prev_state = 1;
    static uint32_t state_change_time = 0;
    static uint8_t debounced_state = 1;
    static uint8_t is_pressed = 0;

    uint8_t current_state = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_4);
    uint32_t current_time = HAL_GetTick();

    // 1. 디바운싱 처리
    if (current_state != prev_state) {
        state_change_time = current_time;
        prev_state = current_state;
    }

    if ((current_time - state_change_time) >= DEBOUNCE_MS) {
        if (current_state != debounced_state) {
            debounced_state = current_state;

            if (debounced_state == GPIO_PIN_RESET) { // 버튼 눌림
                button_press_time = current_time;
                is_pressed = 1;
            }
            else if (is_pressed) { // 버튼 뗌
                uint32_t duration = current_time - button_press_time;
                is_pressed = 0;

                if (duration >= LONG_PRESS_MS) {
                    event_long_press = 1; // HOME (y)
                    pending_click = 0;
                } else {
                    if (pending_click && (current_time - last_click_time) < DOUBLE_CLICK_MS) {
                        event_double_click = 1; // RELEASE (i)
                        pending_click = 0;
                    } else {
                        pending_click = 1; // 단일 클릭 가능성 대기
                    }
                    last_click_time = current_time;
                }
            }
        }
    }

    // 2. 단일 클릭 확정 처리 (더블 클릭 대기 시간이 지났을 때)
    if (pending_click && (current_time - last_click_time) >= DOUBLE_CLICK_MS) {
        event_short_press = 1; // HOLD (u)
        pending_click = 0;
    }
}
/**
 * @brief  Handle detected button events
 * @retval None
 */
void Handle_Events(void)
{
    if (event_short_press) {
        event_short_press = 0;
        printf("U\n"); // 자동차가 'U'를 받으면 HOLD(잡기) 수행
    }
    if (event_long_press) {
        event_long_press = 0;
        printf("Y\n"); // 자동차가 'Y'를 받으면 HOME(중립) 수행
    }
    if (event_double_click) {
        event_double_click = 0;
        printf("I\n"); // 자동차가 'I'를 받으면 RELEASE(놓기) 수행
    }
}
/**
 * @brief  Send string via UART
 * @param  str: String to send
 * @retval None
 */
void UART_SendString(char *str)
{
    HAL_UART_Transmit(&huart2, (uint8_t *)str, strlen(str), HAL_MAX_DELAY);
}
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_DMA_Init();
  MX_USART2_UART_Init();
  MX_ADC1_Init();
  MX_TIM2_Init();
  /* USER CODE BEGIN 2 */
  if (HAL_DMA_Init(&hdma_adc1) != HAL_OK) {
        Error_Handler();
    }

    __HAL_LINKDMA(&hadc1, DMA_Handle, hdma_adc1);

    HAL_ADCEx_Calibration_Start(&hadc1);
    HAL_ADC_Start_DMA(&hadc1, (uint32_t*)adc_buffer, ADC_BUFFER_SIZE);

    // ADC DMA 안정화 대기 후 캘리브레이션 수행
    HAL_Delay(100);
    calibrate_joystick();

    // 타이머 인터럽트 시작
    HAL_TIM_Base_Start_IT(&htim2);

    printf("Joystick Control Started\n");
    printf("Commands: W/A/S/D/X + B(Button)\n");

    UART_SendString("\r\n========================================\r\n");
    UART_SendString("  Button Switch Module Test\r\n");
	UART_SendString("  NUCLEO-F103RB\r\n");
	UART_SendString("========================================\r\n");
	UART_SendString("Button Events Detected:\r\n");
	UART_SendString("  - Short Press (< 1 sec)\r\n");
	UART_SendString("  - Long Press (>= 1 sec)\r\n");
	UART_SendString("  - Double Click (< 300ms)\r\n\r\n");
	UART_SendString("Press the button to start...\r\n\r\n");

	/* Initial state read */
	button_state = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_4);
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
      /* Process button state */
      Process_Button();

      /* Handle detected events */
      Handle_Events();

      HAL_Delay(50);
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
//      HAL_Delay(10);  // 메인 루프 딜레이
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};
  RCC_PeriphCLKInitTypeDef PeriphClkInit = {0};

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI_DIV2;
  RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL16;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
  {
    Error_Handler();
  }
  PeriphClkInit.PeriphClockSelection = RCC_PERIPHCLK_ADC;
  PeriphClkInit.AdcClockSelection = RCC_ADCPCLK2_DIV6;
  if (HAL_RCCEx_PeriphCLKConfig(&PeriphClkInit) != HAL_OK)
  {
    Error_Handler();
  }
}

/**
  * @brief ADC1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_ADC1_Init(void)
{

  /* USER CODE BEGIN ADC1_Init 0 */

  /* USER CODE END ADC1_Init 0 */

  ADC_ChannelConfTypeDef sConfig = {0};

  /* USER CODE BEGIN ADC1_Init 1 */

  /* USER CODE END ADC1_Init 1 */

  /** Common config
  */
  hadc1.Instance = ADC1;
  hadc1.Init.ScanConvMode = ADC_SCAN_ENABLE;
  hadc1.Init.ContinuousConvMode = ENABLE;
  hadc1.Init.DiscontinuousConvMode = DISABLE;
  hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;
  hadc1.Init.NbrOfConversion = 2;
  if (HAL_ADC_Init(&hadc1) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure Regular Channel
  */
  sConfig.Channel = ADC_CHANNEL_0;
  sConfig.Rank = ADC_REGULAR_RANK_1;
  sConfig.SamplingTime = ADC_SAMPLETIME_239CYCLES_5;
  if (HAL_ADC_ConfigChannel(&hadc1, &sConfig) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure Regular Channel
  */
  sConfig.Channel = ADC_CHANNEL_1;
  sConfig.Rank = ADC_REGULAR_RANK_2;
  if (HAL_ADC_ConfigChannel(&hadc1, &sConfig) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN ADC1_Init 2 */

  /* USER CODE END ADC1_Init 2 */

}

/**
  * @brief TIM2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_TIM2_Init(void)
{

  /* USER CODE BEGIN TIM2_Init 0 */

  /* USER CODE END TIM2_Init 0 */

  TIM_ClockConfigTypeDef sClockSourceConfig = {0};
  TIM_MasterConfigTypeDef sMasterConfig = {0};

  /* USER CODE BEGIN TIM2_Init 1 */

  /* USER CODE END TIM2_Init 1 */
  htim2.Instance = TIM2;
  htim2.Init.Prescaler = 6399;
  htim2.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim2.Init.Period = 499;
  htim2.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  if (HAL_TIM_Base_Init(&htim2) != HAL_OK)
  {
    Error_Handler();
  }
  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
  if (HAL_TIM_ConfigClockSource(&htim2, &sClockSourceConfig) != HAL_OK)
  {
    Error_Handler();
  }
  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
  if (HAL_TIMEx_MasterConfigSynchronization(&htim2, &sMasterConfig) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN TIM2_Init 2 */

  /* USER CODE END TIM2_Init 2 */

}

/**
  * @brief USART2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART2_UART_Init(void)
{

  /* USER CODE BEGIN USART2_Init 0 */

  /* USER CODE END USART2_Init 0 */

  /* USER CODE BEGIN USART2_Init 1 */

  /* USER CODE END USART2_Init 1 */
  huart2.Instance = USART2;
  huart2.Init.BaudRate = 115200;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart2) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART2_Init 2 */

  /* USER CODE END USART2_Init 2 */

}

/**
  * Enable DMA controller clock
  */
static void MX_DMA_Init(void)
{

  /* DMA controller clock enable */
  __HAL_RCC_DMA1_CLK_ENABLE();

  /* DMA interrupt init */
  /* DMA1_Channel1_IRQn interrupt configuration */
  HAL_NVIC_SetPriority(DMA1_Channel1_IRQn, 0, 0);
  HAL_NVIC_EnableIRQ(DMA1_Channel1_IRQn);

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  /* USER CODE BEGIN MX_GPIO_Init_1 */

  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOD_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_RESET);

  /*Configure GPIO pin : B1_Pin */
  GPIO_InitStruct.Pin = B1_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_IT_RISING;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(B1_GPIO_Port, &GPIO_InitStruct);

  /*Configure GPIO pin : PA4 */
  GPIO_InitStruct.Pin = GPIO_PIN_4;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pin : LD2_Pin */
  GPIO_InitStruct.Pin = LD2_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(LD2_GPIO_Port, &GPIO_InitStruct);

  /* EXTI interrupt init*/
  HAL_NVIC_SetPriority(EXTI15_10_IRQn, 0, 0);
  HAL_NVIC_EnableIRQ(EXTI15_10_IRQn);

  /* USER CODE BEGIN MX_GPIO_Init_2 */

  /* USER CODE END MX_GPIO_Init_2 */
}

/* USER CODE BEGIN 4 */

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

#ifdef  USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
