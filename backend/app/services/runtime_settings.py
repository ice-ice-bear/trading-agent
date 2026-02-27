import json
import logging
import os
from pathlib import Path
from threading import Lock

from app.config import settings as env_settings

logger = logging.getLogger(__name__)

SETTINGS_FILE = Path(__file__).parent.parent.parent / "settings.json"

VALID_MODELS = [
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-5-20251101",
    "claude-sonnet-4-6",
]

DEFAULTS = {
    "trading_mode": "demo",
    "claude_model": env_settings.claude_model,
    "claude_max_tokens": env_settings.claude_max_tokens,
}


class RuntimeSettings:
    """Thread-safe runtime settings with JSON file persistence."""

    def __init__(self):
        self._lock = Lock()
        self._data: dict = {}
        self._load()

    def _load(self):
        with self._lock:
            if SETTINGS_FILE.exists():
                try:
                    self._data = json.loads(SETTINGS_FILE.read_text("utf-8"))
                    logger.info(f"Loaded runtime settings from {SETTINGS_FILE}")
                except Exception:
                    logger.warning("Corrupt settings.json, using defaults")
                    self._data = dict(DEFAULTS)
            else:
                self._data = dict(DEFAULTS)

    def _persist(self):
        try:
            SETTINGS_FILE.write_text(
                json.dumps(self._data, indent=2, ensure_ascii=False), "utf-8"
            )
        except Exception as e:
            logger.error(f"Failed to persist settings: {e}")

    def get_all(self) -> dict:
        with self._lock:
            return dict(self._data)

    def get(self, key: str):
        with self._lock:
            return self._data.get(key, DEFAULTS.get(key))

    def update(self, patch: dict) -> dict:
        errors = []
        with self._lock:
            if "trading_mode" in patch:
                mode = patch["trading_mode"]
                if mode not in ("demo", "real"):
                    errors.append(f"Invalid trading_mode: {mode}")
                elif mode == "real":
                    if not os.getenv("KIS_APP_KEY"):
                        errors.append(
                            "실전투자 모드로 전환하려면 KIS_APP_KEY 환경변수가 필요합니다"
                        )

            if "claude_model" in patch:
                if patch["claude_model"] not in VALID_MODELS:
                    errors.append(f"Invalid model: {patch['claude_model']}")

            if "claude_max_tokens" in patch:
                val = patch["claude_max_tokens"]
                if not isinstance(val, int) or val < 256 or val > 32768:
                    errors.append("claude_max_tokens must be between 256 and 32768")

            if errors:
                raise ValueError("; ".join(errors))

            self._data.update(patch)
            self._persist()
            return dict(self._data)


runtime_settings = RuntimeSettings()
