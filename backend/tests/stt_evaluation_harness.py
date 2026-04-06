"""
stt_evaluation_harness.py — Local voice evaluation harness.

Usage:
  1) Transcript-only mode (no audio files required):
     .venv/bin/python backend/tests/stt_evaluation_harness.py --mode transcript

  2) Audio mode (requires audio files present locally):
     .venv/bin/python backend/tests/stt_evaluation_harness.py --mode audio --audio-dir backend/tests/fixtures/audio --server http://localhost:8000

This is intentionally lightweight: it focuses on farm-name extraction correctness + confidence/confirmation behavior.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import Any, Optional

import requests

# Ensure `import services.*` works when running this script directly.
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.voice_interpretation import interpret_transcript


DEFAULT_CASES: list[dict[str, Any]] = [
    {
        "id": "farm_name_quiet_correct",
        "question_id": "farm_name",
        "transcript": "Green Ridge Pilot Farm",
        "stt_confidence": 0.85,
        "expected_best": "Green Ridge Pilot Farm",
    },
    {
        "id": "farm_name_prefix_noise",
        "question_id": "farm_name",
        "transcript": "the name is Green Ridge Pilot Farm",
        "stt_confidence": 0.7,
        "expected_best": "Green Ridge Pilot Farm",
    },
    {
        "id": "farm_name_filler_and_lowercase",
        "question_id": "farm_name",
        "transcript": "um green ridge pilot farm thank you",
        "stt_confidence": 0.6,
        "expected_best": "Green Ridge Pilot Farm",
    },
    {
        "id": "farm_name_low_confidence_should_confirm",
        "question_id": "farm_name",
        "transcript": "Green Ridge Pilot Farm",
        "stt_confidence": 0.2,
        "expected_best": "Green Ridge Pilot Farm",
    },
]


@dataclass
class CaseResult:
    case_id: str
    best: str
    alternatives: list[str]
    entity_conf: float
    stt_conf: float
    needs_confirmation: Optional[bool]


def run_transcript_mode(cases: list[dict[str, Any]]) -> int:
    passed = 0
    for c in cases:
        qid = c["question_id"]
        transcript = c["transcript"]
        stt_confidence = float(c.get("stt_confidence", 0.5))
        expected_best = c.get("expected_best")

        res = interpret_transcript(qid, transcript, stt_confidence)
        farm = res.get("farm_name", {})
        best = farm.get("best", "")
        alternatives = farm.get("alternatives", [])
        entity_conf = farm.get("confidence", 0.0)
        needs_confirmation = farm.get("needs_confirmation")

        ok_best = (expected_best is None) or (best == expected_best)
        ok_confirm = True
        if c["id"] == "farm_name_low_confidence_should_confirm":
            ok_confirm = needs_confirmation is True

        if ok_best and ok_confirm:
            passed += 1
            status = "PASS"
        else:
            status = "FAIL"

        print(
            f"[{status}] {c['id']} | best={best!r} alternatives={alternatives} "
            f"entity_conf={entity_conf:.2f} stt_conf={stt_confidence:.2f} confirm={needs_confirmation}"
        )
    print(f"\nTranscript-mode passed {passed}/{len(cases)} cases.")
    return 0 if passed == len(cases) else 1


def run_audio_mode(server: str, audio_dir: str) -> int:
    """
    Calls live backend /audio/transcribe.
    Requires per-case audio file naming convention: <case_id>.wav (or .webm).
    """
    passed = 0
    for c in DEFAULT_CASES:
        case_id = c["id"]
        qid = c["question_id"]
        expected_best = c.get("expected_best")

        # Try common audio extensions.
        audio_path = None
        for ext in [".wav", ".webm", ".mp3", ".ogg", ".m4a", ".mp4", ".flac"]:
            p = os.path.join(audio_dir, f"{case_id}{ext}")
            if os.path.exists(p):
                audio_path = p
                break

        if not audio_path:
            print(f"[SKIP] {case_id} | missing audio clip (expected {case_id}.* in {audio_dir})")
            continue

        url = server.rstrip("/") + "/api/v1/audio/transcribe"
        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f)}
            data = {
                "language": "en",
                "question_context": "What is the name of your farm or project? Output only the farm/project name.",
                "question_id": qid,
            }
            resp = requests.post(url, files=files, data=data, timeout=120)

        if resp.status_code != 200:
            print(f"[FAIL] {case_id} | HTTP {resp.status_code}: {resp.text[:200]}")
            continue

        payload = resp.json()
        farm = payload.get("interpretation", {}).get("farm_name", {})
        best = farm.get("best", payload.get("text", ""))
        needs_confirmation = farm.get("needs_confirmation")

        ok_best = expected_best is None or best == expected_best
        if ok_best:
            passed += 1
            status = "PASS"
        else:
            status = "FAIL"

        print(
            f"[{status}] {case_id} | best={best!r} confirm={needs_confirmation} "
            f"stt_conf={payload.get('confidence')} raw_text={payload.get('text')!r}"
        )

    print(f"\nAudio-mode passed {passed}/{len(DEFAULT_CASES)} cases (excluding SKIPs).")
    return 0 if passed == len(DEFAULT_CASES) else 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["transcript", "audio"], default="transcript")
    parser.add_argument("--server", default="http://localhost:8000")
    parser.add_argument("--audio-dir", default="backend/tests/fixtures/audio")
    args = parser.parse_args()

    if args.mode == "transcript":
        return run_transcript_mode(DEFAULT_CASES)
    return run_audio_mode(args.server, args.audio_dir)


if __name__ == "__main__":
    sys.exit(main())

