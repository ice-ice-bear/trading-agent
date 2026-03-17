# backend/tests/test_event_persistence.py
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch

from app.agents.event_bus import EventBus, AgentEvent


@pytest.fixture
def bus():
    return EventBus()


@pytest.mark.asyncio
async def test_event_stored_in_history(bus):
    event = AgentEvent(event_type="test.event", agent_id="test")
    await bus.publish(event)
    await asyncio.sleep(0)  # yield to let create_task run
    history = bus.get_history(limit=10)
    assert len(history) == 1
    assert history[0]["event_type"] == "test.event"


@pytest.mark.asyncio
@patch("app.agents.event_bus.execute_insert", new_callable=AsyncMock)
async def test_event_persisted_to_db(mock_insert, bus):
    event = AgentEvent(
        event_type="signal.generated",
        agent_id="scanner",
        data={"signal_id": 1},
    )
    await bus.publish(event)
    await asyncio.sleep(0)  # yield to let create_task run
    mock_insert.assert_called_once()
    call_args = mock_insert.call_args
    assert "INSERT INTO agent_events" in call_args[0][0]
    params = call_args[0][1]
    assert params[0] == "signal.generated"
    assert params[1] == "scanner"
    assert json.loads(params[2]) == {"signal_id": 1}


@pytest.mark.asyncio
@patch("app.agents.event_bus.execute_insert", new_callable=AsyncMock)
async def test_db_error_does_not_block_event(mock_insert, bus):
    mock_insert.side_effect = Exception("DB error")
    event = AgentEvent(event_type="test.event", agent_id="test")
    # Should not raise
    await bus.publish(event)
    await asyncio.sleep(0)  # yield to let create_task run
    # Event still in memory history
    assert len(bus.get_history()) == 1
