"""
Tests for template_compositor.py
Run from project root: python -m pytest tests/test_compositor.py -v
Requires: ffmpeg in PATH
"""

import os
import subprocess
import json
import pytest
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import sys
sys.path.insert(0, ROOT)

from backend.services.template_compositor import composite_template, get_available_backgrounds, _even


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def make_test_video(path, width=1920, height=1080, duration=5, audio=True):
    """Create a synthetic test video with ffmpeg lavfi."""
    audio_flag = ["-f", "lavfi", "-i", "sine=frequency=440:duration=" + str(duration)] if audio else ["-an"]
    cmd = ["ffmpeg", "-y",
           "-f", "lavfi", "-i", f"testsrc2=duration={duration}:size={width}x{height}:rate=30"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
            "-c:a", "aac", "-shortest", path]
    r = subprocess.run(cmd, capture_output=True, timeout=30)
    assert r.returncode == 0, f"Could not create test video: {r.stderr.decode()[-300:]}"


def get_dimensions(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path],
        capture_output=True, text=True, timeout=15
    )
    for s in json.loads(r.stdout).get("streams", []):
        if s.get("codec_type") == "video":
            return int(s["width"]), int(s["height"])
    return None, None


def get_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True, timeout=15
    )
    return float(json.loads(r.stdout).get("format", {}).get("duration", 0))


# ──────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def user_clip(tmp_path_factory):
    p = str(tmp_path_factory.mktemp("clips") / "user.mp4")
    make_test_video(p, 1920, 1080, duration=6)
    return p


@pytest.fixture(scope="module")
def short_bg_clip(tmp_path_factory):
    """Background clip shorter than user clip (3s vs 6s)."""
    p = str(tmp_path_factory.mktemp("clips") / "bg_short.mp4")
    make_test_video(p, 1080, 1920, duration=3)
    return p


@pytest.fixture(scope="module")
def portrait_user_clip(tmp_path_factory):
    p = str(tmp_path_factory.mktemp("clips") / "user_portrait.mp4")
    make_test_video(p, 1080, 1920, duration=6)
    return p


# ──────────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────────

def test_gameplay_split_dimensions(user_clip, short_bg_clip, tmp_path):
    out = str(tmp_path / "out.mp4")
    composite_template(user_clip, short_bg_clip, {"layout": "gameplay_split", "default_split_ratio": 0.55}, out)
    assert os.path.exists(out) and os.path.getsize(out) > 1000
    w, h = get_dimensions(out)
    assert w == 1080 and h == 1920, f"Expected 1080x1920, got {w}x{h}"


def test_background_loops(user_clip, short_bg_clip, tmp_path):
    """Output duration should match user clip (bg is shorter and must loop)."""
    out = str(tmp_path / "out_loop.mp4")
    user_dur = get_duration(user_clip)
    composite_template(user_clip, short_bg_clip, {"layout": "gameplay_split", "default_split_ratio": 0.55}, out)
    out_dur = get_duration(out)
    assert abs(out_dur - user_dur) < 1.5, f"Expected ~{user_dur:.1f}s output, got {out_dur:.1f}s"


def test_no_ffmpeg_expressions():
    """All filter strings must contain only pre-computed integers, no math operators."""
    from backend.services.template_compositor import (
        _layout_vstack, _layout_hstack, _layout_pip, _layout_caption_bar
    )
    import re
    import unittest.mock as mock

    captured = []
    def fake_run(cmd, label=""):
        # Grab filter_complex and vf args
        for i, arg in enumerate(cmd):
            if arg in ("-filter_complex", "-vf") and i + 1 < len(cmd):
                captured.append(cmd[i + 1])
        return True

    with mock.patch("backend.services.template_compositor._run", side_effect=fake_run):
        with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
            path = f.name
            try:
                _layout_vstack(path, None, 0.55, "/tmp/test_out.mp4")
                _layout_hstack(path, None, "/tmp/test_out2.mp4")
                _layout_caption_bar(path, "/tmp/test_out3.mp4")
            except Exception:
                pass

    for expr in captured:
        # No parentheses with arithmetic inside, no floating-point math operators
        assert "(" not in expr or "color=" in expr, f"FFmpeg expression found: {expr}"


def test_audio_from_user_only(user_clip, short_bg_clip, tmp_path):
    """The -map 0:a flag ensures only user audio is mapped (bg is muted)."""
    # We verify the composite command maps 0:a not 1:a
    import unittest.mock as mock

    mapped_audio = []
    original_run = subprocess.run

    def capture_run(cmd, **kwargs):
        cmd_str = " ".join(str(c) for c in cmd)
        if "ffmpeg" in cmd_str and "map" in cmd_str:
            parts = cmd if isinstance(cmd, list) else cmd.split()
            for i, p in enumerate(parts):
                if p == "-map" and i + 1 < len(parts):
                    mapped_audio.append(parts[i + 1])
        return original_run(cmd, **kwargs)

    out = str(tmp_path / "out_audio.mp4")
    with mock.patch("subprocess.run", side_effect=capture_run):
        composite_template(user_clip, short_bg_clip, {"layout": "gameplay_split", "default_split_ratio": 0.55}, out)

    # Should have mapped 0:a (user audio) — 1:a would be bg audio
    assert "0:a" in mapped_audio, f"Expected 0:a in audio mappings, got: {mapped_audio}"
    assert "1:a" not in mapped_audio, f"Background audio (1:a) should not be mapped, got: {mapped_audio}"


def test_split_ratio_range(user_clip, tmp_path):
    """Split ratios outside 0.4–0.75 should be clamped and still produce valid output."""
    for ratio in [0.1, 0.99]:
        out = str(tmp_path / f"out_ratio_{int(ratio*100)}.mp4")
        composite_template(user_clip, None, {"layout": "gameplay_split", "default_split_ratio": ratio}, out)
        assert os.path.exists(out) and os.path.getsize(out) > 1000


def test_missing_background_fallback(user_clip, tmp_path):
    """When bg_clip_path doesn't exist, should fall back to black bar and still produce output."""
    out = str(tmp_path / "out_no_bg.mp4")
    composite_template(user_clip, "/nonexistent/bg.mp4", {"layout": "gameplay_split", "default_split_ratio": 0.55}, out)
    assert os.path.exists(out) and os.path.getsize(out) > 1000
    w, h = get_dimensions(out)
    assert w == 1080 and h == 1920


def test_all_layouts(user_clip, short_bg_clip, tmp_path):
    """Each of the 5 layouts must produce a valid 1080x1920 output > 1KB."""
    configs = [
        {"layout": "gameplay_split", "default_split_ratio": 0.55},
        {"layout": "satisfying_split", "default_split_ratio": 0.55},
        {"layout": "side_by_side", "default_split_ratio": 0.5},
        {"layout": "picture_in_picture", "pip_scale": 0.30},
        {"layout": "caption_bar"},
    ]
    for cfg in configs:
        out = str(tmp_path / f"out_{cfg['layout']}.mp4")
        bg = None if cfg["layout"] == "caption_bar" else short_bg_clip
        composite_template(user_clip, bg, cfg, out)
        assert os.path.exists(out) and os.path.getsize(out) > 1000, f"{cfg['layout']} output missing or empty"
        w, h = get_dimensions(out)
        assert w == 1080 and h == 1920, f"{cfg['layout']}: expected 1080x1920, got {w}x{h}"


def test_even_helper():
    assert _even(1079) == 1080
    assert _even(1080) == 1080
    assert _even(100) == 100
    assert _even(101) == 102
