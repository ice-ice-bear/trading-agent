# 초기 자본 추적 및 포트폴리오 P/L 개선 설계

**날짜**: 2026-03-03
**상태**: 승인됨

## 문제 정의

현재 대시보드의 P/L(손익)은 KIS API의 `evlu_pfls_smtl_amt`(현재 포지션의 미실현 손익만)를 기준으로 계산된다. 이로 인해:

1. 포지션이 없을 때 `total_value` < `cash_balance`라는 논리적 모순 발생 (KIS `tot_evlu_amt`의 T+2 결제 처리 방식 차이)
2. 초기 자본 대비 전체 투자 성과(실현+미실현)를 확인할 방법이 없음
3. "지금 내 돈이 얼마인지"와 "처음에 얼마로 시작했는지"를 동시에 볼 수 없음

## 설계 결정

### Option B 채택: risk_config 테이블에 initial_capital 자동 저장

신규 테이블 없이 기존 `risk_config` 테이블을 활용한다.

**이유**:
- 이미 UI(Settings)와 API(`/api/agents/risk-config`)가 연결되어 있어 인프라 추가 불필요
- 첫 스냅샷 실행 시 자동 설정으로 별도 사용자 입력 불필요
- 필요 시 Settings 페이지에서 수동 리셋 가능 (향후 확장)

## 변경 사항

### 1. `backend/app/agents/portfolio_monitor.py`

스냅샷 저장 후 `risk_config`에 `initial_capital`이 없으면 현재 `cash_balance`로 자동 설정:

```python
# 초기 자본 자동 설정 (첫 실행 시만)
existing_ic = await execute_query(
    "SELECT value FROM risk_config WHERE key = 'initial_capital'",
    fetch_one=True,
)
if not existing_ic:
    await execute_query(
        "INSERT INTO risk_config (key, value) VALUES ('initial_capital', ?) "
        "ON CONFLICT(key) DO NOTHING",
        (str(cash_balance),),
    )
```

### 2. `backend/app/routers/dashboard.py`

`/api/dashboard/portfolio` 응답 변경:

- `initial_capital` 필드 추가
- `total_pnl` = `total_value - initial_capital` (KIS 값 대신 진짜 성과 기준)
- `total_pnl_pct` = `(total_value - initial_capital) / initial_capital * 100`

```python
@router.get("/portfolio")
async def get_portfolio():
    snapshot = await portfolio_service.get_latest_portfolio()
    if not snapshot:
        return { "total_value": 0, "cash_balance": 0, "initial_capital": 0, ... }

    # 초기 자본 조회
    ic_row = await execute_query(
        "SELECT value FROM risk_config WHERE key = 'initial_capital'",
        fetch_one=True,
    )
    initial_capital = float(ic_row["value"]) if ic_row else snapshot["cash_balance"]

    # P/L 재계산 (초기 자본 기준)
    total_value = snapshot["total_value"]
    total_pnl = total_value - initial_capital
    total_pnl_pct = (total_pnl / initial_capital * 100) if initial_capital > 0 else 0.0

    positions = await portfolio_service.get_latest_positions()
    return {
        "total_value": total_value,
        "cash_balance": snapshot["cash_balance"],
        "initial_capital": initial_capital,
        "total_pnl": total_pnl,
        "total_pnl_pct": round(total_pnl_pct, 2),
        "positions": positions,
        "timestamp": snapshot["timestamp"],
    }
```

### 3. `frontend/src/types.ts`

`PortfolioData` 인터페이스에 `initial_capital` 추가:

```typescript
export interface PortfolioData {
  total_value: number;
  cash_balance: number;
  initial_capital: number;  // 새로 추가
  total_pnl: number;
  total_pnl_pct: number;
  positions: Position[];
  timestamp?: string;
}
```

### 4. `frontend/src/components/dashboard/PortfolioSummary.tsx`

UI에 초기자본 행 추가:

```
[Portfolio Summary]
총자산:    ₩10,500,000   ← total_value
초기자본:  ₩10,000,000   ← initial_capital (고정)
현금:      ₩8,000,000    ← cash_balance
수익:      +₩500,000 (+5.0%)  ← total_value - initial_capital 기준
포지션:    2
```

## 데이터 흐름

```
KIS API (inquire_balance)
    ↓
portfolio_monitor.py
  - total_value = cash + positions (자체 계산)
  - cash_balance = dnca_tot_amt (예수금)
  - initial_capital → risk_config 자동 저장 (첫 실행만)
    ↓
portfolio_snapshots DB (total_value, cash_balance 저장)
    ↓
dashboard.py GET /portfolio
  - initial_capital ← risk_config
  - total_pnl = total_value - initial_capital (재계산)
    ↓
PortfolioSummary.tsx (4개 지표 표시)
```

## 성공 기준

- 대시보드에 초기자본(₩10,000,000)과 현재 현금이 동시에 표시됨
- P/L이 초기 자본 대비 전체 성과를 정확히 반영함
- 포트폴리오 모니터 첫 실행 시 초기 자본이 자동 설정됨
- 기존 스냅샷 데이터 호환 (DB 스키마 변경 없음)
