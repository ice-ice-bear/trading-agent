# Expert Agent Team — MarketScanner 고도화 설계

**날짜:** 2026-03-04
**상태:** 승인됨
**관련 파일:** `backend/app/agents/market_scanner.py`, `backend/app/services/market_service.py`

---

## 개요

기존 MarketScanner는 거래량/등락률 TOP10을 Claude에 일괄 전달하는 단순 구조였다. 이를 **KOSPI200 전체를 커버하는 2단계 스크리닝 + 4명의 전문가 팀 병렬 분석 + Chief Analyst 토론 시뮬레이션** 구조로 고도화한다.

---

## 아키텍처

### 전체 파이프라인 (Option B — MarketScanner 내부 팀)

```
MarketScannerAgent.execute()
│
├─ [Stage 1] KOSPI200 스크리닝 (빠른 사전 필터)
│   ├─ volume_rank TOP 50 + fluctuation_rank TOP 50 (합산 최대 100)
│   ├─ KOSPI200 구성 종목 리스트와 교차 검증
│   └─ 후보군: 20~30 종목 추출
│
├─ [Stage 2] 기술적 지표 계산 (Python, Claude 호출 없음)
│   ├─ 후보 종목별 일봉 30일 데이터 asyncio.gather 병렬 수집
│   └─ 지표 계산:
│       MA5 / MA20 / MA60 (이동평균, 추세 방향)
│       RSI(14) (과매수=70↑ / 과매도=30↓)
│       MACD(12,26,9) (추세 전환 신호)
│       Stochastic K/D(14,3) (단기 모멘텀)
│       Bollinger Bands(20,2) (변동성 채널, 돌파 감지)
│       ATR(14) (일일 평균 변동폭, 위험도)
│       거래량 변화율 (5일 평균 대비 현재 배율)
│
├─ [Stage 3] 전문가 패널 병렬 분석 (asyncio.gather → 4개 Claude 호출)
│   ├─ TechnicalAnalyst — 차트 지표 기반 추세/전환점
│   ├─ MomentumTrader   — 거래량·단기 모멘텀 급등 패턴
│   ├─ RiskAssessor     — 변동성·포트폴리오 리스크 도가
│   └─ PortfolioStrategist — 현재 포지션 맥락의 전략적 판단
│
└─ [Stage 4] Chief Analyst 토론 시뮬레이션 (1개 Claude 호출)
    ├─ 4명 의견 + 이견 2라운드 토론 프롬프트
    └─ 최종: 종목별 buy/sell/hold + confidence ≥ 0.7 + 근거
```

---

## 공통 데이터 패키지 (각 전문가에게 전달)

```json
{
  "stock": {
    "code": "005930",
    "name": "삼성전자",
    "sector": "IT"
  },
  "price": {
    "current": 72000,
    "change_pct": 2.3,
    "volume": 18500000,
    "volume_change_5d_pct": 185
  },
  "technicals": {
    "ma5": 71200,
    "ma20": 70500,
    "ma60": 68000,
    "ma_alignment": "bullish",
    "rsi_14": 62.3,
    "macd": { "macd": 450, "signal": 380, "histogram": 70, "cross": "bullish" },
    "stochastic": { "k": 75.2, "d": 68.4, "signal": "overbought_approaching" },
    "bollinger": {
      "upper": 74500, "middle": 70500, "lower": 66500,
      "position": "upper_half",
      "bandwidth": 0.114
    },
    "atr_14": 1850
  },
  "portfolio_context": {
    "current_positions": ["000660", "005380"],
    "cash_pct": 94.2,
    "already_holds": false,
    "daily_pnl_pct": -0.8
  }
}
```

---

## 전문가 페르소나 설계

### 1. Technical Analyst (기술적 분석가)
- **분석 초점:** MA 정배열/역배열, RSI 구간 판단, MACD 크로스/다이버전스, 볼린저 밴드 돌파 여부
- **판단 근거:** 지표 조합 시너지 (예: MACD 골든크로스 + RSI 50↑ + MA 정배열 = 강한 매수)
- **출력:**
  ```json
  {
    "view": "bullish",
    "key_signals": ["MACD 골든크로스", "MA 정배열", "볼린저 상단 돌파"],
    "confidence": 0.82,
    "concern": "RSI 62로 과매수 근접"
  }
  ```

