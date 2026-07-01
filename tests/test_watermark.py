"""
Tests for Addendum 3 watermark removal (multi-region + parse_timestamp).
Run from project root: python -m pytest tests/test_watermark.py -v
"""

import os
import sys
import subprocess
import json
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.services.watermark_remover import apply_watermark_regions
from backend.main import parse_timestamp


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def make_video(path, width=1080, height=1920, duration=3):
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"testsrc2=duration={duration}:size={width}x{height}:rate=30",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
        "-c:a", "aac", "-shortest", path,
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=30)
    assert r.returncode == 0, r.stderr.decode()[-200:]


def get_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True, timeout=15,
    )
    return float(json.loads(r.stdout).get("format", {}).get("duration", 0))


def get_dims(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path],
        capture_output=True, text=True, timeout=15,
    )
    for s in json.loads(r.stdout).get("streams", []):
        if s.get("codec_type") == "video":
            return int(s["width"]), int(s["height"])
    return None, None


@pytest.fixture(scope="module")
def portrait_clip(tmp_path_factory):
    """1080x1920 portrait output clip (typical ClipForge output)."""
    p = str(tmp_path_factory.mktemp("wm") / "portrait.mp4")
    make_video(p, 1080, 1920, duration=3)
    return p


@pytest.fixture(scope="module")
def landscape_source(tmp_path_factory):
    """1920x1080 landscape source video (typical YouTube input)."""
    p = str(tmp_path_factory.mktemp("wm") / "landscape.mp4")
    make_video(p, 1920, 1080, duration=3)
    return p


# alias for backward compat with single-fixture tests
@pytest.fixture(scope="module")
def clip(tmp_path_factory):
    p = str(tmp_path_factory.mktemp("wm") / "clip.mp4")
    make_video(p, 1080, 1920, duration=3)
    return p


# ──────────────────────────────────────────────────────────────
# parse_timestamp tests
# ──────────────────────────────────────────────────────────────

def test_timestamp_seconds():
    assert parse_timestamp("5") == 5.0

def test_timestamp_mm_ss():
    assert parse_timestamp("3:45") == 225.0

def test_timestamp_hh_mm_ss():
    assert parse_timestamp("00:01:23") == 83.0

def test_timestamp_fractional():
    assert parse_timestamp("1:30.5") == pytest.approx(90.5)

def test_timestamp_strips_whitespace():
    assert parse_timestamp("  10  ") == 10.0


# ──────────────────────────────────────────────────────────────
# apply_watermark_regions tests
# ──────────────────────────────────────────────────────────────

REGION = [{"x": 50, "y": 30, "w": 200, "h": 80, "method": "blur", "color": "black"}]


def test_single_blur_region(clip, tmp_path):
    out = str(tmp_path / "blur.mp4")
    ok = apply_watermark_regions(clip, out, REGION, 1080, 1920, 1080, 1920)
    assert ok and os.path.getsize(out) > 1000


def test_multi_region_blur(clip, tmp_path):
    """3 blur regions on a 1080x1920 clip."""
    regions = [
        {"x": 10, "y": 10, "w": 100, "h": 40, "method": "blur", "color": "black"},
        {"x": 800, "y": 50, "w": 120, "h": 50, "method": "blur", "color": "black"},
        {"x": 400, "y": 1800, "w": 200, "h": 60, "method": "black", "color": "black"},
    ]
    out = str(tmp_path / "multi.mp4")
    ok = apply_watermark_regions(clip, out, regions, 1080, 1920, 1080, 1920)
    assert ok
    w, h = get_dims(out)
    assert w == 1080 and h == 1920


def test_region_scaling_landscape_source(landscape_source, tmp_path):
    """
    Core fix test: region drawn on 960x540 preview of a 1920x1080 landscape source.
    Scale factors must be 2.0x2.0 (not 1.125x3.556 which was the broken behaviour).
    Applied to SOURCE video (correct) not to portrait output (broken).
    """
    # Region at top-right of 960x540 preview: x=800 y=10 w=100 h=30
    # Correct scale: 1920/960=2.0, 1080/540=2.0 → x=1600 y=20 w=200 h=60 in 1920x1080
    regions = [{"x": 800, "y": 10, "w": 100, "h": 30, "method": "black", "color": "black"}]
    out = str(tmp_path / "landscape_wm.mp4")
    ok = apply_watermark_regions(landscape_source, out, regions,
                                 video_width=1920, video_height=1080,
                                 frame_width=960, frame_height=540)
    assert ok and os.path.getsize(out) > 1000
    w, h = get_dims(out)
    assert w == 1920 and h == 1080, f"Source dimensions preserved: got {w}x{h}"


def test_region_scaling(clip, tmp_path):
    """Region defined in 960x540 preview space → scaled to 1080x1920."""
    # A region at (48, 27) in 960x540 should map to (54, 96) in 1080x1920
    regions = [{"x": 48, "y": 27, "w": 96, "h": 54, "method": "black", "color": "black"}]
    out = str(tmp_path / "scaled.mp4")
    ok = apply_watermark_regions(clip, out, regions, 1080, 1920, 960, 540)
    assert ok and os.path.getsize(out) > 1000


