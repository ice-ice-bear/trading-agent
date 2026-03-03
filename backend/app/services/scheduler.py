"""Trading scheduler — APScheduler integration with market hours awareness."""

import logging
from datetime import time, timezone, timedelta, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.models.db import execute_query

logger = logging.getLogger(__name__)

# KST = UTC+9
KST = timezone(timedelta(hours=9))
KRX_OPEN = time(9, 0)
KRX_CLOSE = time(15, 30)


class TradingScheduler:
    """Market-hours-aware task scheduler using APScheduler."""

    def __init__(self):
        self._scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
        self._started = False
        self._agent_runner = None  # Set after agent_engine is available

    def set_agent_runner(self, runner) -> None:
        """Set the async function to run agents. Called from main.py after agent_engine init."""
        self._agent_runner = runner

    async def start(self) -> None:
        """Start the scheduler and load tasks from database."""
        if self._started:
            return

        await self._load_tasks_from_db()
        self._scheduler.start()
        self._started = True
        logger.info("Trading scheduler started")

    async def stop(self) -> None:
        """Shut down the scheduler."""
        if self._started:
            self._scheduler.shutdown(wait=False)
            self._started = False
            logger.info("Trading scheduler stopped")

    async def _load_tasks_from_db(self) -> None:
        """Load scheduled tasks from database and register with APScheduler."""
        tasks = await execute_query("SELECT * FROM scheduled_tasks WHERE enabled = 1")
        if not tasks:
            logger.info("No enabled scheduled tasks found")
            return

        for task in tasks:
            self._add_job(task)
        logger.info(f"Loaded {len(tasks)} scheduled tasks")

    def _add_job(self, task: dict) -> None:
        """Add a single job to the APScheduler."""
        job_id = f"task_{task['name']}"
        cron_expr = task["cron_expression"]
        agent_id = task["agent_id"]

        # Remove existing job if any
        existing = self._scheduler.get_job(job_id)
        if existing:
            self._scheduler.remove_job(job_id)

        try:
            parts = cron_expr.split()
            if len(parts) == 5:
                trigger = CronTrigger(
                    minute=parts[0],
                    hour=parts[1],
                    day=parts[2],
                    month=parts[3],
                    day_of_week=parts[4],
                    timezone="Asia/Seoul",
                )
            else:
                logger.error(f"Invalid cron expression for {task['name']}: {cron_expr}")
                return

            self._scheduler.add_job(
                self._run_agent_task,
                trigger=trigger,
                id=job_id,
                args=[agent_id, task["name"]],
                replace_existing=True,
                misfire_grace_time=60,
            )
            logger.info(f"Scheduled task '{task['name']}' -> agent '{agent_id}' ({cron_expr})")
        except Exception as e:
            logger.error(f"Failed to schedule task '{task['name']}': {e}")

    async def _run_agent_task(self, agent_id: str, task_name: str) -> None:
        """Execute a scheduled agent task."""
        if not self._agent_runner:
            logger.error("Agent runner not set, cannot run scheduled task")
            return

        logger.info(f"Scheduler executing: {task_name} -> {agent_id}")
        try:
            result = await self._agent_runner(agent_id)
            status = "success" if result.success else "error"
        except Exception as e:
            logger.error(f"Scheduled task {task_name} failed: {e}")
            status = "error"

        # Update task last_run
        await execute_query(
            """UPDATE scheduled_tasks
               SET last_run = datetime('now'), last_status = ?
               WHERE name = ?""",
            (status, task_name),
        )

    async def reload_tasks(self) -> None:
        """Reload tasks from database (after config change)."""
        # Remove all existing jobs
        for job in self._scheduler.get_jobs():
            if job.id.startswith("task_"):
                self._scheduler.remove_job(job.id)
        await self._load_tasks_from_db()

    def get_tasks_status(self) -> list[dict]:
        """Get status of all scheduled jobs."""
        jobs = []
        for job in self._scheduler.get_jobs():
            if job.id.startswith("task_"):
                jobs.append({
                    "job_id": job.id,
                    "name": job.id.replace("task_", ""),
                    "next_run": str(job.next_run_time) if job.next_run_time else None,
                })
        return jobs

    @property
    def is_running(self) -> bool:
        return self._started

    @staticmethod
    def is_market_hours() -> bool:
        """Check if current time is within KRX market hours (09:00-15:30 KST, weekdays)."""
        now = datetime.now(KST)
        if now.weekday() >= 5:  # Saturday/Sunday
            return False
        current_time = now.time()
        return KRX_OPEN <= current_time <= KRX_CLOSE


# Singleton
trading_scheduler = TradingScheduler()
