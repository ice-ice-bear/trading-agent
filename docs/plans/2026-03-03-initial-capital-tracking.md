# Initial Capital Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `risk_config` 테이블에 `initial_capital`을 자동 저장하고, 대시보드 P/L을 초기 자본 기준으로 재계산하며, UI에 초기자본 항목을 표시한다.

**Architecture:** portfolio_monitor가 첫 실행 시 `cash_balance`를 `risk_config.initial_capital`로 자동 저장한다. dashboard API가 이 값을 읽어 `total_pnl = total_value - initial_capital`로 재계산한 뒤 프론트엔드에 전달하고, PortfolioSummary가 초기자본 행을 추가로 렌더링한다. DB 스키마 변경 없음 — `risk_config` 테이블 재활용.

**Tech Stack:** Python/FastAPI (backend), SQLite via `execute_query`, React/TypeScript (frontend)

---

### Task 1: portfolio_monitor — 초기 자본 자동 저장

**Files:**
- Modify: `backend/app/agents/portfolio_monitor.py` (스냅샷 저장 직후)

**Step 1: 파일 읽기**

`backend/app/agents/portfolio_monitor.py` 열기. `# 3. Save snapshot to DB` 블록 (약 106~111줄)을 확인한다.

**Step 2: 스냅샷 저장 직후에 초기 자본 자동 설정 코드 추가**

`execute_insert` 호출(`snapshot_id = await execute_insert(...)`) 이후, `# 4. Update shared state` 주석 바로 위에 다음 코드를 삽입한다:

```python
        # Auto-set initial capital on first run
        existing_ic = await execute_query(
            "SELECT value FROM risk_config WHERE key = 'initial_capital'",
            fetch_one=True,
        )
        if not existing_ic and cash_balance > 0:
            await execute_query(
                "INSERT INTO risk_config (key, value) VALUES ('initial_capital', ?) "
                "ON CONFLICT(key) DO NOTHING",
                (str(cash_balance),),
            )
            logger.info(f"Initial capital set: {cash_balance:,.0f}")
```

**Step 3: 수동 검증**

백엔드가 `--reload`로 실행 중이므로 저장 즉시 반영된다.

```bash
# risk_config에 initial_capital이 없다면 삭제 후 테스트
curl -s http://localhost:8000/api/agents/risk-config | python3 -m json.tool
# → initial_capital 필드 없음 확인

curl -s -X POST http://localhost:8000/api/agents/portfolio_monitor/run | python3 -m json.tool
# → success: true

curl -s http://localhost:8000/api/agents/risk-config | python3 -m json.tool
# → "initial_capital": 10000000.0 확인
```

**Step 4: Commit**

```bash
git add backend/app/agents/portfolio_monitor.py
git commit -m "feat(portfolio): auto-save initial capital to risk_config on first snapshot"
```

---

### Task 2: RiskConfigUpdate 모델에 initial_capital 추가

**Files:**
- Modify: `backend/app/routers/agents.py`

**Step 1: `RiskConfigUpdate` Pydantic 모델에 필드 추가**

`backend/app/routers/agents.py`의 `RiskConfigUpdate` 클래스에 `initial_capital` 필드를 추가한다:

```python
class RiskConfigUpdate(BaseModel):
    stop_loss_pct: float | None = None
    take_profit_pct: float | None = None
    max_positions: int | None = None
    max_position_weight_pct: float | None = None
    max_daily_loss: float | None = None
    signal_approval_mode: str | None = None
    initial_capital: float | None = None  # 추가
```

`get_risk_config`와 `update_risk_config` 두 함수의 return dict에도 `initial_capital` 추가:

```python
return {
    "stop_loss_pct": float(config.get("stop_loss_pct", -3.0)),
    "take_profit_pct": float(config.get("take_profit_pct", 5.0)),
    "max_positions": int(config.get("max_positions", 5)),
    "max_position_weight_pct": float(config.get("max_position_weight_pct", 20.0)),
    "max_daily_loss": float(config.get("max_daily_loss", 500000)),
    "signal_approval_mode": config.get("signal_approval_mode", "auto"),
    "initial_capital": float(config.get("initial_capital", 0)),  # 추가
}
```

**Step 2: 검증**

```bash
curl -s http://localhost:8000/api/agents/risk-config | python3 -m json.tool
# → "initial_capital": 10000000.0 포함 확인
```

**Step 3: Commit**

```bash
git add backend/app/routers/agents.py
git commit -m "feat(api): expose initial_capital in risk-config endpoint"
```

---

### Task 3: dashboard API — initial_capital 포함 및 P/L 재계산

**Files:**
- Modify: `backend/app/routers/dashboard.py`

**Step 1: import 추가**

`dashboard.py` 상단 import에 `execute_query` 추가:

```python
from app.models.db import execute_query
```

**Step 2: `get_portfolio()` 함수 수정**

기존 함수 전체를 아래로 교체한다:

