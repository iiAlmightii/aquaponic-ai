# 🌿 FarmConnect — AI-Powered Aquaponic & Land Farm Management Platform

[![Live Demo](https://img.shields.io/badge/Live%20Demo-aquaponic--ai.vercel.app-green?style=for-the-badge)](https://aquaponic-ai.vercel.app)
[![Backend](https://img.shields.io/badge/API%20Docs-Render-purple?style=for-the-badge)](https://aquaponic-ai-backend.onrender.com/api/docs)
[![Python](https://img.shields.io/badge/Python-3.12-blue?style=for-the-badge)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge)](https://fastapi.tiangolo.com)

> A full-stack, voice-first farm management platform for Indian farmers — supporting 6 Indian languages, AI-powered financial planning, crop feasibility analysis using ICAR data, and an LLM-based advisory system.

---

## 🎯 Live Demo

**[https://aquaponic-ai.vercel.app](https://aquaponic-ai.vercel.app)**

Demo credentials:
- Email: `admin@farmconnect.com` | Password: `Admin@1234` (Admin panel access)
- Or register your own account

---

## ✨ Key Features

### 🎙️ Voice-First Multilingual Surveys
- Voice surveys in **6 Indian languages** (English, Hindi, Kannada, Tamil, Telugu, Marathi)
- **AI4Bharat IndicWhisper** STT — open-source, fine-tuned on Indian speech
- Real-time question translation via Sarvam AI (mayura:v1)
- Browser TTS reads questions aloud; mic auto-opens for responses
- Correction feedback loop — user corrections improve future transcription accuracy

### 📊 Financial Planning Engine
- **Three-scenario projections**: Base / Pessimistic (-20%) / Optimistic (+20%)
- Computes NPV, IRR, break-even month, payback period, ROI
- Monthly cash flow visualisation with interactive charts
- Excel export with 3 sheets (Summary, Monthly Cash Flow, AI Recommendations)

### 🌱 Crop Feasibility Module
- Scores 30 crops (0–100) on temperature, humidity, rainfall, pH, soil type
- Live weather from OpenWeatherMap + IMD 30-year climate normals (31 states)
- ICAR agronomic knowledge base — Kharif, Rabi, Perennial crops
- Recommends alternatives + suitable Indian states when a crop scores below 50

### 🤖 AI Farm Advisor
- Powered by Sarvam sarvam-30b (30B parameter Indian language model)
- Context-aware: reads latest survey answers before responding
- Pre-built prompts: ROI improvement, cost risk, crop/fish mix optimisation

### 🛡️ Admin Panel
- Role-based access (admin / farmer / viewer)
- Platform-wide analytics, user management, live database schema viewer

### 📡 STT Evaluation Pipeline
- Empirical WER comparison: AI4Bharat IndicWhisper vs Sarvam saarika:v2.5
- 320 audio clips from 9 speakers across 4 script groups
- Results exportable as CSV for research / paper use

---

## 🏗️ Architecture

```
Browser (React 18 + TypeScript)
         │ HTTPS
         ▼
      Nginx (80/443)
         ├── /api/* ──────► FastAPI (Python 3.12)
         │                      ├── Supabase PostgreSQL 16
         │                      ├── Upstash Redis 7
         │                      ├── AI4Bharat IndicWhisper (STT)
         │                      ├── Sarvam AI (LLM + translate)
         │                      ├── OpenWeatherMap API
         │                      └── ICAR/IMD embedded datasets
         └── /* ──────────► React SPA (Vite)
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS v4, Zustand, Recharts |
| **Backend** | FastAPI, Python 3.12, async SQLAlchemy, Pydantic v2 |
| **Database** | PostgreSQL 16 (Supabase), Redis 7 (Upstash) |
| **AI/ML** | AI4Bharat IndicWhisper, Sarvam sarvam-30b, Sarvam saarika:v2.5 |
| **Auth** | JWT (access + refresh), bcrypt, Google OAuth |
| **Infrastructure** | Docker Compose, nginx, Render, Vercel, Supabase |
| **Data** | ICAR crop knowledge base, IMD 30-year climate normals, data.gov.in |

---

## 🚀 Quick Start

```bash
git clone https://github.com/iiAlmightii/aquaponic-ai.git
cd aquaponic-ai
cp .env.example .env
# Fill in: SARVAM_API_KEY, DATABASE_URL, JWT_SECRET_KEY, SECRET_KEY
docker compose up --build -d
```

Open **http://localhost**

---

## 📈 STT Research Study

Conducted a comparative WER evaluation between AI4Bharat IndicWhisper and Sarvam saarika:v2.5:
- **9 speakers** × **40 clips** = **320 total utterances**
- **4 script groups**: Clean speech · Indian numbers (lakh/crore) · Crop/location terms · Fillers & homophones

---

## 📄 Key Design Decisions

- **JSONB for survey answers** — flexible schema across survey types without migrations
- **Translation pre-warming** — 29 questions × 5 languages cached at server startup
- **AI4Bharat over generic Whisper** — fine-tuned on Indian speech; better WER on Indian English and code-switching
- **Render free tier** — separate `requirements-render.txt` strips GPU deps to stay under 512MB RAM limit

---

*Built by [Chandan K](https://github.com/iiAlmightii) — MCA, RVCE Bengaluru*
