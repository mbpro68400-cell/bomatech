.PHONY: help install dev test lint format clean migrate seed reset build

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nBomatech — dev commands\n\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install all dependencies (web + api)
	@echo "→ Installing web dependencies"
	cd apps/web && pnpm install
	@echo "→ Installing api dependencies"
	cd apps/api && uv sync

dev: ## Run web + api in parallel (requires tmux or 2 terminals)
	@echo "→ Start 2 terminals and run:"
	@echo "  1. cd apps/api && uv run uvicorn app.main:app --reload --port 8000"
	@echo "  2. cd apps/web && pnpm dev"

dev-api: ## Run backend only
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

dev-web: ## Run frontend only
	cd apps/web && pnpm dev

test: ## Run all tests
	cd packages/engines && uv run pytest -v
	cd apps/api && uv run pytest -v
	cd apps/web && pnpm test

test-engines: ## Run engines tests only (fastest)
	cd packages/engines && uv run pytest -v

lint: ## Lint all code
	cd apps/web && pnpm lint
	cd apps/api && uv run ruff check .
	cd packages/engines && uv run ruff check .

format: ## Format all code
	cd apps/web && pnpm format
	cd apps/api && uv run ruff format .
	cd packages/engines && uv run ruff format .

migrate: ## Apply Supabase migrations
	supabase db push

seed: ## Load demo data into local DB
	psql $(DATABASE_URL) < database/seeds/demo_data.sql

reset: ## Reset local Supabase (DROP + migrate + seed)
	supabase db reset
	$(MAKE) seed

clean: ## Clean build artifacts, caches, node_modules
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true

build: ## Production build
	cd apps/web && pnpm build
	cd apps/api && uv build
