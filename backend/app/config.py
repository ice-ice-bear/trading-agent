from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    mcp_server_url: str = "http://localhost:3000/sse"
    claude_model: str = "claude-sonnet-4-5-20250929"
    claude_max_tokens: int = 4096

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
