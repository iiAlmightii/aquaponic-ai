# STT A/B Evaluation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guided audio collection module in the React frontend, a FastAPI collection + evaluation endpoint in the backend, and an automated WER comparison pipeline between faster-whisper+normalization and Sarvam Saarika v2.

**Architecture:** A new `/eval/record` page (no auth, detected by URL in main.tsx) lets participants record 40 labeled clips one at a time and uploads each to `POST /api/v1/eval/upload`. After recording, a "Run Evaluation" button calls `POST /api/v1/eval/run` which triggers a background task that transcribes every clip through both STT systems, computes WER via jiwer, and writes `results.csv`, `summary.md`, and `wer_by_group.png`. Status is polled via `GET /api/v1/eval/status`.

**Tech Stack:** React 18, TypeScript, MediaRecorder API, FastAPI, faster-whisper, Sarvam Saarika v2 REST API, jiwer, pydub, matplotlib.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `backend/routers/eval.py` | Upload, run, status, results download endpoints |
| `backend/eval/__init__.py` | Package marker |
| `backend/eval/run_wer_eval.py` | Full WER pipeline: load clips → transcribe both systems → compute WER → write outputs |
| `backend/tests/test_eval_router.py` | Tests for upload + status endpoints |
| `backend/data/eval_clips/.gitkeep` | Directory placeholder |
| `backend/eval/eval_results/.gitkeep` | Directory placeholder |
| `frontend/src/app/components/eval/EvalRecorder.tsx` | Guided recording UI, state machine, upload, run evaluation, status polling |

### Modified files
| File | Change |
|---|---|
| `backend/requirements.txt` | Add jiwer, pydub, matplotlib |
| `backend/core/config.py` | Add EVAL_MODE, SARVAM_API_KEY settings |
| `backend/.env.example` | Add EVAL_MODE=false, SARVAM_API_KEY= |
| `backend/main.py` | Register eval router when EVAL_MODE=true |
| `frontend/src/main.tsx` | Detect /eval/record path, render EvalRecorder directly |

---

## Task 1: Add dependencies and configuration

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/core/config.py`
- Modify: `.env.example`

- [ ] **Step 1: Add Python dependencies to requirements.txt**

Open `backend/requirements.txt`. After the `# Data / ML` section, add:

```
# Evaluation pipeline
jiwer==3.0.4
pydub==0.25.1
matplotlib==3.9.0
```

- [ ] **Step 2: Add EVAL_MODE and SARVAM_API_KEY to config.py**

Open `backend/core/config.py`. After the `# ── External APIs` block (line 60), add:

```python
    # ── Evaluation ────────────────────────────────────────────────────────────
    EVAL_MODE: bool = False
    SARVAM_API_KEY: str = ""
```

- [ ] **Step 3: Update .env.example**

Open `.env.example`. Add at the bottom:

```
# Evaluation pipeline (set EVAL_MODE=true to enable /api/v1/eval/* endpoints)
EVAL_MODE=false
SARVAM_API_KEY=your_sarvam_key_here
```

- [ ] **Step 4: Create directory placeholders**

```bash
mkdir -p backend/data/eval_clips
mkdir -p backend/eval/eval_results
touch backend/data/eval_clips/.gitkeep
touch backend/eval/eval_results/.gitkeep
touch backend/eval/__init__.py
```

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/core/config.py .env.example \
        backend/data/eval_clips/.gitkeep backend/eval/eval_results/.gitkeep \
        backend/eval/__init__.py
git commit -m "feat: add eval pipeline dependencies and config"
```

---

## Task 2: Backend upload endpoint

**Files:**
- Create: `backend/routers/eval.py`
- Create: `backend/tests/test_eval_router.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write the failing test for upload endpoint**

Create `backend/tests/test_eval_router.py`:

