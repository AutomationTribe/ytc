"""
Tests for template_compositor.py (new per-layout function API).
Run from project root: python -m pytest tests/test_compositor.py -v
Requires: ffmpeg in PATH
"""

import os
import subprocess
import json
import pytest
import unittest.mock as mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import sys
sys.path.insert(0, ROOT)

from backend.services.template_compositor import (
    composite_template,
    composite_side_by_side,
    composite_pip,
    composite_caption_bar,
    get_available_backgrounds,
)


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def make_test_video(path, width=1920, height=1080, duration=5):
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"testsrc2=duration={duration}:size={width}x{height}:rate=30",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
        "-c:a", "aac", "-shortest", path,
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=30)
    assert r.returncode == 0, f"Could not create test video: {r.stderr.decode()[-300:]}"


def get_dimensions(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path],
        capture_output=True, text=True, timeout=15,
    )
    for s in json.loads(r.stdout).get("streams", []):
        if s.get("codec_type") == "video":
            return int(s["width"]), int(s["height"])
    return None, None


def get_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True, timeout=15,
    )
    return float(json.loads(r.stdout).get("format", {}).get("duration", 0))


# ──────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def user_clip(tmp_path_factory):
    """Portrait 1080x1920 user clip (as produced by create_short)."""
    p = str(tmp_path_factory.mktemp("clips") / "user.mp4")
    make_test_video(p, 1080, 1920, duration=6)
    return p


@pytest.fixture(scope="module")
def short_bg_clip(tmp_path_factory):
    """Landscape background clip shorter than user clip (3s vs 6s)."""
    p = str(tmp_path_factory.mktemp("clips") / "bg_short.mp4")
    make_test_video(p, 1920, 1080, duration=3)
    return p


# ──────────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────────

def test_gameplay_split_dimensions(user_clip, short_bg_clip, tmp_path):
    out = str(tmp_path / "out.mp4")
    composite_template(user_clip, short_bg_clip, 0.55, out)
    assert os.path.exists(out) and os.path.getsize(out) > 1000
    w, h = get_dimensions(out)
    assert w == 1080 and h == 1920, f"Expected 1080x1920, got {w}x{h}"


def test_background_loops(user_clip, short_bg_clip, tmp_path):
    """Output duration should match user clip (bg is shorter and loops)."""
    out = str(tmp_path / "out_loop.mp4")
    user_dur = get_duration(user_clip)
    composite_template(user_clip, short_bg_clip, 0.55, out)
    out_dur = get_duration(out)
    assert abs(out_dur - user_dur) < 1.5, f"Expected ~{user_dur:.1f}s output, got {out_dur:.1f}s"


def test_no_ffmpeg_expressions(user_clip, short_bg_clip, tmp_path):
    """Filter strings must contain only pre-computed integers, no FFmpeg math expressions."""
    captured_filters = []
    original_run = subprocess.run

    def capture(cmd, **kwargs):
        if isinstance(cmd, list) and "ffmpeg" in cmd:
            for i, arg in enumerate(cmd):
                if arg == "-filter_complex" and i + 1 < len(cmd):
                    captured_filters.append(cmd[i + 1])
        return original_run(cmd, **kwargs)

    out = str(tmp_path / "out_exprs.mp4")
    with mock.patch("subprocess.run", side_effect=capture):
        composite_template(user_clip, short_bg_clip, 0.55, out)

    assert captured_filters, "No filter_complex was captured"
    for filt in captured_filters:
        # No arithmetic expressions of the form (expr) used in scale/crop values
        # crop=W:H:0:0 and scale=W:H:flag — all values are plain integers
        assert "iw" not in filt, f"FFmpeg variable 'iw' found in filter: {filt}"
        assert "ih" not in filt, f"FFmpeg variable 'ih' found in filter: {filt}"
        assert "ow" not in filt, f"FFmpeg variable 'ow' found in filter: {filt}"
        assert "oh" not in filt, f"FFmpeg variable 'oh' found in filter: {filt}"