### 2. Momentum Trader (모멘텀 트레이더)
- **분석 초점:** 거래량 배율, Stochastic K/D 방향, 단기 가격 모멘텀, 장중 고점 돌파
- **판단 근거:** 거래량 급등 없는 상승은 신뢰도 낮음
- **출력:** 동일 구조

### 3. Risk Assessor (리스크 평가자)
- **분석 초점:** ATR 기반 스톱로스 거리, RSI 과매수 위험, 포트폴리오 집중도 리스크
- **출력:**
  ```json
  {
    "risk_level": "medium",
    "concerns": ["RSI 62 — 추가 상승 시 과매수 진입"],
    "suggested_stop_loss_pct": -3.5,
    "max_weight_pct": 5
  }
  ```

### 4. Portfolio Strategist (포트폴리오 전략가)
- **분석 초점:** 현금 비중 vs 기회비용, 섹터 집중 위험, 현재 포지션과의 상관관계
- **출력:** 동일 + `priority: 1-5` (긴급도)

---

## Chief Analyst 토론 시뮬레이션

### 프롬프트 구조

```
당신은 Chief Market Analyst입니다.
아래 4명의 전문가 의견을 바탕으로 2라운드 토론을 진행하고 최종 매매 결정을 내리세요.

## 전문가 의견
- Technical Analyst: {technical_view}
- Momentum Trader: {momentum_view}
- Risk Assessor: {risk_view}
- Portfolio Strategist: {strategy_view}

## 토론 규칙
Round 1: 가장 큰 이견(예: bullish vs risk 우려)에 대해 각 전문가 입장 표명
Round 2: 조건부 동의 또는 최종 거부

## 최종 출력 (JSON만)
{
  "stock_code": "005930",
  "decision": "buy|sell|hold",
  "confidence": 0.75,
  "consensus_type": "unanimous|majority|conditional",
  "dissenting_view": "Risk Assessor 우려 — ATR 높아 포지션 작게",
  "reason": "기술적 지표 강세 + 거래량 급등, 단 RSI 주의",
  "suggested_position_size": "small|medium|large"
}
```

---

## 구현 파일 구조

```
backend/app/agents/
  market_scanner.py          (수정) — 전체 오케스트레이션
  market_scanner_experts.py  (신규) — 4개 전문가 분석 함수
  market_scanner_indicators.py (신규) — 기술적 지표 계산 (RSI, MACD 등)

backend/app/services/
  market_service.py          (수정) — KOSPI200 조회, 병렬 차트 수집 추가
```

---

## KOSPI200 데이터 관리

- **초기 로드:** `domestic_stock.inquire_index_components` API로 KOSPI200 구성 종목 조회
- **캐싱:** DB `kospi200_components` 테이블에 저장, 매일 장 시작 전 갱신
- **스크리닝:** volume_rank + fluctuation_rank 결과를 KOSPI200 리스트와 교차 필터

---

## 성능 예측

| 단계 | 소요 시간 | API 호출 수 |
|------|-----------|------------|
| Stage 1 스크리닝 | ~2초 | 2회 (MCP) |
| Stage 2 차트 수집 (20종목 병렬) | ~5초 | 20회 (MCP) |
| Stage 3 전문가 분석 (병렬) | ~8초 | 4회 (Claude) |
| Stage 4 Chief 토론 | ~5초 | 1회 (Claude) |
| **총계** | **~20초** | **27회** |

기존: 거래량 10개 + Claude 1회 = ~3초 → 분석 깊이와 트레이드오프

---

## 기술 의존성

- `pandas` 또는 순수 Python으로 지표 계산 (numpy 옵션)
- 기존 `anthropic.AsyncAnthropic` 클라이언트 재사용
- 기존 `asyncio.gather` 패턴 확장
- `get_daily_chart()` 기존 함수 활용 (현재 미사용)