```python
"""Tests for eval collection endpoint — no DB required."""
import json
import io
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch

# Force EVAL_MODE on for tests
import os
os.environ["EVAL_MODE"] = "true"

from main import app


@pytest.mark.asyncio
async def test_upload_saves_clip_and_manifest(tmp_path):
    with patch("routers.eval.CLIPS_DIR", tmp_path):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audio_bytes = b"RIFF" + b"\x00" * 100  # dummy webm bytes
            response = await client.post(
                "/api/v1/eval/upload",
                files={"audio": ("clip.webm", io.BytesIO(audio_bytes), "audio/webm")},
                data={
                    "participant_id": "test_user",
                    "clip_id": "1",
                    "ground_truth": "My farm uses an NFT system.",
                    "group": "A",
                },
            )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "saved"
    assert body["clip_id"] == 1
    assert body["participant_id"] == "test_user"


@pytest.mark.asyncio
async def test_upload_overwrites_duplicate_clip(tmp_path):
    with patch("routers.eval.CLIPS_DIR", tmp_path):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for _ in range(2):
                response = await client.post(
                    "/api/v1/eval/upload",
                    files={"audio": ("clip.webm", io.BytesIO(b"RIFF" + b"\x00" * 100), "audio/webm")},
                    data={
                        "participant_id": "test_user",
                        "clip_id": "1",
                        "ground_truth": "My farm uses an NFT system.",
                        "group": "A",
                    },
                )
            assert response.status_code == 200
    manifest = json.loads((tmp_path / "test_user" / "manifest.json").read_text())
    assert len(manifest["clips"]) == 1


@pytest.mark.asyncio
async def test_status_returns_idle_when_no_results(tmp_path):
    with patch("routers.eval.RESULTS_DIR", tmp_path):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/eval/status")
    assert response.status_code == 200
    assert response.json()["status"] == "idle"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_eval_router.py -v 2>&1 | head -30
```

Expected: ImportError or 404 — `routers.eval` does not exist yet.

- [ ] **Step 3: Create backend/routers/eval.py**

```python
"""
Evaluation data collection and WER pipeline endpoints.
Registered only when EVAL_MODE=true in .env.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)
router = APIRouter()

CLIPS_DIR = Path("data/eval_clips")
RESULTS_DIR = Path("eval/eval_results")
STATUS_FILE = RESULTS_DIR / "status.json"


@router.post("/upload")
async def upload_clip(
    audio: UploadFile = File(...),
    participant_id: str = Form(...),
    clip_id: int = Form(...),
    ground_truth: str = Form(...),
    group: str = Form(...),
):
    participant_dir = CLIPS_DIR / participant_id
    participant_dir.mkdir(parents=True, exist_ok=True)

    clip_filename = f"clip_{clip_id:02d}.webm"
    content = await audio.read()
    (participant_dir / clip_filename).write_bytes(content)

    manifest_path = participant_dir / "manifest.json"
    manifest: dict = {"participant_id": participant_id, "clips": {}}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())

    manifest["clips"][str(clip_id)] = {
        "ground_truth": ground_truth,
        "group": group,
        "file": clip_filename,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    _update_master_manifest(participant_id, len(manifest["clips"]))

    return {"status": "saved", "clip_id": clip_id, "participant_id": participant_id}


def _update_master_manifest(participant_id: str, clip_count: int) -> None:
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    master_path = CLIPS_DIR / "master_manifest.json"
    master: dict = {}
    if master_path.exists():
        master = json.loads(master_path.read_text())
    master[participant_id] = {"clips_recorded": clip_count, "complete": clip_count >= 40}
    master_path.write_text(json.dumps(master, indent=2))


@router.post("/run")
async def run_evaluation(background_tasks: BackgroundTasks):
    master_path = CLIPS_DIR / "master_manifest.json"
    if not master_path.exists():
        raise HTTPException(status_code=400, detail="No recordings found.")
    master = json.loads(master_path.read_text())
    ready = [p for p, info in master.items() if info["clips_recorded"] > 0]
    if not ready:
        raise HTTPException(status_code=400, detail="No participants with recordings.")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps({"status": "running", "progress": 0, "total": 0}))
    background_tasks.add_task(_run_eval_background)
    return {"status": "started", "participants": ready}


@router.get("/status")
async def eval_status():
    if not STATUS_FILE.exists():
        return {"status": "idle"}
    return json.loads(STATUS_FILE.read_text())


@router.get("/results/csv")
async def download_results():
    csv_path = RESULTS_DIR / "results.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="Results not yet generated.")
    return FileResponse(csv_path, media_type="text/csv", filename="wer_results.csv")


async def _run_eval_background() -> None:
    try:
        from eval.run_wer_eval import run_evaluation as _run
        await asyncio.to_thread(_run, CLIPS_DIR, RESULTS_DIR, STATUS_FILE)
    except Exception:
        logger.exception("Eval pipeline failed")
        STATUS_FILE.write_text(json.dumps({"status": "error", "progress": 0, "total": 0}))
```

- [ ] **Step 4: Register eval router in main.py**

