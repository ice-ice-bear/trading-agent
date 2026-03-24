"""DCF 밸류에이션 서비스 테스트"""
import pytest
from app.services.valuation_service import compute_dcf, compute_sensitivity_table


def test_compute_dcf_basic():
    """기본 DCF 계산 검증"""
    result = compute_dcf(
        free_cash_flow=1_000_000_000_000,  # 1조원 FCF
        shares_outstanding=100_000_000,     # 1억주
        wacc=0.10,
        growth_rate=0.03,
        terminal_growth=0.02,
    )
    assert result["fair_value"] is not None
    assert result["fair_value"] > 0
    assert result["enterprise_value"] > 0
    assert len(result["projected_fcf"]) == 5
    # 각 년도 FCF가 증가하는지 확인
    fcfs = [p["fcf"] for p in result["projected_fcf"]]
    assert all(fcfs[i] < fcfs[i + 1] for i in range(len(fcfs) - 1))


def test_compute_dcf_negative_fcf():
    """음수 FCF 시 에러 반환"""
    result = compute_dcf(free_cash_flow=-500_000_000, shares_outstanding=100_000_000)
    assert result["fair_value"] is None
    assert "error" in result


def test_compute_dcf_zero_shares():
    """주식수 0 시 에러 반환"""
    result = compute_dcf(free_cash_flow=1_000_000_000, shares_outstanding=0)
    assert result["fair_value"] is None


def test_compute_dcf_higher_wacc_lower_value():
    """WACC가 높을수록 적정가가 낮아지는지 검증"""
    low_wacc = compute_dcf(1_000_000_000_000, 100_000_000, wacc=0.08)
    high_wacc = compute_dcf(1_000_000_000_000, 100_000_000, wacc=0.15)
    assert low_wacc["fair_value"] > high_wacc["fair_value"]


def test_sensitivity_table_shape():
    """민감도 테이블 3x3 형태 검증"""
    table = compute_sensitivity_table(1_000_000_000_000, 100_000_000)
    assert len(table) == 3  # 3 WACC rows
    assert all(len(row) == 3 for row in table)  # 3 growth columns each
    # All values should be positive
    assert all(v > 0 for row in table for v in row if v is not None)


def test_sensitivity_table_monotonic():
    """WACC 증가 시 적정가 감소 (같은 growth rate에서)"""
    table = compute_sensitivity_table(1_000_000_000_000, 100_000_000)
    # Column 0 (growth=0.02): WACC 0.08 > 0.10 > 0.12
    assert table[0][0] > table[1][0] > table[2][0]
