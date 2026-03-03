"""Scheduled task management API router."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.agents.base import AgentContext
from app.agents.engine import agent_engine
from app.models.db import execute_query
from app.services.scheduler import trading_scheduler

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskUpdate(BaseModel):
    cron_expression: str | None = None
    enabled: bool | None = None


@router.get("")
async def list_tasks():
    """List all scheduled tasks with their status."""
    tasks = await execute_query("SELECT * FROM scheduled_tasks ORDER BY name")
    scheduler_status = trading_scheduler.get_tasks_status()
    status_map = {s["name"]: s["next_run"] for s in scheduler_status}

    for task in tasks:
        task["next_run_computed"] = status_map.get(task["name"])

    return {"tasks": tasks}


@router.put("/{task_id}")
async def update_task(task_id: int, body: TaskUpdate):
    """Update a scheduled task."""
    task = await execute_query(
        "SELECT * FROM scheduled_tasks WHERE id = ?",
        (task_id,),
        fetch_one=True,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = []
    params = []
    if body.cron_expression is not None:
        updates.append("cron_expression = ?")
        params.append(body.cron_expression)
    if body.enabled is not None:
        updates.append("enabled = ?")
        params.append(1 if body.enabled else 0)

    if updates:
        params.append(task_id)
        await execute_query(
            f"UPDATE scheduled_tasks SET {', '.join(updates)} WHERE id = ?",
            tuple(params),
        )
        await trading_scheduler.reload_tasks()

    updated = await execute_query(
        "SELECT * FROM scheduled_tasks WHERE id = ?",
        (task_id,),
        fetch_one=True,
    )
    return {"task": updated}


@router.post("/{task_id}/run-now")
async def run_task_now(task_id: int):
    """Trigger a scheduled task to run immediately."""
    task = await execute_query(
        "SELECT * FROM scheduled_tasks WHERE id = ?",
        (task_id,),
        fetch_one=True,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    agent_id = task["agent_id"]
    context = AgentContext(trigger="scheduled")
    result = await agent_engine.run_agent(agent_id, context)

    await execute_query(
        """UPDATE scheduled_tasks
           SET last_run = datetime('now'), last_status = ?
           WHERE id = ?""",
        ("success" if result.success else "error", task_id),
    )

    return {
        "task_id": task_id,
        "agent_id": agent_id,
        "success": result.success,
        "summary": result.summary,
    }