Open `backend/main.py`. After the existing router imports (line 24), add:

```python
from core.config import settings
```

(it may already be imported — check first). Then at the bottom of the router registrations block (after line 219 where crop router is registered), add:

```python
if settings.EVAL_MODE:
    from routers import eval as eval_router
    app.include_router(eval_router.router, prefix=f"{API_PREFIX}/eval", tags=["Evaluation"])
```

- [ ] **Step 5: Run tests**

```bash
cd backend && pytest tests/test_eval_router.py -v
```

Expected output:
```
tests/test_eval_router.py::test_upload_saves_clip_and_manifest PASSED
tests/test_eval_router.py::test_upload_overwrites_duplicate_clip PASSED
tests/test_eval_router.py::test_status_returns_idle_when_no_results PASSED
3 passed
```

- [ ] **Step 6: Commit**

```bash
git add backend/routers/eval.py backend/tests/test_eval_router.py backend/main.py
git commit -m "feat: add eval upload, run, status, and results endpoints"
```

---

## Task 3: WER evaluation pipeline

**Files:**
- Create: `backend/eval/run_wer_eval.py`

- [ ] **Step 1: Write the failing test for WER pipeline**

Add to `backend/tests/test_eval_router.py`:

```python
def test_wer_computation_correctness():
    """WER of identical strings should be 0.0; completely wrong should be 1.0."""
    import jiwer
    assert jiwer.wer("my farm uses an nft system", "my farm uses an nft system") == 0.0
    assert jiwer.wer("my farm uses an nft system", "xyz abc def ghi jkl mno") == 1.0


def test_wer_partial_error():
    import jiwer
    # 1 substitution out of 6 words = 1/6 ≈ 0.167
    wer = jiwer.wer("my farm uses an nft system", "my farm uses an raft system")
    assert abs(wer - 1/6) < 0.01
```

- [ ] **Step 2: Run to verify jiwer is importable**

```bash
cd backend && pip install jiwer==3.0.4 pydub==0.25.1 matplotlib==3.9.0 --quiet
pytest tests/test_eval_router.py::test_wer_computation_correctness -v
```

Expected: PASS

- [ ] **Step 3: Create backend/eval/run_wer_eval.py**

