# Ubuntu Deployment Guide — AquaponicAI

## Prerequisites — Install on Ubuntu

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Git
sudo apt install git -y

# Install Docker
sudo apt install docker.io -y
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER   # add yourself to docker group
newgrp docker                    # apply without logout

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

---

## Clone the Project

```bash
git clone https://github.com/iiAlmightii/aquaponic-ai.git
cd aquaponic-ai
```

---

## Set Up Environment Variables

```bash
cp .env.example .env
nano .env    # or: vim .env / gedit .env
```

### Minimum required values to fill in:

```env
# Security — generate both with: openssl rand -hex 32
SECRET_KEY=<paste generated value>
JWT_SECRET_KEY=<paste generated value>

# Database — copy from your current .env
DATABASE_URL=postgresql+asyncpg://postgres.iodggaldckguehuzoagm:...

# Supabase (copy from current .env)
SUPABASE_URL=https://iodggaldckguehuzoagm.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Redis — copy from current .env (Upstash)
REDIS_URL=redis://default:gQAA...@assuring-reptile-152940.upstash.io:6379

# Sarvam — copy from current .env
SARVAM_API_KEY=sk_w3hmkl13_BcUvxuTXx9XudiebgzrvqaEs

# STT — use Sarvam on Ubuntu (no GPU needed)
STT_PROVIDER=sarvam

# CORS — allow all initially, update after Vercel deploy
ALLOWED_ORIGINS=*

# Frontend URL (pointing to wherever your frontend is deployed)
VITE_API_URL=http://<ubuntu-machine-ip>:8000/api/v1
```

### Values you DON'T need to change:
- `FASTER_WHISPER_*` — not used when `STT_PROVIDER=sarvam`
- `EVAL_MODE` — set to false for production
- `GOOGLE_SHEETS_*` — copy from current .env if you want sheets sync

---

## Build and Run

```bash
# First time — build everything
docker compose up --build -d

# Check containers are running
docker compose ps

# View logs if something fails
docker compose logs backend --tail=50
docker compose logs frontend --tail=20
```

### Expected running containers:
```
aquaponic-ai-backend-1    Up (healthy)   0.0.0.0:8000
aquaponic-ai-frontend-1   Up             0.0.0.0:3001
aquaponic-ai-nginx-1      Up             0.0.0.0:80
aquaponic-ai-redis-1      Up (healthy)   (internal)
```

Access the app at: `http://<ubuntu-machine-ip>` (port 80)

---

## Verify Backend Works

```bash
curl http://localhost:8000/api/docs
# Should return the FastAPI Swagger UI HTML
```

---

## Common Issues

### Port 80 already in use
```bash
sudo lsof -i :80
sudo systemctl stop apache2   # or nginx if already installed
```

### Backend fails to start — check logs
```bash
docker compose logs backend --tail=100
```

### Missing imd_climate_normals.json
```bash
docker exec aquaponic-ai-backend-1 ls data/
# If missing:
docker cp backend/data/imd_climate_normals.json aquaponic-ai-backend-1:/app/data/
docker restart aquaponic-ai-backend-1
```

### STT not working
Make sure `.env` has:
```
STT_PROVIDER=sarvam
SARVAM_API_KEY=sk_w3hmkl13_...
```

---

## Update After Vercel Deploy

Once you have your Vercel URL (e.g. `https://aquaponic-ai.vercel.app`), update `.env`:

```bash
nano .env
# Change:
ALLOWED_ORIGINS=["https://aquaponic-ai.vercel.app","http://localhost:3001"]

# Then restart backend
docker compose restart backend
```

---

## Useful Commands

```bash
# Stop everything
docker compose down

# Restart backend only
docker compose restart backend

# Update code and redeploy
git pull
docker compose up --build -d

# Clean old Docker images (save disk space)
docker image prune -f
```
