# 프론트엔드 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백엔드에 존재하지만 프론트엔드에서 미노출/미연결된 기능들을 전부 표면화하여 데이터 흐름을 완전히 추적 가능하게 만든다.

**Architecture:** API 서비스 레이어에 누락 함수 추가 → 타입 정의 보강 → 개별 컴포넌트 순서대로 개선 → 데이터 간 드릴다운 네비게이션 추가. 기존 컴포넌트 구조를 유지하면서 점진적으로 확장한다.

**Tech Stack:** React 19, TypeScript, Vite 7, CSS (기존 index.css 기반)

---

## 파일 구조

### 수정할 파일
| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/types.ts` | 누락 타입 필드 추가, 새 타입 정의 |
| `frontend/src/services/api.ts` | 미호출 엔드포인트 래퍼 함수 7개 추가 |
| `frontend/src/components/dashboard/OrderHistory.tsx` | fill_price, order_type, signal 링크 추가 |
| `frontend/src/components/dashboard/PositionsTable.tsx` | market_value 컬럼 추가 |
| `frontend/src/components/dashboard/PerformanceChart.tsx` | 올바른 엔드포인트 + 기간 선택기 |
| `frontend/src/components/signals/SignalCard.tsx` | 전문가 의견 펼침, risk_notes 표시 |
| `frontend/src/components/ReportViewer.tsx` | 서술 미리보기, 거래 pnl 표시 |
| `frontend/src/components/AgentWorkflow.tsx` | 스케줄 편집, 즉시 실행 버튼 |
| `frontend/src/components/SettingsView.tsx` | initial_capital, min_rr_score 편집 |
| `frontend/src/components/DashboardView.tsx` | 시그널 상세 모달 연동 |

### 새로 만들 파일
| 파일 | 용도 |
|------|------|
| `frontend/src/components/signals/SignalDetailModal.tsx` | 시그널 상세 드릴다운 모달 |
| `frontend/src/components/dashboard/ScheduleManager.tsx` | 스케줄 편집 컴포넌트 |

---

## Task 1: API 서비스 누락 함수 추가

**Files:**
- Modify: `frontend/src/services/api.ts:259-264`

- [ ] **Step 1: api.ts에 누락된 7개 함수 추가**

`api.ts` 파일 끝(264번줄 이후)에 다음 함수들을 추가:

```typescript
export async function getSignal(signalId: number): Promise<Signal> {
  const res = await fetch(`/api/signals/${signalId}`);
  if (!res.ok) throw new Error('Failed to fetch signal');
  return res.json();
}

export async function getAgent(agentId: string): Promise<Record<string, unknown> & { recent_logs: Array<Record<string, unknown>> }> {
  const res = await fetch(`/api/agents/${agentId}`);
  if (!res.ok) throw new Error('Failed to fetch agent');
  return res.json();
}
// 참고: 백엔드는 Agent 필드 + recent_logs를 flat 객체로 반환 (중첩 아님)

export async function getPortfolioHistory(hours: number = 24): Promise<{ snapshots: Array<{ timestamp: string; total_value: number; total_pnl: number; total_pnl_pct: number }> }> {
  const res = await fetch(`/api/dashboard/portfolio/history?hours=${hours}`);
  if (!res.ok) throw new Error('Failed to fetch portfolio history');
  return res.json();
}

export async function getPerformance(period: string = '7d'): Promise<{ returns_pct: number; max_drawdown: number; trade_count: number; chart_data: Array<{ timestamp: string; total_value: number; total_pnl: number; total_pnl_pct: number }> }> {
  const res = await fetch(`/api/dashboard/performance?period=${period}`);
  if (!res.ok) throw new Error('Failed to fetch performance');
  return res.json();
}

