"""
Evaluation data collection and WER pipeline endpoints.
Registered only when EVAL_MODE=true in .env.
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

_SAFE_ID = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")

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
    if not _SAFE_ID.match(participant_id):
        raise HTTPException(status_code=400, detail="participant_id must be alphanumeric/underscore/hyphen, max 64 chars.")

    participant_dir = CLIPS_DIR / participant_id
    participant_dir.mkdir(parents=True, exist_ok=True)

    clip_filename = f"clip_{clip_id:02d}.webm"
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file.")
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