```python
"""
WER evaluation pipeline.
Transcribes every clip through System A (faster-whisper + normalization)
and System B (Sarvam Saarika v2), then computes WER and writes outputs.
Called from the /eval/run background task.
"""
import csv
import json
import logging
import os
import tempfile
from pathlib import Path

import jiwer
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import requests
from pydub import AudioSegment

logger = logging.getLogger(__name__)

GROUPS = {
    "A": "Clean speech",
    "B": "Indian numbers",
    "C": "Crop/location",
    "D": "Fillers+homophones",
}


def run_evaluation(clips_dir: Path, results_dir: Path, status_file: Path) -> None:
    results_dir.mkdir(parents=True, exist_ok=True)
    clips = _collect_clips(clips_dir)
    total = len(clips)
    _write_status(status_file, "running", 0, total)
    logger.info("Eval pipeline: %d clips to process", total)

    rows = []
    for i, clip in enumerate(clips):
        logger.info("Processing clip %d/%d — %s/%s", i + 1, total,
                    clip["participant_id"], clip["file"].name)
        wav_path = _webm_to_wav(clip["file"])
        try:
            whisper_raw = _transcribe_whisper(wav_path)
            sarvam_raw = _transcribe_sarvam(wav_path)
        finally:
            try:
                os.unlink(wav_path)
            except OSError:
                pass

        gt = _normalise(clip["ground_truth"])
        rows.append({
            "participant_id": clip["participant_id"],
            "clip_id": clip["clip_id"],
            "group": clip["group"],
            "ground_truth": clip["ground_truth"],
            "whisper_transcript": whisper_raw,
            "sarvam_transcript": sarvam_raw,
            "whisper_wer": round(jiwer.wer(gt, _normalise(whisper_raw)), 4),
            "sarvam_wer": round(jiwer.wer(gt, _normalise(sarvam_raw)), 4),
        })
        _write_status(status_file, "running", i + 1, total)

    _write_csv(results_dir / "results.csv", rows)
    _write_summary(results_dir / "summary.md", rows)
    _write_chart(results_dir / "wer_by_group.png", rows)
    _write_agreement_analysis(results_dir / "agreement_analysis.md", rows)
    _write_status(status_file, "complete", total, total)
    logger.info("Eval pipeline complete. Results in %s", results_dir)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalise(text: str) -> str:
    """Lowercase and strip punctuation for fair WER comparison."""
    import re
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def _collect_clips(clips_dir: Path) -> list[dict]:
    clips = []
    for participant_dir in sorted(clips_dir.iterdir()):
        if not participant_dir.is_dir():
            continue
        manifest_path = participant_dir / "manifest.json"
        if not manifest_path.exists():
            continue
        manifest = json.loads(manifest_path.read_text())
        for clip_id, info in manifest.get("clips", {}).items():
            clip_file = participant_dir / info["file"]
            if clip_file.exists():
                clips.append({
                    "participant_id": manifest["participant_id"],
                    "clip_id": int(clip_id),
                    "group": info["group"],
                    "ground_truth": info["ground_truth"],
                    "file": clip_file,
                })
    return clips


def _webm_to_wav(webm_path: Path) -> str:
    audio = AudioSegment.from_file(str(webm_path), format="webm")
    audio = audio.set_frame_rate(16000).set_channels(1)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    audio.export(tmp.name, format="wav")
    return tmp.name


def _transcribe_whisper(wav_path: str) -> str:
    from faster_whisper import WhisperModel
    from services.voice_interpretation import post_process_transcript
    model = WhisperModel("large-v3", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(wav_path)
    raw = " ".join(s.text.strip() for s in segments)
    return post_process_transcript(raw)


def _transcribe_sarvam(wav_path: str) -> str:
    api_key = os.environ.get("SARVAM_API_KEY", "")
    if not api_key:
        logger.warning("SARVAM_API_KEY not set — skipping Sarvam transcription")
        return "[SARVAM_API_KEY not set]"
    with open(wav_path, "rb") as f:
        response = requests.post(
            "https://api.sarvam.ai/speech-to-text",
            headers={"API-Subscription-Key": api_key},
            files={"file": ("audio.wav", f, "audio/wav")},
            data={"model": "saarika:v2", "language_code": "en-IN"},
            timeout=30,
        )
    response.raise_for_status()
    return response.json().get("transcript", "")


def _write_status(status_file: Path, status: str, progress: int, total: int) -> None:
    status_file.write_text(json.dumps(
        {"status": status, "progress": progress, "total": total}
    ))


def _write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)


def _write_summary(path: Path, rows: list[dict]) -> None:
    lines = [
        "# WER Evaluation Summary\n",
        "| Group | Description | N | Whisper+Norm WER | Sarvam WER | Δ |",
        "|---|---|---|---|---|---|",
    ]
    for group, desc in GROUPS.items():
        g_rows = [r for r in rows if r["group"] == group]
        if not g_rows:
            continue
        n = len(g_rows)
        w = sum(r["whisper_wer"] for r in g_rows) / n
        s = sum(r["sarvam_wer"] for r in g_rows) / n
        d = s - w
        lines.append(f"| {group} | {desc} | {n} | {w:.3f} | {s:.3f} | {d:+.3f} |")

    if rows:
        n = len(rows)
        w = sum(r["whisper_wer"] for r in rows) / n
        s = sum(r["sarvam_wer"] for r in rows) / n
        d = s - w
        lines.append(f"| **Overall** | | **{n}** | **{w:.3f}** | **{s:.3f}** | **{d:+.3f}** |")

    lines.append(
        "\nΔ = Sarvam WER − Whisper WER. "
        "Positive = Whisper better; Negative = Sarvam better."
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def _write_chart(path: Path, rows: list[dict]) -> None:
    groups = list(GROUPS.keys())
    labels = list(GROUPS.values())
    whisper_wers, sarvam_wers = [], []
    for group in groups:
        g_rows = [r for r in rows if r["group"] == group]
        if g_rows:
            whisper_wers.append(sum(r["whisper_wer"] for r in g_rows) / len(g_rows))
            sarvam_wers.append(sum(r["sarvam_wer"] for r in g_rows) / len(g_rows))
        else:
            whisper_wers.append(0.0)
            sarvam_wers.append(0.0)

    x = range(len(groups))
    width = 0.35
    fig, ax = plt.subplots(figsize=(8, 5))
    bars1 = ax.bar([i - width / 2 for i in x], whisper_wers, width,
                   label="Whisper + Normalization", color="#2196F3")
    bars2 = ax.bar([i + width / 2 for i in x], sarvam_wers, width,
                   label="Sarvam Saarika v2", color="#FF5722")
    ax.set_xlabel("Script Group")
    ax.set_ylabel("Word Error Rate (WER)")
    ax.set_title("STT Comparison: Whisper+Normalization vs Sarvam Saarika v2")
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.legend()
    ax.bar_label(bars1, fmt="%.2f", padding=3, fontsize=8)
    ax.bar_label(bars2, fmt="%.2f", padding=3, fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def _write_agreement_analysis(path: Path, rows: list[dict]) -> None:
    both_failed = [r for r in rows if r["whisper_wer"] > 0.5 and r["sarvam_wer"] > 0.5]
    lines = [
        "# Agreement Analysis\n",
        f"Clips where both systems had WER > 0.50: **{len(both_failed)}**\n",
        "These indicate ambiguous ground truth or recording quality issues.\n",
        "| Participant | Clip | Ground Truth | Whisper WER | Sarvam WER |",
        "|---|---|---|---|---|",
    ]
    for r in both_failed:
        lines.append(
            f"| {r['participant_id']} | {r['clip_id']} | {r['ground_truth']} "
            f"| {r['whisper_wer']:.3f} | {r['sarvam_wer']:.3f} |"
        )
    path.write_text("\n".join(lines), encoding="utf-8")
```

