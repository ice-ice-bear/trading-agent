import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)
router = APIRouter()


class SettingsUpdate(BaseModel):
    trading_mode: str | None = None
    claude_model: str | None = None
    claude_max_tokens: int | None = None


@router.get("/api/settings")
async def get_settings():
    return runtime_settings.get_all()


@router.put("/api/settings")
async def update_settings(body: SettingsUpdate):
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "No settings provided")
    try:
        new_state = runtime_settings.update(patch)
        logger.info(f"Settings updated: {patch}")
        return new_state
    except ValueError as e:
        raise HTTPException(422, str(e))
