"""
API endpoint tests for ClipForge.
Run from project root: python -m pytest tests/test_api.py -v
Requires: backend server NOT running (uses TestClient).
"""

import os
import sys
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from fastapi.testclient import TestClient

# Change to project root so StaticFiles paths resolve correctly
os.chdir(ROOT)

from backend.main import app

client = TestClient(app, raise_server_exceptions=True)


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_backgrounds_endpoint():
    """GET /api/backgrounds returns a dict of categories with clip lists."""
    r = client.get("/api/backgrounds")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    # All expected categories should be present (even if empty)
    for cat in ("gameplay", "satisfying", "nature", "custom"):
        assert cat in data
        assert isinstance(data[cat], list)


def test_backgrounds_by_category():
    """GET /api/backgrounds/{category} returns clips for that category."""
    r = client.get("/api/backgrounds/gameplay")
    assert r.status_code == 200
    data = r.json()
    assert data["category"] == "gameplay"
    assert "clips" in data
    assert isinstance(data["clips"], list)


def test_backgrounds_invalid_category():
    """Unknown category returns 400."""
    r = client.get("/api/backgrounds/unknown_cat")
    assert r.status_code == 400


def test_upload_background(tmp_path):
    """POST /api/backgrounds/upload saves file and returns metadata."""
    import subprocess
    test_vid = str(tmp_path / "test_bg.mp4")
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc2=duration=2:size=1080x1920:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
        "-c:a", "aac", "-shortest", test_vid
    ], capture_output=True, timeout=30)

    with open(test_vid, "rb") as f:
        r = client.post(
            "/api/backgrounds/upload?category=custom",
            files={"file": ("test_bg.mp4", f, "video/mp4")}
        )

    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["category"] == "custom"
    assert data["url"].startswith("/backgrounds/custom/")

    # Cleanup
    saved = os.path.join(ROOT, "backgrounds", "custom", data["id"])
    if os.path.exists(saved):
        os.remove(saved)


def test_upload_background_invalid_type():
    """Uploading a non-video file returns 400."""
    r = client.post(
        "/api/backgrounds/upload?category=custom",
        files={"file": ("test.txt", b"not a video", "text/plain")}
    )
    assert r.status_code == 400


def test_templates_endpoint():
    """GET /api/templates returns all 5 template definitions."""
    r = client.get("/api/templates")
    assert r.status_code == 200
    data = r.json()
    assert "templates" in data
    ids = [t["id"] for t in data["templates"]]
    for expected in ("gameplay_split", "satisfying_split", "side_by_side", "picture_in_picture", "caption_bar"):
        assert expected in ids, f"Missing template: {expected}"


def test_process_with_template():
    """POST /api/process with mode=template and valid template_id returns a job_id."""
    r = client.post("/api/process", json={
        "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "mode": "template",
        "template_id": "gameplay_split",
        "provider": "groq",
        "api_key": "gsk_test_key_placeholder",
        "num_shorts": 1,
    })
    assert r.status_code == 200
    data = r.json()
    assert "job_id" in data


def test_invalid_template_id():
    """POST /api/process with unknown template_id returns 400."""
    r = client.post("/api/process", json={
        "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "mode": "template",
        "template_id": "nonexistent_template",
        "provider": "groq",
        "api_key": "gsk_test_key_placeholder",
    })
    assert r.status_code == 400


def test_process_missing_api_key():
    """POST /api/process without api_key (non-ollama provider) returns 400."""
    r = client.post("/api/process", json={
        "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "provider": "groq",
    })
    assert r.status_code == 400


def test_get_job_not_found():
    """GET /api/job/{unknown_id} returns 404."""
    r = client.get("/api/job/notexist")
    assert r.status_code == 404


# ──────────────────────────────────────────────────────────────
# template_output_mode addendum tests
# ──────────────────────────────────────────────────────────────

def test_process_full_video_mode_accepted():
    """POST /api/process with template_output_mode=full_video returns a job_id."""
    r = client.post("/api/process", json={
        "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "mode": "template",
        "template_id": "gameplay_split",
        "template_output_mode": "full_video",
        "provider": "groq",
        "api_key": "gsk_test_key_placeholder",
    })
    assert r.status_code == 200
    assert "job_id" in r.json()


def test_process_shorts_mode_default():
    """template_output_mode defaults to 'shorts' when omitted."""
    r = client.post("/api/process", json={
        "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "mode": "template",
        "template_id": "caption_bar",
        "provider": "groq",
        "api_key": "gsk_test_key_placeholder",
    })
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    job = client.get(f"/api/job/{job_id}").json()
    # Job exists and is queued (pipeline will fail without a real URL, but the job was created)
    assert job["job_id"] == job_id


def test_full_video_mode_no_api_key_needed_for_ollama():
    """full_video mode with ollama provider (no key) creates a job."""
    r = client.post("/api/process", json={
        "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "mode": "template",
        "template_id": "gameplay_split",
        "template_output_mode": "full_video",
        "provider": "ollama",
    })
    assert r.status_code == 200
    assert "job_id" in r.json()


def test_process_request_has_template_output_mode_field():
    """ProcessRequest accepts template_output_mode field without error."""
    for mode_val in ("shorts", "full_video"):
        r = client.post("/api/process", json={
            "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "mode": "template",
            "template_id": "gameplay_split",
            "template_output_mode": mode_val,
            "provider": "groq",
            "api_key": "gsk_test_key_placeholder",
        })
        assert r.status_code == 200, f"Failed for mode={mode_val}: {r.text}"