- [ ] **Step 4: Run all eval tests**

```bash
cd backend && pytest tests/test_eval_router.py -v
```

Expected:
```
tests/test_eval_router.py::test_upload_saves_clip_and_manifest PASSED
tests/test_eval_router.py::test_upload_overwrites_duplicate_clip PASSED
tests/test_eval_router.py::test_status_returns_idle_when_no_results PASSED
tests/test_eval_router.py::test_wer_computation_correctness PASSED
tests/test_eval_router.py::test_wer_partial_error PASSED
5 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/eval/run_wer_eval.py backend/eval/__init__.py \
        backend/data/eval_clips/.gitkeep backend/eval/eval_results/.gitkeep
git commit -m "feat: add WER evaluation pipeline with Whisper+norm vs Sarvam comparison"
```

---

## Task 4: Frontend EvalRecorder component

**Files:**
- Create: `frontend/src/app/components/eval/EvalRecorder.tsx`
- Modify: `frontend/src/main.tsx`

The recording script — exactly 40 sentences in order — is hardcoded in the component so participants see each sentence on screen as they record.

- [ ] **Step 1: Create EvalRecorder.tsx**

Create `frontend/src/app/components/eval/EvalRecorder.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");

// ── Recording script: 40 sentences, 4 groups of 10 ──────────────────────────
const CLIPS: { group: string; text: string }[] = [
  // Group A — Clean speech
  { group: "A", text: "My farm uses an NFT system." },
  { group: "A", text: "I am raising tilapia and barramundi." },
  { group: "A", text: "The fish tank holds two thousand litres." },
  { group: "A", text: "I have one hundred tilapia fingerlings." },
  { group: "A", text: "The harvest cycle is six months." },
  { group: "A", text: "I also grow trout in a media bed system." },
  { group: "A", text: "The system type is deep water culture." },
  { group: "A", text: "I have fifty catfish and thirty trout." },
  { group: "A", text: "We use a raft system for the crops." },
  { group: "A", text: "The stocking density is five fish per cubic metre." },
  // Group B — Indian numbers
  { group: "B", text: "The capital expenditure is five lakh rupees." },
  { group: "B", text: "Monthly revenue is fifty-five thousand rupees." },
  { group: "B", text: "I spent two lakh on infrastructure." },
  { group: "B", text: "The monthly operating cost is thirty thousand." },
  { group: "B", text: "My total investment was one crore rupees." },
  { group: "B", text: "I earn forty thousand from fish every month." },
  { group: "B", text: "The equipment cost one lakh fifty thousand." },
  { group: "B", text: "Annual profit is three lakh rupees." },
  { group: "B", text: "My farm area is one thousand square metres." },
  { group: "B", text: "I started with fifty thousand rupees initial stock." },
  // Group C — Crop and location terms
  { group: "C", text: "I grow lettuce, spinach, and basil in the aquaponic beds." },
  { group: "C", text: "The crop area is two hundred square metres." },
  { group: "C", text: "Monthly yield is about fifty kilograms of lettuce." },
  { group: "C", text: "My farm is located in Bengaluru, Karnataka." },
  { group: "C", text: "I also cultivate mint and okra." },
  { group: "C", text: "The growing area covers five hundred square feet." },
  { group: "C", text: "I sell tomatoes and capsicum to local markets." },
  { group: "C", text: "The farm is in Pune, Maharashtra." },
  { group: "C", text: "Crop revenue is fifteen thousand per month." },
  { group: "C", text: "I grow herbs like basil and mint near the fish tanks." },
  // Group D — Fillers and homophones
  { group: "D", text: "Um, I have, uh, about twenty thousand litres capacity." },
  { group: "D", text: "You know, I raise till, I mean tilapia, in the main tank." },
  { group: "D", text: "My farm, basically, earns around two lakh, sort of, annually." },
  { group: "D", text: "I think it is, like, an NFT, an n f t, system." },
  { group: "D", text: "Uh, the harvest is, um, every six months or so." },
  { group: "D", text: "I have, you know, around five lakh in capital expenses." },
  { group: "D", text: "Actually I grow talapia, I mean tilapia, and some trout." },
  { group: "D", text: "My location is, uh, Bangalore, Bengaluru, in Karnataka." },
  { group: "D", text: "Um, the monthly revenue is, like, fifty five thousand rupees." },
  { group: "D", text: "I use, basically, a media bead, I mean media bed, system." },
];

type ClipState = "idle" | "recording" | "stopped" | "uploading" | "done" | "error";
type EvalStatus = { status: string; progress: number; total: number };

export function EvalRecorder() {
  const [participantId, setParticipantId] = useState("");
  const [started, setStarted] = useState(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [clipState, setClipState] = useState<ClipState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);

  const [evalStatus, setEvalStatus] = useState<EvalStatus | null>(null);
  const [polling, setPolling] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentClip = CLIPS[clipIndex];
  const isFinished = clipIndex >= CLIPS.length;

  // ── Poll eval status while running ────────────────────────────────────────
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/eval/status`);
        const data: EvalStatus = await res.json();
        setEvalStatus(data);
        if (data.status === "complete" || data.status === "error") {
          setPolling(false);
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  // ── Recording controls ────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setErrorMsg("");
    setBlob(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(b);
        setClipState("stopped");
      };
      mr.start();
      mediaRef.current = mr;
      setClipState("recording");
    } catch {
      setErrorMsg("Microphone access denied. Please allow microphone and refresh.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  const reRecord = useCallback(() => {
    setBlob(null);
    setClipState("idle");
  }, []);

  const uploadAndAdvance = useCallback(async () => {
    if (!blob || !currentClip) return;
    setClipState("uploading");
    try {
      const form = new FormData();
      form.append("audio", blob, `clip_${clipIndex + 1:02}.webm`);
      form.append("participant_id", participantId);
      form.append("clip_id", String(clipIndex + 1));
      form.append("ground_truth", currentClip.text);
      form.append("group", currentClip.group);

      const res = await fetch(`${API_BASE}/eval/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      setClipState("done");
      setTimeout(() => {
        setClipIndex((i) => i + 1);
        setClipState("idle");
        setBlob(null);
      }, 600);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Upload failed");
      setClipState("error");
    }
  }, [blob, currentClip, clipIndex, participantId]);

  const runEvaluation = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/eval/run`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed to start: ${res.status}`);
      setEvalStatus({ status: "running", progress: 0, total: 0 });
      setPolling(true);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Could not start evaluation");
    }
  }, []);

  // ── Name entry screen ─────────────────────────────────────────────────────
  if (!started) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>AquaponicAI — Audio Recording</h1>
          <p style={styles.subtitle}>
            You will record <strong>40 sentences</strong>, one at a time. Read each sentence
            exactly as shown. You can re-record any clip before moving on.
          </p>
          <input
            style={styles.input}
            placeholder="Enter your name (e.g. priya_01)"
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value.trim())}
          />
          <button
            style={{ ...styles.btn, ...styles.btnPrimary, opacity: participantId ? 1 : 0.4 }}
            disabled={!participantId}
            onClick={() => setStarted(true)}
          >
            Start Recording
          </button>
        </div>
      </div>
    );
  }

  // ── Completion screen ─────────────────────────────────────────────────────
  if (isFinished) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>All done! Thank you, {participantId} 🎉</h1>
          <p style={styles.subtitle}>All 40 clips have been saved.</p>

          {!evalStatus && (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={runEvaluation}>
              Run Evaluation
            </button>
          )}

          {evalStatus && evalStatus.status === "running" && (
            <p style={styles.subtitle}>
              Running evaluation… {evalStatus.progress}/{evalStatus.total} clips processed
            </p>
          )}

          {evalStatus && evalStatus.status === "complete" && (
            <>
              <p style={{ ...styles.subtitle, color: "#22c55e" }}>Evaluation complete!</p>
              <a
                href={`${API_BASE}/eval/results/csv`}
                style={{ ...styles.btn, ...styles.btnPrimary, textDecoration: "none" }}
              >
                Download results.csv
              </a>
            </>
          )}

          {evalStatus && evalStatus.status === "error" && (
            <p style={{ ...styles.subtitle, color: "#ef4444" }}>
              Evaluation failed. Check backend logs.
            </p>
          )}

          {errorMsg && <p style={styles.error}>{errorMsg}</p>}
        </div>
      </div>
    );
  }

  // ── Recording screen ──────────────────────────────────────────────────────
  const groupLabel: Record<string, string> = {
    A: "Clean Speech", B: "Indian Numbers", C: "Crop & Location", D: "Fillers & Homophones",
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.progress}>
          Clip {clipIndex + 1} of {CLIPS.length} &nbsp;·&nbsp;
          Group {currentClip.group}: {groupLabel[currentClip.group]}
        </div>

        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${(clipIndex / CLIPS.length) * 100}%` }} />
        </div>

        <p style={styles.sentence}>{currentClip.text}</p>

        <div style={styles.controls}>
          {clipState === "idle" && (
            <button style={{ ...styles.btn, ...styles.btnRed }} onClick={startRecording}>
              🎙 Record
            </button>
          )}
          {clipState === "recording" && (
            <button style={{ ...styles.btn, ...styles.btnStop }} onClick={stopRecording}>
              ⏹ Stop
            </button>
          )}
          {(clipState === "stopped" || clipState === "error") && (
            <>
              <button style={{ ...styles.btn, ...styles.btnGray }} onClick={reRecord}>
                ↩ Re-record
              </button>
              <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={uploadAndAdvance}>
                Next →
              </button>
            </>
          )}
          {clipState === "uploading" && <p style={styles.subtitle}>Uploading…</p>}
          {clipState === "done" && <p style={{ ...styles.subtitle, color: "#22c55e" }}>Saved ✓</p>}
        </div>

        {clipState === "recording" && (
          <p style={{ ...styles.subtitle, color: "#ef4444" }}>● Recording…</p>
        )}
        {errorMsg && <p style={styles.error}>{errorMsg}</p>}
      </div>
    </div>
  );
}

