.PHONY: install start stop mcp backend frontend health clean logs logs-mcp logs-backend logs-frontend

# Directories
ROOT_DIR := $(shell pwd)
MCP_DIR := $(ROOT_DIR)/open-trading-api/MCP/Kis Trading MCP
BACKEND_DIR := $(ROOT_DIR)/backend
FRONTEND_DIR := $(ROOT_DIR)/frontend

# Environment
ENV_FILE := $(ROOT_DIR)/.env

# Log files
LOG_DIR := $(ROOT_DIR)/.logs
MCP_LOG := $(LOG_DIR)/mcp.log
BACKEND_LOG := $(LOG_DIR)/backend.log
FRONTEND_LOG := $(LOG_DIR)/frontend.log

# Load nvm if available
NVM_INIT := export NVM_DIR="$$HOME/.nvm" && [ -s "$$NVM_DIR/nvm.sh" ] && . "$$NVM_DIR/nvm.sh"

# Background launcher: use setsid on Linux, nohup on macOS
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
  BG_RUN := nohup
else
  BG_RUN := setsid
endif

# Helper: kill all processes on a given port
define kill_port
	@pids=$$(lsof -ti :$(1) 2>/dev/null); \
	if [ -n "$$pids" ]; then \
		echo "  Stopping port $(1) (PIDs: $$pids)"; \
		echo "$$pids" | xargs kill -TERM 2>/dev/null; \
		sleep 1; \
		pids=$$(lsof -ti :$(1) 2>/dev/null); \
		if [ -n "$$pids" ]; then \
			echo "$$pids" | xargs kill -9 2>/dev/null; \
		fi; \
	fi
endef

# ===== Install =====
install: install-backend install-frontend
	@echo "All dependencies installed."

install-backend:
	@echo "Installing backend dependencies..."
	cd "$(BACKEND_DIR)" && uv sync

install-frontend:
	@echo "Installing frontend dependencies..."
	$(NVM_INIT) && cd "$(FRONTEND_DIR)" && npm install

# ===== Start all =====
start: stop
	@mkdir -p $(LOG_DIR)
	@echo "Starting all services..."
	@echo ""
	@cd "$(MCP_DIR)" && $(BG_RUN) env ENV_FILE="$(ENV_FILE)" uv run python server.py > "$(MCP_LOG)" 2>&1 &
	@echo "  [1/3] MCP server starting on :3000..."
	@sleep 3
	@cd "$(BACKEND_DIR)" && $(BG_RUN) env ENV_FILE="$(ENV_FILE)" uv run uvicorn app.main:app --reload --port 8000 > "$(BACKEND_LOG)" 2>&1 &
	@echo "  [2/3] Backend starting on :8000..."
	@sleep 2
	@$(NVM_INIT) && cd "$(FRONTEND_DIR)" && $(BG_RUN) npx vite --host > "$(FRONTEND_LOG)" 2>&1 &
	@echo "  [3/3] Frontend starting on :5173..."
	@sleep 2
	@echo ""
	@echo "==================================="
	@echo "  All services started!"
	@echo ""
	@echo "  MCP Server : http://localhost:3000"
	@echo "  Backend    : http://localhost:8000"
	@echo "  Frontend   : http://localhost:5173"
	@echo "==================================="
	@echo ""
	@echo "  make stop   - stop all services"
	@echo "  make logs   - tail all logs"
	@echo "  make health - check backend status"

# ===== Individual services =====
mcp:
	@mkdir -p $(LOG_DIR)
	@echo "Starting MCP server..."
	@cd "$(MCP_DIR)" && $(BG_RUN) env ENV_FILE="$(ENV_FILE)" uv run python server.py > "$(MCP_LOG)" 2>&1 &
	@sleep 2
	@echo "  MCP server running on :3000"

backend:
	@mkdir -p $(LOG_DIR)
	@echo "Starting backend..."
	@cd "$(BACKEND_DIR)" && $(BG_RUN) env ENV_FILE="$(ENV_FILE)" uv run uvicorn app.main:app --reload --port 8000 > "$(BACKEND_LOG)" 2>&1 &
	@sleep 2
	@echo "  Backend running on :8000"

frontend:
	@mkdir -p $(LOG_DIR)
	@echo "Starting frontend..."
	@$(NVM_INIT) && cd "$(FRONTEND_DIR)" && $(BG_RUN) npx vite --host > "$(FRONTEND_LOG)" 2>&1 &
	@sleep 2
	@echo "  Frontend running on :5173"

# ===== Stop =====
stop:
	@echo "Stopping services..."
	$(call kill_port,3000)
	$(call kill_port,8000)
	$(call kill_port,5173)
	@echo "All services stopped."

# ===== Health check =====
health:
	@echo "Checking health..."
	@curl -s http://localhost:8000/health | python3 -m json.tool 2>/dev/null || echo "Backend not reachable"

# ===== Status =====
status:
	@echo "Service status:"
	@printf "  MCP Server (:3000) - "; lsof -ti :3000 >/dev/null 2>&1 && echo "RUNNING" || echo "STOPPED"
	@printf "  Backend    (:8000) - "; lsof -ti :8000 >/dev/null 2>&1 && echo "RUNNING" || echo "STOPPED"
	@printf "  Frontend   (:5173) - "; lsof -ti :5173 >/dev/null 2>&1 && echo "RUNNING" || echo "STOPPED"

# ===== Logs =====
logs-mcp:
	@tail -f "$(MCP_LOG)"

logs-backend:
	@tail -f "$(BACKEND_LOG)"

logs-frontend:
	@tail -f "$(FRONTEND_LOG)"

logs:
	@tail -f "$(MCP_LOG)" "$(BACKEND_LOG)" "$(FRONTEND_LOG)"

# ===== Clean =====
clean: stop
	@echo "Cleaning build artifacts..."
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(FRONTEND_DIR)/node_modules/.vite
	rm -rf $(LOG_DIR)
	find "$(MCP_DIR)/tmp" -mindepth 1 -delete 2>/dev/null || true
	@echo "Clean complete."
