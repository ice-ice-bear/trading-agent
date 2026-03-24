"""포트폴리오 리스크 서비스 테스트"""
import pytest
from app.services.portfolio_risk_service import (
    calculate_historical_var,
    _compute_returns,
)


def test_compute_returns_basic():
    """일일 수익률 계산 검증"""
    closes = [100, 105, 103, 110]
    returns = _compute_returns(closes)
    assert len(returns) == 3
    assert abs(returns[0] - 0.05) < 0.001   # (105-100)/100
    assert abs(returns[1] - (-0.019047)) < 0.001  # (103-105)/105
    assert abs(returns[2] - 0.06796) < 0.001  # (110-103)/103


def test_compute_returns_empty():
    """빈 배열 처리"""
    assert _compute_returns([]) == []
    assert _compute_returns([100]) == []


def test_var_basic():
    """VaR 95% 기본 검증"""
    # 100개의 수익률 데이터 (대부분 양수, 일부 음수)
    returns = [0.01] * 90 + [-0.05] * 10
    var = calculate_historical_var(returns, confidence=0.95)
    assert var > 0
    # VaR는 5번째 백분위수의 절대값 (약 5%)
    assert abs(var - 0.05) < 0.01


def test_var_insufficient_data():
    """데이터 부족 시 0 반환"""
    assert calculate_historical_var([0.01, 0.02], 0.95) == 0.0
    assert calculate_historical_var([], 0.95) == 0.0


def test_var_99_higher_than_95():
    """VaR 99%가 95%보다 크거나 같은지 검증"""
    returns = [0.01] * 80 + [-0.03] * 15 + [-0.08] * 5
    var_95 = calculate_historical_var(returns, 0.95)
    var_99 = calculate_historical_var(returns, 0.99)
    assert var_99 >= var_95
