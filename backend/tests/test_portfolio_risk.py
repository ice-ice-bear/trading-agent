"""포트폴리오 리스크 서비스 테스트"""
import pytest
from app.services.portfolio_risk_service import (
    calculate_historical_var,
    calculate_beta,
    compute_correlation_matrix,
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


def test_beta_perfect_correlation():
    """완벽한 상관관계 시 베타 = 1"""
    returns = [0.01, -0.02, 0.015, -0.005, 0.03, -0.01, 0.02, -0.015, 0.01, 0.005]
    beta = calculate_beta(returns, returns)
    assert abs(beta - 1.0) < 0.01


def test_beta_insufficient_data():
    """데이터 부족 시 기본값 1.0"""
    assert calculate_beta([0.01], [0.01]) == 1.0


def test_correlation_matrix_diagonal():
    """대각선은 모두 1.0"""
    returns_map = {
        "A": [0.01, -0.02, 0.015, -0.005, 0.03, -0.01, 0.02, -0.015, 0.01, 0.005],
        "B": [0.02, -0.01, 0.01, -0.01, 0.02, -0.02, 0.015, -0.01, 0.005, 0.01],
    }
    result = compute_correlation_matrix(returns_map)
    assert len(result["matrix"]) == 2
    assert result["matrix"][0][0] == 1.0
    assert result["matrix"][1][1] == 1.0