// ── Inline styles (no Tailwind dependency) ───────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#0f172a", fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1e293b", borderRadius: 16, padding: "2.5rem", maxWidth: 600, width: "90%",
    boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
  },
  title: { color: "#f1f5f9", fontSize: "1.5rem", marginBottom: "0.75rem" },
  subtitle: { color: "#94a3b8", marginBottom: "1.5rem" },
  sentence: {
    color: "#f8fafc", fontSize: "1.6rem", fontWeight: 600, lineHeight: 1.5,
    marginBottom: "2rem", textAlign: "center",
  },
  progress: { color: "#64748b", fontSize: "0.85rem", marginBottom: "0.5rem" },
  progressBar: { height: 6, background: "#334155", borderRadius: 3, marginBottom: "2rem" },
  progressFill: { height: "100%", background: "#3b82f6", borderRadius: 3, transition: "width 0.3s" },
  controls: { display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "1rem" },
  btn: {
    padding: "0.75rem 1.5rem", borderRadius: 8, border: "none", cursor: "pointer",
    fontSize: "1rem", fontWeight: 600,
  },
  btnPrimary: { background: "#3b82f6", color: "#fff" },
  btnRed: { background: "#ef4444", color: "#fff" },
  btnStop: { background: "#f97316", color: "#fff" },
  btnGray: { background: "#475569", color: "#fff" },
  input: {
    width: "100%", padding: "0.75rem 1rem", borderRadius: 8, border: "1px solid #334155",
    background: "#0f172a", color: "#f1f5f9", fontSize: "1rem",
    marginBottom: "1.5rem", boxSizing: "border-box",
  },
  error: { color: "#ef4444", marginTop: "0.5rem", textAlign: "center" },
};
```

Note: There is a template literal error in the FormData append line — fix `clip_${clipIndex + 1:02}` to use proper padding:

```tsx
form.append("audio", blob, `clip_${String(clipIndex + 1).padStart(2, "0")}.webm`);
```

- [ ] **Step 2: Update main.tsx to detect /eval/record path**

Open `frontend/src/main.tsx`. Replace the entire file with:

```tsx
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

