# Bomatech API

FastAPI backend. Consumes `bomatech-engines` for calculations and `bomatech-ai` for LLM explanations.

## Install

```bash
uv sync
cp .env.example .env   # then fill in the values
```

## Run

```bash
uv run uvicorn app.main:app --reload --port 8000
```

OpenAPI at <http://localhost:8000/docs>.

## Endpoints (overview)

| Method | Path | Role |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/api/v1/state` | Current financial state |
| GET | `/api/v1/transactions` | List transactions |
| POST | `/api/v1/transactions` | Create a transaction |
| POST | `/api/v1/transactions/import/csv` | Import CSV |
| POST | `/api/v1/simulate` | Run a what-if scenario |
| GET | `/api/v1/forecast?months=6` | Cash projection |
| GET | `/api/v1/insights` | Current insights |
| POST | `/api/v1/upload` | Upload PDF for OCR |

## Auth

Uses Supabase JWT. The `Authorization: Bearer <jwt>` header is validated and the current company is resolved from `company_members`.

## Test

```bash
uv run pytest
```
