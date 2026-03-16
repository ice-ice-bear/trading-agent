# backend/app/models/signal.py
from pydantic import BaseModel


class Scenario(BaseModel):
    label: str           # "강세" / "기본" / "약세"
    price_target: float  # absolute price target (KRW)
    upside_pct: float    # % from current price (negative = downside)
    probability: float   # 0.0–1.0


class SignalAnalysis(BaseModel):
    direction: str                      # "BUY" | "SELL" | "HOLD"
    bull: Scenario
    base: Scenario
    bear: Scenario
    rr_score: float                     # server-computed via compute_rr_score()
    variant_view: str                   # specific market misconception
    expert_stances: dict[str, str]      # expert name → "bullish"/"bearish"/"neutral"
    critic_result: str                  # "pass" | "fail" | "pending"
    critic_feedback: str | None = None


def compute_rr_score(bull: Scenario, base: Scenario, bear: Scenario) -> float:
    """
    R/R = (bull_upside * bull_prob + base_upside * base_prob)
          / max(abs(bear_upside * bear_prob), 0.01)

    The 0.01 floor prevents divide-by-zero.
    A zero-downside bear scenario → very high R/R (correct behavior).
    """
    numerator = (
        bull.upside_pct * bull.probability
        + base.upside_pct * base.probability
    )
    denominator = max(abs(bear.upside_pct * bear.probability), 0.01)
    return numerator / denominator