const root = document.getElementById("root")!;

if (window.location.pathname.startsWith("/eval/record")) {
  import("./app/components/eval/EvalRecorder.tsx").then(({ EvalRecorder }) => {
    createRoot(root).render(<EvalRecorder />);
  });
} else {
  createRoot(root).render(<App />);
}
```

- [ ] **Step 3: Build frontend and verify no TypeScript errors**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: `built in X.Xs` with no errors. If TypeScript errors appear, fix them before proceeding.

- [ ] **Step 4: Hot-swap into running Docker container**

```bash
cd frontend && npm run build && \
  docker cp dist/. aquaponic-ai-frontend-1:/usr/share/nginx/html/
```

- [ ] **Step 5: Verify the eval page loads**

Open `http://localhost:3001/eval/record` in your browser. You should see the name entry screen with a dark background. The main app at `http://localhost:3001` should still work normally.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/components/eval/EvalRecorder.tsx frontend/src/main.tsx
git commit -m "feat: add guided audio recording module at /eval/record"
```

---

## Task 5: Enable EVAL_MODE and test end-to-end locally

- [ ] **Step 1: Add EVAL_MODE=true to your .env**

Open `backend/.env`. Add:
```
EVAL_MODE=true
SARVAM_API_KEY=your_actual_key_from_dashboard.sarvam.ai
```

- [ ] **Step 2: Restart backend container**

```bash
docker cp backend/. aquaponic-ai-backend-1:/app/ && \
  docker restart aquaponic-ai-backend-1