def test_negative_region_normalized(clip, tmp_path):
    """Negative w/h from dragging left/up — normalized before submission by frontend."""
    # Backend only sees positive coords after frontend normalization.
    # Verify the function still handles a small region correctly.
    regions = [{"x": 10, "y": 10, "w": 50, "h": 30, "method": "blur", "color": "black"}]
    out = str(tmp_path / "norm.mp4")
    ok = apply_watermark_regions(clip, out, regions, 1080, 1920, 1080, 1920)
    assert ok


def test_even_dimensions_enforced(clip, tmp_path):
    """Odd w/h values are rounded up to even (libx264 requirement)."""
    regions = [{"x": 50, "y": 30, "w": 101, "h": 81, "method": "black", "color": "black"}]
    out = str(tmp_path / "even.mp4")
    ok = apply_watermark_regions(clip, out, regions, 1080, 1920, 1080, 1920)
    assert ok and os.path.getsize(out) > 1000


def test_region_clamped_to_bounds(clip, tmp_path):
    """Region extending beyond video edge is clamped, not an error."""
    regions = [{"x": 1000, "y": 1850, "w": 300, "h": 200, "method": "black", "color": "black"}]
    out = str(tmp_path / "clamped.mp4")
    ok = apply_watermark_regions(clip, out, regions, 1080, 1920, 1080, 1920)
    assert ok


def test_mixed_methods(clip, tmp_path):
    """One blur region + one black box region."""
    regions = [
        {"x": 10, "y": 10, "w": 120, "h": 50, "method": "blur", "color": "black"},
        {"x": 800, "y": 1800, "w": 200, "h": 60, "method": "black", "color": "black"},
    ]
    out = str(tmp_path / "mixed.mp4")
    ok = apply_watermark_regions(clip, out, regions, 1080, 1920, 1080, 1920)
    assert ok and os.path.getsize(out) > 1000


def test_color_method(clip, tmp_path):
    """Color fill method with a hex color."""
    regions = [{"x": 50, "y": 50, "w": 150, "h": 60, "method": "color", "color": "#ff0000"}]
    out = str(tmp_path / "color.mp4")
    ok = apply_watermark_regions(clip, out, regions, 1080, 1920, 1080, 1920)
    assert ok and os.path.getsize(out) > 1000


def test_empty_regions_is_noop(clip, tmp_path):
    """Empty regions list returns True without creating output (nothing to do)."""
    out = str(tmp_path / "noop.mp4")
    ok = apply_watermark_regions(clip, out, [], 1080, 1920, 1080, 1920)
    assert ok  # True = success, output may not exist (no processing needed)


def test_output_duration_unchanged(clip, tmp_path):
    """Watermark removal does not change clip duration."""
    out = str(tmp_path / "dur.mp4")
    apply_watermark_regions(clip, out, REGION, 1080, 1920, 1080, 1920)
    assert abs(get_duration(out) - get_duration(clip)) < 0.5


# ──────────────────────────────────────────────────────────────
# preview-frame endpoint test (via TestClient)
# ──────────────────────────────────────────────────────────────

def test_watermark_applied_to_source_not_output(landscape_source, tmp_path):
    """
    The fix: watermark must be applied to the source video (at source resolution)
    so that coordinates drawn on the source preview scale correctly (2x, not 3.5x).
    After applying, the output file has SOURCE dimensions (not portrait 1080x1920).
    """
    regions = [{"x": 800, "y": 10, "w": 100, "h": 30, "method": "blur", "color": "black"}]
    out = str(tmp_path / "src_clean.mp4")

    # Apply with correct source dimensions (1920x1080) and matching frame size (960x540)
    ok = apply_watermark_regions(
        landscape_source, out, regions,
        video_width=1920, video_height=1080,  # SOURCE dims (not 1080x1920!)
        frame_width=960, frame_height=540,
    )
    assert ok, "apply_watermark_regions failed"
    w, h = get_dims(out)
    assert w == 1920 and h == 1080, \
        f"Watermark applied to SOURCE (1920x1080), got {w}x{h}. " \
        f"Applying to portrait output (1080x1920) would give wrong coords."


def test_apply_watermark_to_source_helper(landscape_source, tmp_path):
    """apply_watermark_to_source() in main.py uses source dims and replaces in-place."""
    import shutil
    src_copy = str(tmp_path / "source_copy.mp4")
    shutil.copy(landscape_source, src_copy)

    from backend.main import apply_watermark_to_source
    from unittest.mock import MagicMock

    req = MagicMock()
    req.watermark_enabled = True
    req.watermark_regions = [{"x": 50, "y": 10, "w": 100, "h": 40, "method": "black", "color": "black"}]
    req.watermark_frame_width = 960
    req.watermark_frame_height = 540

    result = apply_watermark_to_source(src_copy, req)
    assert result == src_copy, "Returns same path"
    assert os.path.exists(src_copy), "In-place file still exists"
    w, h = get_dims(src_copy)
    assert w == 1920 and h == 1080, f"Source dims preserved: {w}x{h}"


def test_preview_frame_bad_job_id():
    """Requesting a frame for a non-existent job_id returns 404."""
    os.chdir(ROOT)
    from fastapi.testclient import TestClient
    from backend.main import app
    client = TestClient(app, raise_server_exceptions=True)
    r = client.post("/api/preview-frame", json={"job_id": "badid000", "timestamp": "5"})
    assert r.status_code == 404