export async function updateTask(taskId: number, update: { cron_expression?: string; enabled?: boolean }): Promise<{ task: ScheduledTask }> {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

export async function runTaskNow(taskId: number): Promise<{ task_id: number; agent_id: string; success: boolean; summary: string }> {
  const res = await fetch(`/api/tasks/${taskId}/run-now`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to run task');
  return res.json();
}

// 참고: 기존 approveSignal/rejectSignal을 수정하여 optional reason 파라미터 지원
// 기존 함수 시그니처를 다음과 같이 변경:
//   approveSignal(signalId: number, reason?: string)
//   rejectSignal(signalId: number, reason?: string)
// body에 reason이 있으면 JSON으로 전송, 없으면 빈 body
```

- [ ] **Step 2: 프론트엔드 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add missing API service functions (getSignal, getPerformance, updateTask, etc.)"
```

---

## Task 2: 타입 정의 보강

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: RiskConfig에 누락 필드 추가**

`types.ts:30-37`의 `RiskConfig` 타입에 필드 추가:

```typescript
// 기존 RiskConfig에 추가
export interface RiskConfig {
  stop_loss_pct: number;
  take_profit_pct: number;
  max_positions: number;
  max_position_weight_pct: number;
  max_daily_loss: number;
  signal_approval_mode: 'auto' | 'manual';
  initial_capital?: number;
  min_rr_score?: number;
}
```

- [ ] **Step 2: Order 타입에 누락 필드 추가**

`types.ts:61-73`의 `Order` 타입에 필드 추가:

```typescript
export interface Order {
  id: number;
  timestamp: string;
  agent_id: string;
  stock_code: string;
  stock_name: string;
  side: 'buy' | 'sell';
  order_type: 'market' | 'limit';
  quantity: number;
  price: number | null;
  status: 'submitted' | 'filled' | 'rejected' | 'cancelled';
  reason: string;
  fill_price?: number | null;
  fill_quantity?: number | null;
  signal_id?: number | null;
}
```

- [ ] **Step 3: PerformanceData 새 타입 추가**

`types.ts` 하단에 추가:

```typescript
export interface PerformanceData {
  returns_pct: number;
  max_drawdown: number;
  trade_count: number;
  chart_data: Array<{ timestamp: string; total_value: number; total_pnl: number; total_pnl_pct: number }>;
}

export interface PortfolioSnapshot {
  timestamp: string;
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/types.ts
git commit -m "feat: add missing type fields (RiskConfig, Order, PerformanceData)"
```

---

## Task 3: OrderHistory 개선 — 체결가, 주문유형, 시그널 링크 표시

**Files:**
- Modify: `frontend/src/components/dashboard/OrderHistory.tsx:43-50`

- [ ] **Step 1: OrderHistory 컬럼 확장**

테이블 헤더와 바디를 다음과 같이 수정. 기존 6컬럼 → 8컬럼으로 확장:

```tsx
{/* 테이블 헤더 — 기존 th 배열을 교체 */}
<tr>
  <th>시간</th>
  <th>종목</th>
  <th>구분</th>
  <th>유형</th>
  <th className="text-right">수량</th>
  <th className="text-right">주문가</th>
  <th className="text-right">체결가</th>
  <th>상태</th>
</tr>
```

```tsx
{/* 테이블 바디 — 기존 td 배열을 교체 */}
{orders.map((order) => (
  <tr key={order.id}>
    <td>{parseUTC(order.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
    <td>
      <span className="mono">{order.stock_code}</span>
      {order.stock_name && <span className="text-muted"> {order.stock_name}</span>}
    </td>
    <td>
      <span className={`badge badge-${order.side === 'buy' ? 'long' : 'short'}`}>
        {order.side === 'buy' ? '매수' : '매도'}
      </span>
    </td>
    <td className="text-muted">{order.order_type === 'limit' ? '지정가' : '시장가'}</td>
    <td className="text-right">{order.quantity.toLocaleString()}</td>
    <td className="text-right">{order.price ? order.price.toLocaleString() : '시장가'}</td>
    <td className="text-right">
      {order.fill_price ? order.fill_price.toLocaleString() : '-'}
      {order.fill_quantity && order.fill_quantity !== order.quantity && (
        <span className="text-muted"> ({order.fill_quantity}주)</span>
      )}
    </td>
    <td>
      <span className={`badge status-${order.status}`}>{order.status}</span>
      {order.signal_id && (
        <span className="signal-link text-muted" title={`Signal #${order.signal_id}`}>
          📋
        </span>
      )}
    </td>
  </tr>
))}
```

- [ ] **Step 2: 주문 조회 limit 증가 (20 → 50)**

기존 `getOrders(20)` 호출을 `getOrders(50)`으로 변경.

- [ ] **Step 3: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/dashboard/OrderHistory.tsx
git commit -m "feat: show fill_price, order_type, signal link in OrderHistory"
```