```python
@router.get("/portfolio")
async def get_portfolio():
    """Get latest portfolio snapshot with initial capital and recalculated P/L."""
    snapshot = await portfolio_service.get_latest_portfolio()
    if not snapshot:
        return {
            "total_value": 0,
            "cash_balance": 0,
            "initial_capital": 0,
            "total_pnl": 0,
            "total_pnl_pct": 0,
            "positions": [],
        }

    # Fetch initial capital from risk_config
    ic_row = await execute_query(
        "SELECT value FROM risk_config WHERE key = 'initial_capital'",
        fetch_one=True,
    )
    initial_capital = float(ic_row["value"]) if ic_row else snapshot["cash_balance"]

    # Recalculate P/L based on initial capital (includes realized + unrealized)
    total_value = snapshot["total_value"]
    total_pnl = total_value - initial_capital
    total_pnl_pct = round((total_pnl / initial_capital * 100), 2) if initial_capital > 0 else 0.0

    positions = await portfolio_service.get_latest_positions()
    return {
        "total_value": total_value,
        "cash_balance": snapshot["cash_balance"],
        "initial_capital": initial_capital,
        "total_pnl": total_pnl,
        "total_pnl_pct": total_pnl_pct,
        "positions": positions,
        "timestamp": snapshot["timestamp"],
    }
```

**Step 3: 검증**

```bash
curl -s http://localhost:8000/api/dashboard/portfolio | python3 -m json.tool
# 기대 응답:
# {
#   "total_value": 10000000,
#   "cash_balance": 10000000,
#   "initial_capital": 10000000,
#   "total_pnl": 0,
#   "total_pnl_pct": 0.0,
#   "positions": []
# }
```

**Step 4: Commit**

```bash
git add backend/app/routers/dashboard.py
git commit -m "feat(dashboard): add initial_capital to portfolio API and recalculate P/L"
```

---

### Task 4: TypeScript 타입 업데이트

**Files:**
- Modify: `frontend/src/types.ts`

**Step 1: `PortfolioData` 인터페이스에 `initial_capital` 추가**

`frontend/src/types.ts`의 `PortfolioData` 인터페이스를 찾아 `initial_capital` 필드를 추가한다:

```typescript
export interface PortfolioData {
  total_value: number;
  cash_balance: number;
  initial_capital: number;  // 추가
  total_pnl: number;
  total_pnl_pct: number;
  positions: Position[];
  timestamp?: string;
}
```

**Step 2: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(types): add initial_capital to PortfolioData interface"
```

---

### Task 5: PortfolioSummary UI — 초기자본 행 추가

**Files:**
- Modify: `frontend/src/components/dashboard/PortfolioSummary.tsx`

**Step 1: `initial_capital` 값 추출 추가**

기존 변수 선언부에 `initialCapital` 추가:

```typescript
const totalValue = data?.total_value ?? 0;
const cash = data?.cash_balance ?? 0;
const initialCapital = data?.initial_capital ?? 0;  // 추가
const pnl = data?.total_pnl ?? 0;
const pnlPct = data?.total_pnl_pct ?? 0;
const posCount = data?.positions?.length ?? 0;
```

**Step 2: summary-grid에 초기자본 행 추가**

Total 행과 Cash 행 사이에 Initial 행을 삽입한다:

```tsx
<div className="summary-grid">
  <div className="summary-item">
    <span className="summary-label">Total</span>
    <span className="summary-value">{formatKRW(totalValue)}</span>
  </div>
  <div className="summary-item">
    <span className="summary-label">Initial</span>
    <span className="summary-value summary-value--muted">{formatKRW(initialCapital)}</span>
  </div>
  <div className="summary-item">
    <span className="summary-label">Cash</span>
    <span className="summary-value">{formatKRW(cash)}</span>
  </div>
  <div className="summary-item">
    <span className="summary-label">P/L</span>
    <span className={`summary-value ${pnl >= 0 ? 'positive' : 'negative'}`}>
      {formatKRW(pnl)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
    </span>
  </div>
  <div className="summary-item">
    <span className="summary-label">Positions</span>
    <span className="summary-value">{posCount}</span>
  </div>
</div>
```

**Step 3: `summary-value--muted` CSS 추가**

`frontend/src/App.css` 또는 관련 CSS 파일에서 `.summary-value` 규칙을 찾아 muted variant 추가:

```css
.summary-value--muted {
  opacity: 0.6;
  font-size: 0.9em;
}
```

**Step 4: Playwright로 UI 검증**

```bash
# /tmp/playwright-verify-initial-capital.js 실행
cd ~/.claude/skills/playwright-skill && node run.js /tmp/playwright-verify-initial-capital.js
```

대시보드에서 Initial 행이 표시되고 P/L이 초기자본 기준으로 계산되는지 확인한다.

**Step 5: Commit**

```bash
git add frontend/src/components/dashboard/PortfolioSummary.tsx frontend/src/App.css
git commit -m "feat(ui): add initial capital row to PortfolioSummary"
```

---

## 완료 기준

- [ ] `portfolio_monitor` 첫 실행 시 `risk_config.initial_capital` 자동 저장
- [ ] `/api/agents/risk-config`에 `initial_capital` 노출
- [ ] `/api/dashboard/portfolio`에 `initial_capital` 포함, P/L이 초기자본 기준
- [ ] 대시보드 UI에 초기자본(Initial) 항목 표시
- [ ] Playwright 스크린샷으로 최종 UI 확인
