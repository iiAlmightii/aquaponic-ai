# AquaponicAI Quickstart

This guide gives you the fastest path to run the project.

## Option 1: Run everything with Docker (recommended)

### 1. Prerequisites
- Docker
- Docker Compose plugin

Check:

```bash
docker --version
docker compose version
```

### 2. Prepare environment file
From project root:

```bash
cp .env.example .env
```

Edit .env and set at least:
- POSTGRES_PASSWORD
- SECRET_KEY
- JWT_SECRET_KEY

Generate secure secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Paste one value into SECRET_KEY and one into JWT_SECRET_KEY.

### 3. Start services

```bash
docker compose up --build
```

If you want it in background:

```bash
docker compose up -d --build
```

### 4. Open the app
- App (via Nginx): http://localhost
- Frontend (direct): http://localhost:3001
- Backend API docs: http://localhost:8000/api/docs

Docker host-mapped data service ports:
- PostgreSQL: localhost:5433
- Redis: localhost:6380

### 5. Stop services

```bash
docker compose down
```

Reset all DB/cache volumes if needed:

```bash
docker compose down -v
```

### 6. Optional: install Whisper in backend container

Whisper is optional in Docker builds to improve reliability on slow networks.

```bash
docker compose exec backend pip install openai-whisper==20231117
```

---

### 7. Optional: Enable Google Sheets finance sync
The app can push financial planning inputs to Google Sheets and poll for changes to update charts in near real-time.

1. Create a Google Sheet with tabs `Inputs`, `Assumptions`, `Projections`, `Summary`, `AuditLog`.
2. Create a Google Cloud service account, download its JSON key, and set:
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` (or split `GOOGLE_SHEETS_CLIENT_EMAIL` + `GOOGLE_SHEETS_PRIVATE_KEY`)
3. Enable the frontend polling UI with `VITE_GOOGLE_SHEETS_ENABLED=true`.

---
## Option 2: Run locally (without Docker)

### 1. Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### 2. Create and configure .env
If not already done:

```bash
cp .env.example .env
```

For local Postgres and Redis, set these values in .env:

```env
DATABASE_URL=postgresql+asyncpg://aquaponic_user:123456@localhost:5432/aquaponic_ai
REDIS_URL=redis://localhost:6379/0
DEFAULT_LLM_PROVIDER=local
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
WEATHER_API_KEY=
MARKET_API_KEY=
```

Notes:
- You can leave paid API keys blank and the core app still runs.
- Your database must already exist (example: aquaponic_ai).

### 3. Start backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend is available at:
- http://localhost:8000
- Docs: http://localhost:8000/api/docs

### 4. Start frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (usually http://localhost:5173).

---

## Free and open-source setup notes
- Speech-to-text: Whisper is optional in Docker builds. You can install it later with:

```bash
docker compose exec backend pip install openai-whisper==20231117
```

- No API key is required for local Whisper.
- LLM: set DEFAULT_LLM_PROVIDER=local if you do not want paid providers.
- Weather/market keys are optional for basic run.

---

## Common issues

### Database connection refused
- Confirm PostgreSQL is running on localhost:5432.
- Confirm username/password in DATABASE_URL are correct.
- Confirm database aquaponic_ai exists.

### Redis connection error
- Start Redis locally or use Docker Redis.
- Verify REDIS_URL in .env.

### Frontend cannot call backend
- Confirm backend is running on port 8000.
- Confirm VITE_API_URL in .env points to http://localhost:8000/api/v1.

---

## One-command health checks

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/docs
```

If health returns a JSON response with status healthy, backend startup is successful.

## start
The build failed because your disk is full. Clean Docker first:


docker system prune -af --volumes
This removes unused images, containers, and volumes (safe — your running containers won't be touched until you stop them). Then retry:


docker compose build --no-cache frontend && docker compose up -d frontend
Will it work if you copy it elsewhere?

Yes, with one condition: you must copy the .env file too (it's gitignored, so not in git). The .env contains:

DATABASE_URL → your Supabase credentials
JWT_SECRET_KEY, SECRET_KEY
Any API keys (Anthropic, Google Sheets service account)
If you move the whole folder including .env, docker compose up --build will work identically on any machine with Docker installed.

---

## Audio Evaluation Pipeline (IEEE paper data collection)

This section is for collecting STT benchmark recordings from participants and running the WER evaluation comparing Whisper+normalization vs Sarvam Saarika v2.

### Step 1 — Enable eval mode

In `.env`, set:
```env
EVAL_MODE=true
SARVAM_API_KEY=your_sarvam_key_here   # get free key at https://dashboard.sarvam.ai
```

Then recreate the backend container to load the new vars:
```bash
docker compose up -d --no-deps backend
```

Verify the eval endpoint is live:
```bash
curl http://localhost:8000/api/v1/eval/status
# → {"status":"idle"}
```

### Step 2 — Expose the app publicly via ngrok

Install ngrok (snap, one-time):
```bash
sudo snap install ngrok
```

Sign up at https://ngrok.com (free), copy your auth token from the dashboard, then:
```bash
ngrok config add-authtoken <YOUR_TOKEN>
```

Expose port 80 (Nginx, which proxies both frontend and backend):
```bash
ngrok http 80
```

ngrok prints a URL like `https://abc123.ngrok-free.app`. **Share this URL with participants.**

### Step 3 — Participants record clips

Each participant opens `https://abc123.ngrok-free.app/eval/record` in their browser.

- Enter a unique name (e.g. `priya_01`, `rahul_02`) — no spaces
- Read each of the 40 sentences shown on screen, one at a time
- Record → Stop → re-record if needed → Next
- Takes about 5–7 minutes per participant

Clips are saved to `backend/data/eval_clips/<participant_id>/` with a `manifest.json` ground-truth index.

### Step 4 — Run the WER evaluation

Once all participants have finished, click **Run Evaluation** on the completion screen (or POST directly):
```bash
curl -s -X POST http://localhost:8000/api/v1/eval/run
```

Poll progress:
```bash
watch -n 3 'curl -s http://localhost:8000/api/v1/eval/status'
```

When `status` reaches `complete`, download results:
```bash
curl -o results.csv http://localhost:8000/api/v1/eval/results/csv
```

Full outputs are in `backend/eval/eval_results/`:
| File | Contents |
|---|---|
| `results.csv` | Per-clip WER for both systems |
| `summary.md` | Group-level WER table (paper-ready) |
| `wer_by_group.png` | Grouped bar chart for the paper |
| `agreement_analysis.md` | Clips both systems found hard |

### Sarvam free tier note

Sarvam Saarika v2 gives 500 min/month free. 8 participants × 40 clips × ~4 s ≈ **21 min** — well within the free quota.

---

##Other useful commands:


# Stop everything
docker compose down

# Stop but keep rebuilding from fresh (if you hit caching issues)
docker compose down && docker compose up --build

# Wipe all data (DB volumes too)
docker compose down -v

# View live logs
docker compose logs -f backend

# Check if everything is healthy
docker compose ps
Shortcut for dev (skip Docker, run locally):


# Terminal 1 — backend
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
The --reload flag in local mode means the backend auto-restarts whenever you edit a Python file — much faster for development than rebuilding Docker each time