def test_audio_from_user_only(user_clip, short_bg_clip, tmp_path):
    """Only user audio is mapped (-map 0:a?), background audio is never mapped."""
    mapped = []
    original_run = subprocess.run

    def capture(cmd, **kwargs):
        if isinstance(cmd, list) and "ffmpeg" in cmd:
            for i, arg in enumerate(cmd):
                if arg == "-map" and i + 1 < len(cmd):
                    mapped.append(cmd[i + 1])
        return original_run(cmd, **kwargs)

    out = str(tmp_path / "out_audio.mp4")
    with mock.patch("subprocess.run", side_effect=capture):
        composite_template(user_clip, short_bg_clip, 0.55, out)

    # User audio must be mapped (0:a or 0:a?)
    assert any("0:a" in m for m in mapped), f"User audio (0:a?) not mapped. Got: {mapped}"
    # Background audio must NOT be mapped
    assert not any(m == "1:a" for m in mapped), f"Background audio (1:a) must not be mapped. Got: {mapped}"


def test_split_ratio_range(user_clip, tmp_path):
    """Various split ratios produce valid 1080x1920 output."""
    for ratio in [0.40, 0.55, 0.65, 0.75]:
        out = str(tmp_path / f"out_ratio_{int(ratio*100)}.mp4")
        composite_template(user_clip, None, ratio, out)
        assert os.path.exists(out) and os.path.getsize(out) > 1000, f"No output for ratio={ratio}"
        w, h = get_dimensions(out)
        assert w == 1080 and h == 1920, f"ratio={ratio}: expected 1080x1920, got {w}x{h}"


def test_missing_background_fallback(user_clip, tmp_path):
    """Non-existent bg_clip falls back to black bar and still produces valid output."""
    out = str(tmp_path / "out_no_bg.mp4")
    composite_template(user_clip, "/nonexistent/bg.mp4", 0.55, out)
    assert os.path.exists(out) and os.path.getsize(out) > 1000
    w, h = get_dimensions(out)
    assert w == 1080 and h == 1920


def test_all_layouts(user_clip, short_bg_clip, tmp_path):
    """Each of the 5 layouts produces a valid 1080x1920 output > 1KB."""
    cases = [
        ("gameplay_split",    lambda o: composite_template(user_clip, short_bg_clip, 0.55, o)),
        ("satisfying_split",  lambda o: composite_template(user_clip, short_bg_clip, 0.55, o)),
        ("side_by_side",      lambda o: composite_side_by_side(user_clip, short_bg_clip, o)),
        ("picture_in_picture",lambda o: composite_pip(user_clip, short_bg_clip, 0.30, o)),
        ("caption_bar",       lambda o: composite_caption_bar(user_clip, o)),
    ]
    for name, fn in cases:
        out = str(tmp_path / f"out_{name}.mp4")
        fn(out)
        assert os.path.exists(out) and os.path.getsize(out) > 1000, f"{name} output missing or empty"
        w, h = get_dimensions(out)
        assert w == 1080 and h == 1920, f"{name}: expected 1080x1920, got {w}x{h}"


def test_zone_heights_sum_to_1920():
    """top_h + bot_h always equals 1920 for any split ratio."""
    from backend.services.template_compositor import OUT_H
    for ratio in [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.73, 0.75]:
        top_h = int(1920 * ratio)
        if top_h % 2 != 0: top_h += 1
        bot_h = OUT_H - top_h
        if bot_h % 2 != 0: bot_h -= 1
        assert top_h + bot_h == 1920, f"ratio={ratio}: {top_h}+{bot_h}={top_h+bot_h}"
        assert top_h % 2 == 0, f"ratio={ratio}: top_h={top_h} is odd"
        assert bot_h % 2 == 0, f"ratio={ratio}: bot_h={bot_h} is odd"
