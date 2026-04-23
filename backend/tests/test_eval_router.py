"""Tests for eval collection endpoints — no DB required."""
import io
import json
import os
import pytest

os.environ["EVAL_MODE"] = "true"

from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_upload_saves_clip_and_manifest(tmp_path, monkeypatch):
    monkeypatch.chdir("/home/chandan/Downloads/aquaponic-ai/backend")
    from main import app
    import routers.eval as eval_router
    monkeypatch.setattr(eval_router, "CLIPS_DIR", tmp_path)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/eval/upload",
            files={"audio": ("clip.webm", io.BytesIO(b"RIFF" + b"\x00" * 100), "audio/webm")},
            data={"participant_id": "test_user", "clip_id": "1",
                  "ground_truth": "My farm uses an NFT system.", "group": "A"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "saved"
    assert body["clip_id"] == 1
    assert body["participant_id"] == "test_user"
    manifest = json.loads((tmp_path / "test_user" / "manifest.json").read_text())
    assert manifest["clips"]["1"]["ground_truth"] == "My farm uses an NFT system."
    assert manifest["clips"]["1"]["group"] == "A"


@pytest.mark.asyncio
async def test_upload_overwrites_duplicate_clip(tmp_path, monkeypatch):
    monkeypatch.chdir("/home/chandan/Downloads/aquaponic-ai/backend")
    from main import app
    import routers.eval as eval_router
    monkeypatch.setattr(eval_router, "CLIPS_DIR", tmp_path)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for _ in range(2):
            await client.post(
                "/api/v1/eval/upload",
                files={"audio": ("clip.webm", io.BytesIO(b"RIFF" + b"\x00" * 100), "audio/webm")},
                data={"participant_id": "test_user", "clip_id": "1",
                      "ground_truth": "My farm uses an NFT system.", "group": "A"},
            )
    manifest = json.loads((tmp_path / "test_user" / "manifest.json").read_text())
    assert len(manifest["clips"]) == 1


@pytest.mark.asyncio
async def test_status_returns_idle_when_no_results(tmp_path, monkeypatch):
    monkeypatch.chdir("/home/chandan/Downloads/aquaponic-ai/backend")
    from main import app
    import routers.eval as eval_router
    monkeypatch.setattr(eval_router, "RESULTS_DIR", tmp_path)
    monkeypatch.setattr(eval_router, "STATUS_FILE", tmp_path / "status.json")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/eval/status")
    assert response.status_code == 200
    assert response.json()["status"] == "idle"


@pytest.mark.asyncio
async def test_run_returns_started_when_clips_exist(tmp_path, monkeypatch):
    monkeypatch.chdir("/home/chandan/Downloads/aquaponic-ai/backend")
    from main import app
    import routers.eval as eval_router
    monkeypatch.setattr(eval_router, "CLIPS_DIR", tmp_path)
    monkeypatch.setattr(eval_router, "RESULTS_DIR", tmp_path / "results")
    monkeypatch.setattr(eval_router, "STATUS_FILE", tmp_path / "results" / "status.json")

    # Create a master manifest with one participant
    (tmp_path / "results").mkdir()
    master = {"test_user": {"clips_recorded": 5, "complete": False}}
    (tmp_path / "master_manifest.json").write_text(json.dumps(master))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/eval/run")
    assert response.status_code == 200
    assert response.json()["status"] == "started"