---

## Task 4: PositionsTable 개선 — 시장가치 컬럼 추가

**Files:**
- Modify: `frontend/src/components/dashboard/PositionsTable.tsx:23-31`

- [ ] **Step 1: market_value 컬럼 추가**

기존 7컬럼에 시장가치(market_value) 컬럼 추가. 기존 "Current" 뒤에 삽입:

```tsx
{/* 헤더에 추가 */}
<th className="text-right">시장가치</th>

{/* 바디에 추가 (current_price td 뒤) */}
<td className="text-right">{(pos.market_value || pos.current_price * pos.quantity).toLocaleString()}</td>
```

- [ ] **Step 2: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/dashboard/PositionsTable.tsx
git commit -m "feat: add market_value column to PositionsTable"
```

---

## Task 5: PerformanceChart 개선 — 올바른 엔드포인트 + 기간 선택기

**Files:**
- Modify: `frontend/src/components/dashboard/PerformanceChart.tsx`

- [ ] **Step 1: 기간 선택기 state 추가 및 엔드포인트 변경**

기존에 `/api/reports/performance/history?days=30`을 직접 fetch하던 것을 `getPerformance(period)` API 함수로 교체하고, 기간 선택기를 추가:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { getPerformance } from '../../services/api';
import { parseUTC } from '../../utils/time';

interface Props {
  refreshTrigger?: number;
}

const PERIODS = [
  { label: '1일', value: '1d' },
  { label: '7일', value: '7d' },
  { label: '30일', value: '30d' },
  { label: '90일', value: '90d' },
];

export default function PerformanceChart({ refreshTrigger }: Props) {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState<{ returns_pct: number; max_drawdown: number; trade_count: number; chart_data: Array<{ timestamp: string; total_value: number; total_pnl: number; total_pnl_pct: number }> } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const result = await getPerformance(period);
      setData(result);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData, refreshTrigger]);
```

- [ ] **Step 2: 기간 선택기 UI 렌더링**

차트 헤더에 기간 선택 버튼 그룹 추가:

