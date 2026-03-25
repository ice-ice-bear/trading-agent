# backend/app/models/signal.py
from pydantic import BaseModel, field_validator, model_validator


class Scenario(BaseModel):
    label: str = ""                # "강세" / "기본" / "약세"
    price_target: float = 0.0     # absolute price target (KRW)
    upside_pct: float = 0.0       # % from current price (negative = downside)
    probability: float = 0.0      # 0.0–1.0

    @field_validator("price_target", "upside_pct", "probability", mode="before")
    @classmethod
    def coerce_numeric(cls, v):
        """Handle string numbers, None, and comma-separated values from LLM."""
        if v is None:
            return 0.0
        if isinstance(v, str):
            v = v.replace(",", "").replace("%", "").strip()
            if not v:
                return 0.0
        return float(v)

    @model_validator(mode="before")
    @classmethod
    def normalize_field_names(cls, data):
        """Map common LLM field name variants to expected names."""
        if not isinstance(data, dict):
            return data
        aliases = {
            "target_price": "price_target",
            "target": "price_target",
            "price": "price_target",
            "upside": "upside_pct",
            "return_pct": "upside_pct",
            "expected_return": "upside_pct",
            "prob": "probability",
            "weight": "probability",
            "name": "label",
            "scenario": "label",
        }
        normalized = {}
        for k, v in data.items():
            key = aliases.get(k, k)
            normalized[key] = v
        return normalized


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
