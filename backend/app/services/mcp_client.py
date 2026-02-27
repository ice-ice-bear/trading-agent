import logging
from typing import Any

from fastmcp import Client

from app.config import settings

logger = logging.getLogger(__name__)


class MCPClientManager:
    """Manages connection to the KIS Trading MCP server."""

    def __init__(self):
        self._client: Client | None = None
        self._tools: list[dict] = []
        self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def tools(self) -> list[dict]:
        return self._tools

    async def connect(self) -> None:
        """Connect to MCP server and fetch tool definitions."""
        try:
            self._client = Client(settings.mcp_server_url)
            await self._client.__aenter__()
            self._connected = True
            await self._refresh_tools()
            logger.info(
                f"Connected to MCP server at {settings.mcp_server_url} "
                f"with {len(self._tools)} tools"
            )
        except Exception as e:
            self._connected = False
            logger.error(f"Failed to connect to MCP server: {e}")
            raise

    async def disconnect(self) -> None:
        """Disconnect from MCP server."""
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception as e:
                logger.warning(f"Error disconnecting from MCP server: {e}")
            finally:
                self._client = None
                self._connected = False
                self._tools = []

    async def _refresh_tools(self) -> None:
        """Fetch tool definitions from MCP server."""
        if not self._client:
            return
        result = await self._client.list_tools()
        self._tools = []
        for tool in result:
            claude_tool = {
                "name": tool.name,
                "description": tool.description or "",
                "input_schema": tool.inputSchema,
            }
            self._tools.append(claude_tool)

    def get_claude_tools(self) -> list[dict]:
        """Return tools formatted for Claude API."""
        return self._tools

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        """Execute an MCP tool and return the result as a string."""
        if not self._client or not self._connected:
            return "Error: MCP server not connected"

        # Safety: override env_dv based on current trading mode
        if "params" in arguments and isinstance(arguments["params"], dict):
            from app.services.runtime_settings import runtime_settings
            if runtime_settings.get("trading_mode") == "demo":
                if arguments["params"].get("env_dv") == "real":
                    arguments["params"]["env_dv"] = "demo"

        try:
            logger.info(f"Calling MCP tool: {name} with args: {arguments}")
            result = await self._client.call_tool(name, arguments)

            # Extract text content from CallToolResult
            if hasattr(result, "content"):
                parts = []
                for item in result.content:
                    if hasattr(item, "text"):
                        parts.append(item.text)
                    else:
                        parts.append(str(item))
                return "\n".join(parts)
            if isinstance(result, list):
                parts = []
                for item in result:
                    if hasattr(item, "text"):
                        parts.append(item.text)
                    else:
                        parts.append(str(item))
                return "\n".join(parts)
            return str(result)
        except Exception as e:
            logger.error(f"MCP tool call failed: {name}: {e}")
            return f"Error calling tool {name}: {e}"


# Singleton instance
mcp_manager = MCPClientManager()
