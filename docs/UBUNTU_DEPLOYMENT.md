# Ubuntu Deployment Guide — AquaponicAI (FarmConnect)
**Full from-scratch setup on a fresh Ubuntu machine**

---

## Step 1: Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Git
sudo apt install git -y

# Install Docker
sudo apt install docker.io -y
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verify installations
docker --version
docker compose version
git --version
```

---

## Step 2: Clone the Project from GitHub

```bash
git clone https://github.com/iiAlmightii/aquaponic-ai.git
cd aquaponic-ai
```

---

## Step 3: Generate Secret Keys

```bash
# Run these two commands — copy the output values
openssl rand -hex 32   # → paste as SECRET_KEY
openssl rand -hex 32   # → paste as JWT_SECRET_KEY
```

---

## Step 4: Create the .env File

```bash
cp .env.example .env
nano .env
```

Fill in these required values (copy from current working machine if needed):

```env
# ── Security ─────────────────────────────────────────────────────────────────
SECRET_KEY=<paste first openssl output here>
JWT_SECRET_KEY=<paste second openssl output here>

# ── Database (Supabase — same as production) ──────────────────────────────────
DATABASE_URL=postgresql+asyncpg://postgres.iodggaldckguehuzoagm:-UQ8z_b%24%3F3%2CkEt%21@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?ssl=require&prepared_statement_cache_size=0
SUPABASE_URL=https://iodggaldckguehuzoagm.supabase.co
SUPABASE_ANON_KEY=<copy from current .env>
SUPABASE_SERVICE_ROLE_KEY=<copy from current .env>

# ── Redis (Upstash) ───────────────────────────────────────────────────────────
REDIS_URL=redis://default:gQAAAAAAAlVsAAIg...@assuring-reptile-152940.upstash.io:6379

# ── STT — use Sarvam (no GPU needed) ─────────────────────────────────────────
STT_PROVIDER=sarvam
SARVAM_API_KEY=sk_w3hmkl13_BcUvxuTXx9XudiebgzrvqaEs

# ── CORS — allow all initially, update after you know the frontend URL ─────────
ALLOWED_ORIGINS_STR=*

# ── Frontend URL pointing to backend ─────────────────────────────────────────
VITE_API_URL=http://<ubuntu-machine-ip>/api/v1

# ── Google Sheets (copy from current .env) ────────────────────────────────────
GOOGLE_SHEETS_SPREADSHEET_ID=1aNaxRpfuo1xi50RzagoO5yFG5St_yI8iZPcitMZln18
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON='<copy full JSON string from current .env>'

# ── Data.gov.in ───────────────────────────────────────────────────────────────
DATA_GOV_IN_API_KEY=579b464db66ec23bdd000001199d989de3af4a4962f1b74903850a5a

# ── These can stay as defaults ────────────────────────────────────────────────
APP_NAME=AquaponicAI
ENVIRONMENT=development
DEBUG=false
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
FASTER_WHISPER_MODEL=medium.en
FASTER_WHISPER_DEVICE=cuda
```

Save and close: `Ctrl+X → Y → Enter`

---

## Step 5: Build and Start Everything

```bash
# First time — builds Docker images and starts all services
docker compose up --build -d

# Watch logs to confirm startup (wait for "Startup complete")
docker compose logs backend --tail=50 -f
```

Press `Ctrl+C` to stop watching logs. The services keep running in background.

### Expected output in logs:
```
✅ Supabase connection verified
✅ Startup complete | Redis connected
✅ Translation cache pre-warmed for 29 questions × 5 languages
```

---

## Step 6: Verify Everything Works

```bash
# Check all containers are running
docker compose ps

# Test backend is responding
curl http://localhost:8000/api/docs
# Should return HTML for the Swagger docs page

# Test backend health
curl http://localhost:8000/health
```

Access the app at: **http://\<ubuntu-machine-ip\>**

---

## Step 7: Find Your Ubuntu Machine's IP Address

```bash
ip addr show | grep "inet " | grep -v "127.0.0.1"
# Look for something like: inet 192.168.1.105/24
```

Use that IP (e.g. `192.168.1.105`) to access the app from other machines on the same network.

---

## Common Issues & Fixes

### Port 80 already in use
```bash
sudo lsof -i :80
sudo systemctl stop apache2   # or nginx if installed
docker compose up -d
```

### Backend fails to start
```bash
docker compose logs backend --tail=100
# Read the error — usually a missing env var or database connection issue
```

### Missing data files (imd_climate_normals.json)
```bash
docker exec aquaponic-ai-backend-1 ls /app/data/
# If imd_climate_normals.json is missing:
docker cp backend/data/imd_climate_normals.json aquaponic-ai-backend-1:/app/data/
docker restart aquaponic-ai-backend-1
```

### Voice not working (STT fails)
Check that `STT_PROVIDER=sarvam` and `SARVAM_API_KEY` are set in `.env`:
```bash
grep "STT_PROVIDER\|SARVAM_API_KEY" .env
```

### CORS errors on frontend
Update `ALLOWED_ORIGINS_STR` in `.env` with the actual frontend URL:
```bash
nano .env
# Change: ALLOWED_ORIGINS_STR=https://your-frontend-url.com
docker compose restart backend
```

---

## Pulling Updates from GitHub

When the codebase is updated:
```bash
git pull origin master
docker compose up --build -d
docker image prune -f   # clean up old images
```

---

## Useful Commands

```bash
# Stop all services
docker compose down

# Restart just the backend
docker compose restart backend

# View live backend logs
docker compose logs backend -f

# View all service logs
docker compose logs -f

# Free up disk space (remove old Docker images)
docker image prune -f

# Stop everything including volumes (resets database — careful!)
docker compose down -v
```

---

## Services Running After Setup

| Service | Port | URL |
|---|---|---|
| Frontend (React) | 3001 → 80 | http://\<ip\> |
| Backend (FastAPI) | 8000 | http://\<ip\>:8000/api/docs |
| PostgreSQL | via Supabase | cloud |
| Redis | via Upstash | cloud |

Both database and Redis are cloud-hosted (Supabase + Upstash) — no local database setup needed.
