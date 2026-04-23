"""
WER evaluation pipeline.
Transcribes every clip through:
  System A: faster-whisper (large-v3) + post_process_transcript()
  System B: Sarvam Saarika v2 REST API (raw output, no post-processing)
Then computes WER against ground truth and writes outputs.
Called from routers.eval._run_eval_background via asyncio.to_thread.
"""
import csv
import json
import logging
import os
import re
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

_STRIP_PUNCT = re.compile(r"[^\w\s]")


def run_evaluation(clips_dir: Path, results_dir: Path, status_file: Path) -> None:
    results_dir.mkdir(parents=True, exist_ok=True)
    clips = _collect_clips(clips_dir)
    total = len(clips)
    _write_status(status_file, "running", 0, total)
    logger.info("Eval pipeline: %d clips to process", total)

    rows = []
    for i, clip in enumerate(clips):
        logger.info("Processing %d/%d — %s / %s", i + 1, total,
                    clip["participant_id"], clip["file"].name)
        wav_path = _webm_to_wav(clip["file"])
        try:
            whisper_out = _transcribe_whisper(wav_path)
            sarvam_out = _transcribe_sarvam(wav_path)
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
            "whisper_transcript": whisper_out,
            "sarvam_transcript": sarvam_out,
            "whisper_wer": round(jiwer.wer(gt, _normalise(whisper_out)), 4),
            "sarvam_wer": round(jiwer.wer(gt, _normalise(sarvam_out)), 4),
        })
        _write_status(status_file, "running", i + 1, total)

    _write_csv(results_dir / "results.csv", rows)
    _write_summary(results_dir / "summary.md", rows)
    _write_chart(results_dir / "wer_by_group.png", rows)
    _write_agreement_analysis(results_dir / "agreement_analysis.md", rows)
    _write_status(status_file, "complete", total, total)
    logger.info("Eval pipeline complete — results in %s", results_dir)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalise(text: str) -> str:
    return _STRIP_PUNCT.sub("", text.lower()).strip()


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
        logger.warning("SARVAM_API_KEY not set — returning placeholder")
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
        lines.append(f"| {group} | {desc} | {n} | {w:.3f} | {s:.3f} | {s - w:+.3f} |")

    if rows:
        n = len(rows)
        w = sum(r["whisper_wer"] for r in rows) / n
        s = sum(r["sarvam_wer"] for r in rows) / n
        lines.append(f"| **Overall** | | **{n}** | **{w:.3f}** | **{s:.3f}** | **{s - w:+.3f}** |")

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
        w = sum(r["whisper_wer"] for r in g_rows) / len(g_rows) if g_rows else 0.0
        s = sum(r["sarvam_wer"] for r in g_rows) / len(g_rows) if g_rows else 0.0
        whisper_wers.append(w)
        sarvam_wers.append(s)

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
        "These likely indicate ambiguous ground truth or poor recording quality.\n",
        "| Participant | Clip | Ground Truth | Whisper WER | Sarvam WER |",
        "|---|---|---|---|---|",
    ]
    for r in both_failed:
        lines.append(
            f"| {r['participant_id']} | {r['clip_id']} | {r['ground_truth']} "
            f"| {r['whisper_wer']:.3f} | {r['sarvam_wer']:.3f} |"
        )
    path.write_text("\n".join(lines), encoding="utf-8")