```

- [ ] **Step 3: Verify eval endpoints are live**

```bash
curl http://localhost:8000/api/v1/eval/status
```

Expected: `{"status":"idle"}`

- [ ] **Step 4: Record one test clip and verify it saves**

Open `http://localhost:3001/eval/record`. Enter `test_user`. Record clip 1. After clicking Next, verify the file exists:

```bash
ls backend/data/eval_clips/test_user/
# Expected: clip_01.webm  manifest.json
cat backend/data/eval_clips/test_user/manifest.json
```

- [ ] **Step 5: Commit env example (not .env itself)**

```bash
git add .env.example
git commit -m "feat: document EVAL_MODE and SARVAM_API_KEY env vars"
```

---

## Task 6: ngrok setup for participant access

- [ ] **Step 1: Install and authenticate ngrok**

```bash
# Install
snap install ngrok

# Sign up at https://dashboard.ngrok.com (free)
# Copy your authtoken from the dashboard, then:
ngrok config add-authtoken YOUR_TOKEN_HERE
```

- [ ] **Step 2: Start ngrok tunnel while Docker is running**

```bash
ngrok http 80
```

You will see output like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:80
```

- [ ] **Step 3: Share this URL with participants**

Send them: `https://abc123.ngrok-free.app/eval/record`

They open it in Chrome on their laptop or phone, enter their name, and record all 40 clips. Each takes about 10 minutes.

- [ ] **Step 4: After all participants finish, run evaluation**

On the completion screen (clip 40 done), click **"Run Evaluation"**. The pipeline runs in the background. Progress updates every 3 seconds. When complete, the **"Download results.csv"** button appears.

---

## Self-Review Checklist

- [x] Spec section 3 (frontend) → Task 4 implements EvalRecorder.tsx ✓
- [x] Spec section 4 (backend upload) → Task 2 implements POST /eval/upload ✓
- [x] Spec section 5 (pipeline, automated) → Task 3 implements run_wer_eval.py + Task 2 implements POST /eval/run + GET /eval/status ✓
- [x] Spec section 6 (env vars) → Task 1 implements EVAL_MODE + SARVAM_API_KEY ✓
- [x] Spec section 8 (ngrok) → Task 6 covers setup ✓
- [x] Re-record UX → reRecord() in EvalRecorder discards blob, returns to idle ✓
- [x] Ground truth sent with each upload → FormData includes ground_truth ✓
- [x] Sarvam gets no post-processing → _transcribe_sarvam() returns raw API response ✓
- [x] Results CSV, summary.md, chart, agreement analysis → all in _write_* functions ✓
- [x] Run Evaluation button only shown on completion screen → gated by isFinished ✓
- [x] ffmpeg available in Docker → confirmed in backend Dockerfile ✓
