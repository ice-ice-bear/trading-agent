# backend/tests/test_dart_client.py
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.dart_client import DartClient


@pytest.fixture
def disabled_client():
    """DartClient with no API key."""
    with patch("app.services.dart_client.settings") as mock_settings:
        mock_settings.dart_api_key = None
        client = DartClient()
    return client


@pytest.mark.asyncio
async def test_fetch_returns_all_d_grades_when_disabled(disabled_client):
    result = await disabled_client.fetch("005930")
    assert result["enabled"] is False
    assert result["confidence_grades"]["dart_per"] == "D"
    assert result["confidence_grades"]["dart_revenue"] == "D"
    assert result["confidence_grades"]["dart_operating_profit"] == "D"
    assert result["financials"] is None


@pytest.mark.asyncio
async def test_fetch_returns_grade_d_on_http_error():
    with patch("app.services.dart_client.settings") as mock_settings:
        mock_settings.dart_api_key = "test_key"
        client = DartClient()

    with patch.object(client, "_get_corp_code", return_value=None):
        result = await client.fetch("999999")  # unknown stock code
    assert result["confidence_grades"]["dart_per"] == "D"
    assert result["financials"] is None


def test_dart_client_disabled_when_no_api_key():
    with patch("app.services.dart_client.settings") as mock_settings:
        mock_settings.dart_api_key = None
        client = DartClient()
    assert client.enabled is False


def test_dart_client_enabled_when_api_key_present():
    with patch("app.services.dart_client.settings") as mock_settings:
        mock_settings.dart_api_key = "some_key"
        client = DartClient()
    assert client.enabled is True