```tsx
{/* 카드 헤더에 기간 선택기 */}
<div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <h3>성과 차트</h3>
  <div className="period-selector" style={{ display: 'flex', gap: '4px' }}>
    {PERIODS.map((p) => (
      <button
        key={p.value}
        className={`btn btn-sm ${period === p.value ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => setPeriod(p.value)}
      >
        {p.label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: 성과 지표 표시 (returns_pct, max_drawdown, trade_count)**

차트 하단에 지표 요약 추가:

```tsx
{data && (
  <div className="performance-stats" style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.85rem' }}>
    <span className={data.returns_pct >= 0 ? 'text-positive' : 'text-negative'}>
      수익률 {data.returns_pct >= 0 ? '+' : ''}{data.returns_pct.toFixed(2)}%
    </span>
    <span className="text-negative">최대낙폭 {data.max_drawdown.toFixed(2)}%</span>
    <span className="text-muted">거래 {data.trade_count}건</span>
  </div>
)}
```

- [ ] **Step 4: chart_data 기반 SVG 렌더링으로 전환**

기존 history 배열 대신 `data.chart_data`를 사용하여 SVG 포인트 계산:

```tsx
const points = data.chart_data.map((pt, i) => {
  const x = (i / Math.max(data.chart_data.length - 1, 1)) * 100;
  const minVal = Math.min(...data.chart_data.map(d => d.total_value));
  const maxVal = Math.max(...data.chart_data.map(d => d.total_value));
  const range = maxVal - minVal || 1;
  const y = 100 - ((pt.total_value - minVal) / range) * 100;
  return `${x},${y}`;
}).join(' ');
```

- [ ] **Step 5: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/dashboard/PerformanceChart.tsx
git commit -m "feat: use correct performance endpoint with period selector and metrics"
```

---

## Task 6: SignalCard 개선 — 전문가 의견 펼침 + risk_notes 표시

**Files:**
- Modify: `frontend/src/components/signals/SignalCard.tsx`

- [ ] **Step 1: 전문가 의견 펼침 토글 추가**

기존 expert_stances 칩 표시(102-110번줄)를 클릭 시 상세 보기로 변경:

**주의:** `expert_stances`는 `Record<string, string>` (예: `{"기술분석가": "bullish", "모멘텀트레이더": "bearish"}`)이므로 `Object.entries()`를 사용해야 한다. 배열이 아님.

```tsx
{/* 기존 expert_stances 칩 영역을 교체 */}
{signal.expert_stances && Object.keys(signal.expert_stances).length > 0 && (
  <div className="signal-section">
    <div
      className="section-header"
      style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      onClick={() => setExpandedExperts(!expandedExperts)}
    >
      <span className="section-label">전문가 패널</span>
      <span style={{ fontSize: '0.75rem' }}>{expandedExperts ? '▲' : '▼'}</span>
    </div>
    <div className="expert-chips">
      {Object.entries(signal.expert_stances).map(([name, stance]) => (
        <span key={name} className={`expert-chip stance-${stance}`} title={name}>
          {name.split(' ')[0]}
        </span>
      ))}
    </div>
    {expandedExperts && (
      <div className="expert-details" style={{ marginTop: '8px', fontSize: '0.8rem' }}>
        {Object.entries(signal.expert_stances).map(([name, stance]) => (
          <div key={name} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{name}</strong>
              <span className={`badge stance-${stance}`}>{stance}</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 2: expandedExperts state 추가**

컴포넌트 상단에 state 추가:

```tsx
const [expandedExperts, setExpandedExperts] = useState(false);
```

- [ ] **Step 3: risk_notes 표시 추가**

variant_view 섹션 아래(99번줄 이후)에 추가:

```tsx
{signal.risk_notes && (
  <div className="signal-section">
    <span className="section-label">리스크 노트</span>
    <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>{signal.risk_notes}</p>
  </div>
)}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/signals/SignalCard.tsx
git commit -m "feat: add expert opinion expansion and risk_notes display to SignalCard"
```

---

## Task 7: 시그널 상세 모달 컴포넌트 생성

**Files:**
- Create: `frontend/src/components/signals/SignalDetailModal.tsx`
- Modify: `frontend/src/components/dashboard/SignalPanel.tsx`

- [ ] **Step 1: SignalDetailModal 컴포넌트 생성**

```tsx
import { useState, useEffect } from 'react';
import { getSignal, getOrders } from '../../services/api';
import { Signal, Order } from '../../types';
import { SignalCard } from '../signals/SignalCard';
import { parseUTC } from '../../utils/time';

interface Props {
  signalId: number;
  onClose: () => void;
}

export default function SignalDetailModal({ signalId, onClose }: Props) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [relatedOrders, setRelatedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sig, ordersRes] = await Promise.all([
          getSignal(signalId),
          getOrders(100),
        ]);
        setSignal(sig);
        setRelatedOrders(
          ordersRes.orders.filter((o: Order) => o.signal_id === signalId)
        );
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, [signalId]);

  if (loading) return <div className="modal-overlay" onClick={onClose}><div className="modal-content"><p>로딩 중...</p></div></div>;
  if (!signal) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px', maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3>시그널 상세 #{signal.id}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <SignalCard signal={signal} />

        {relatedOrders.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4>관련 주문</h4>
            <table className="table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>시간</th>
                  <th>구분</th>
                  <th className="text-right">수량</th>
                  <th className="text-right">체결가</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {relatedOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{parseUTC(order.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span className={`badge badge-${order.side === 'buy' ? 'long' : 'short'}`}>{order.side === 'buy' ? '매수' : '매도'}</span></td>
                    <td className="text-right">{order.quantity.toLocaleString()}</td>
                    <td className="text-right">{order.fill_price ? order.fill_price.toLocaleString() : '-'}</td>
                    <td><span className={`badge status-${order.status}`}>{order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {relatedOrders.length === 0 && signal.status !== 'pending' && (
          <p className="text-muted" style={{ marginTop: '12px', fontSize: '0.85rem' }}>
            관련 주문 없음
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: SignalPanel에 모달 연동**

`SignalPanel.tsx`에서 SignalCard 클릭 시 모달 표시:

```tsx
// state 추가
const [selectedSignalId, setSelectedSignalId] = useState<number | null>(null);

// SignalCard 렌더링 부분을 감싸기
<div onClick={() => setSelectedSignalId(signal.id)} style={{ cursor: 'pointer' }}>
  <SignalCard signal={signal} onApprove={handleApprove} onReject={handleReject} />
</div>

// 모달 렌더링 (컴포넌트 하단)
{selectedSignalId && (
  <SignalDetailModal
    signalId={selectedSignalId}
    onClose={() => setSelectedSignalId(null)}
  />
)}
```

- [ ] **Step 3: 모달 CSS 추가**

`frontend/src/index.css`에 모달 스타일 추가:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 90%;
}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/signals/SignalDetailModal.tsx frontend/src/components/dashboard/SignalPanel.tsx frontend/src/index.css
git commit -m "feat: add SignalDetailModal with related orders drilldown"
```

---

## Task 8: ReportViewer 개선 — 거래 PnL 표시

**Files:**
- Modify: `frontend/src/components/ReportViewer.tsx`

> **참고:** 백엔드 목록 API(`GET /api/reports`)는 `content` 필드를 반환하지 않으므로 (성능상 제외) 목록에서 서술 미리보기는 불가. 상세 조회 시에만 표시됨. content 미리보기는 백엔드 수정 후 추가 가능.

- [ ] **Step 1: 거래 테이블에 PnL 컬럼 추가**

거래 테이블(189-215번줄)에 pnl 컬럼 추가:

```tsx
{/* thead에 컬럼 추가 */}
<th className="text-right">손익</th>

{/* tbody의 각 거래 행에 추가 */}
<td className={`text-right ${trade.pnl && trade.pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
  {trade.pnl !== undefined && trade.pnl !== null
    ? `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString()}원`
    : '-'}
</td>
```

- [ ] **Step 3: 시그널 요약에 rr_score 강조 표시**

시그널 요약 그리드(218-232번줄)에서 rr_score를 더 눈에 띄게:

```tsx
{/* rr_score 표시 부분을 색상 코딩으로 강화 */}
<span className={`badge ${sig.rr_score >= 3 ? 'badge-positive' : sig.rr_score >= 1 ? 'badge-neutral' : 'badge-negative'}`}>
  R/R {sig.rr_score.toFixed(1)}
</span>
```

- [ ] **Step 4: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/ReportViewer.tsx
git commit -m "feat: add content preview and trade PnL to ReportViewer"
```

---

## Task 9: AgentWorkflow 개선 — 스케줄 편집 + 즉시 실행

**Files:**
- Create: `frontend/src/components/dashboard/ScheduleManager.tsx`
- Modify: `frontend/src/components/AgentWorkflow.tsx`

- [ ] **Step 1: ScheduleManager 컴포넌트 생성**

```tsx
import { useState, useEffect } from 'react';
import { getTasks, updateTask, runTaskNow } from '../../services/api';
import { ScheduledTask } from '../../types';

export default function ScheduleManager() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [cronInput, setCronInput] = useState('');
  const [running, setRunning] = useState<number | null>(null);

  const fetchTasks = async () => {
    try {
      const res = await getTasks();
      setTasks(res.tasks);
    } catch { /* silent */ }
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleToggle = async (task: ScheduledTask) => {
    await updateTask(task.id, { enabled: !task.enabled });
    fetchTasks();
  };

  const handleSaveCron = async (taskId: number) => {
    if (!cronInput.trim()) return;
    await updateTask(taskId, { cron_expression: cronInput });
    setEditing(null);
    fetchTasks();
  };

  const handleRunNow = async (taskId: number) => {
    setRunning(taskId);
    try {
      await runTaskNow(taskId);
    } catch { /* silent */ }
    finally {
      setRunning(null);
      fetchTasks();
    }
  };

  return (
    <div className="schedule-manager">
      <h4>스케줄 관리</h4>
      <table className="table" style={{ fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th>작업</th>
            <th>Cron</th>
            <th>다음 실행</th>
            <th>상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>{task.name}</td>
              <td>
                {editing === task.id ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      value={cronInput}
                      onChange={(e) => setCronInput(e.target.value)}
                      style={{ width: '120px', fontSize: '0.8rem' }}
                      placeholder="*/30 * * * *"
                    />
                    <button className="btn btn-sm btn-primary" onClick={() => handleSaveCron(task.id)}>저장</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>취소</button>
                  </div>
                ) : (
                  <code
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setEditing(task.id); setCronInput(task.cron_expression); }}
                    title="클릭하여 편집"
                  >
                    {task.cron_expression}
                  </code>
                )}
              </td>
              <td className="text-muted">{task.next_run_computed || '-'}</td>
              <td>
                <button
                  className={`btn btn-sm ${task.enabled ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handleToggle(task)}
                >
                  {task.enabled ? 'ON' : 'OFF'}
                </button>
              </td>
              <td>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleRunNow(task.id)}
                  disabled={running === task.id}
                >
                  {running === task.id ? '실행 중...' : '즉시 실행'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: AgentWorkflow에 ScheduleManager 통합**

`AgentWorkflow.tsx`의 AgentDetailPanel(148-236번줄) Col 3 영역에서 스케줄을 읽기 전용으로 보여주던 부분을 `ScheduleManager`로 교체:

```tsx
// import 추가
import ScheduleManager from './dashboard/ScheduleManager';

// AgentDetailPanel 하단 또는 EventTimeline 아래에 추가
<ScheduleManager />
```

- [ ] **Step 3: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/dashboard/ScheduleManager.tsx frontend/src/components/AgentWorkflow.tsx
git commit -m "feat: add ScheduleManager with cron editing and run-now button"
```

---

## Task 10: SettingsView 개선 — initial_capital + min_rr_score 편집

> **백엔드 선행 수정 필요:** `min_rr_score`는 현재 `GET /api/agents/risk-config` 응답과 `RiskConfigUpdate` 모델에 포함되지 않음. 이 Task 실행 전에 `backend/app/routers/agents.py`의 risk-config GET 응답 dict에 `min_rr_score` 키를 추가하고, `RiskConfigUpdate` Pydantic 모델에 `min_rr_score: float | None = None` 필드를 추가해야 함. `initial_capital`은 이미 백엔드에서 지원됨.

**Files:**
- Modify: `backend/app/routers/agents.py:71-111` (백엔드 선행 수정)
- Modify: `frontend/src/components/SettingsView.tsx:256-447`

- [ ] **Step 1: initial_capital 입력 필드 추가**

리스크 관리 섹션(256번줄 이후) 상단에 초기 자본금 설정 추가:

```tsx
{/* stop_loss_pct 슬라이더 바로 위에 추가 */}
<div className="setting-row">
  <label className="setting-label">초기 자본금</label>
  <div className="setting-control">
    <input
      type="number"
      value={riskForm.initial_capital ?? 10000000}
      onChange={(e) => setRiskForm({ ...riskForm, initial_capital: Number(e.target.value) })}
      step={1000000}
      min={1000000}
      max={1000000000}
      style={{ width: '160px' }}
    />
    <span className="text-muted" style={{ marginLeft: '8px' }}>
      {((riskForm.initial_capital ?? 10000000) / 10000).toLocaleString()}만원
    </span>
  </div>
</div>
```

- [ ] **Step 2: min_rr_score 슬라이더 추가**

signal_approval_mode 토글(385번줄) 아래에 추가:

```tsx
{/* signal_approval_mode 아래에 추가 */}
<div className="setting-row">
  <label className="setting-label">최소 R/R 스코어</label>
  <div className="setting-control">
    <input
      type="range"
      min={0.5}
      max={5.0}
      step={0.1}
      value={riskForm.min_rr_score ?? 2.0}
      onChange={(e) => setRiskForm({ ...riskForm, min_rr_score: Number(e.target.value) })}
    />
    <span className="setting-value">{(riskForm.min_rr_score ?? 2.0).toFixed(1)}</span>
  </div>
  <p className="setting-desc text-muted">시그널 R/R 스코어가 이 값 미만이면 자동 거부됩니다</p>
</div>
```

- [ ] **Step 3: riskForm 초기값에 새 필드 반영**

`DEFAULT_RISK` 상수(19-26번줄)에 필드 추가:

```typescript
const DEFAULT_RISK: RiskConfig = {
  stop_loss_pct: -3.0,
  take_profit_pct: 5.0,
  max_positions: 5,
  max_position_weight_pct: 20,
  max_daily_loss: 500000,
  signal_approval_mode: 'manual',
  initial_capital: 10000000,
  min_rr_score: 2.0,
};
```

- [ ] **Step 4: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/SettingsView.tsx
git commit -m "feat: add initial_capital and min_rr_score settings to SettingsView"
```

---

## Task 11: DashboardView 레이아웃 정리 + 이벤트 핸들링 강화

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx:50-73`

- [ ] **Step 1: report.generated 이벤트 핸들링 추가**

기존 WS 이벤트 핸들러(50-73번줄)에 report 이벤트 추가:

```tsx
// 기존 이벤트 핸들러에 추가
if (evt.event_type === 'report.generated') {
  setTriggers(prev => ({ ...prev, report: Date.now() }));
}
```

triggers state에 `report` 필드 추가:

```tsx
const [triggers, setTriggers] = useState({ signal: 0, order: 0, portfolio: 0, agent: 0, report: 0 });
```

- [ ] **Step 2: 빌드 확인**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/DashboardView.tsx
git commit -m "feat: add report.generated event handling in DashboardView"
```

---

## Task 12: 최종 통합 빌드 + lint 검증

**Files:**
- All modified files

- [ ] **Step 1: 전체 TypeScript 검증**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 2: ESLint 검증**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npm run lint`
Expected: PASS (0 errors, warnings acceptable)

- [ ] **Step 3: Vite 빌드 테스트**

Run: `cd /Users/lsr/Documents/github/trading-agent/frontend && npx vite build`
Expected: PASS (build output in dist/)

- [ ] **Step 4: lint/type 오류가 있으면 수정 후 커밋**

```bash
git add -A
git commit -m "fix: resolve lint and type errors from frontend improvements"
```

---

## 요약

| Task | 설명 | 새 파일 | 수정 파일 |
|------|------|---------|----------|
| 1 | API 서비스 누락 함수 8개 추가 | - | api.ts |
| 2 | 타입 정의 보강 (RiskConfig, Order, PerformanceData) | - | types.ts |
| 3 | OrderHistory: 체결가, 주문유형, 시그널 링크 | - | OrderHistory.tsx |
| 4 | PositionsTable: 시장가치 컬럼 | - | PositionsTable.tsx |
| 5 | PerformanceChart: 올바른 엔드포인트 + 기간 선택기 | - | PerformanceChart.tsx |
| 6 | SignalCard: 전문가 의견 펼침 + risk_notes | - | SignalCard.tsx |
| 7 | SignalDetailModal: 시그널 드릴다운 + 관련 주문 | SignalDetailModal.tsx | SignalPanel.tsx, index.css |
| 8 | ReportViewer: 서술 미리보기 + 거래 PnL | - | ReportViewer.tsx |
| 9 | ScheduleManager: 스케줄 편집 + 즉시 실행 | ScheduleManager.tsx | AgentWorkflow.tsx |
| 10 | SettingsView: initial_capital + min_rr_score | - | SettingsView.tsx |
| 11 | DashboardView: report 이벤트 핸들링 | - | DashboardView.tsx |
| 12 | 최종 통합 빌드 + lint 검증 | - | all |
