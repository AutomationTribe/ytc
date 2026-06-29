import os
import subprocess
import json

BACKGROUNDS_DIR = "backgrounds"
OUT_W, OUT_H = 1080, 1920

ENC = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "23",
       "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]


def _run(cmd, label=""):
    full = ["ffmpeg", "-y"] + cmd
    r = subprocess.run(full, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise RuntimeError(f"[ff {label}] {r.stderr[-800:]}")
    return True


def _even(n):
    """Ensure integer is even (required by libx264)."""
    n = int(n)
    return n if n % 2 == 0 else n + 1


def _get_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True, timeout=30
    )
    return float(json.loads(r.stdout).get("format", {}).get("duration", 0))


def composite_template(user_clip_path, bg_clip_path, template_config, output_path):
    """
    Composite user clip + background clip into a 1080x1920 vertical video.
    Falls back to black bar if bg_clip_path is missing/None.
    """
    layout = template_config.get("layout", "gameplay_split")
    split_ratio = float(template_config.get("default_split_ratio", 0.55))
    split_ratio = max(0.4, min(0.75, split_ratio))

    has_bg = bg_clip_path and os.path.exists(bg_clip_path)

    if layout in ("gameplay_split", "satisfying_split"):
        _layout_vstack(user_clip_path, bg_clip_path if has_bg else None,
                       split_ratio, output_path)
    elif layout == "side_by_side":
        _layout_hstack(user_clip_path, bg_clip_path if has_bg else None,
                       output_path)
    elif layout == "picture_in_picture":
        pip_scale = float(template_config.get("pip_scale", 0.30))
        _layout_pip(user_clip_path, bg_clip_path if has_bg else None,
                    pip_scale, output_path)
    elif layout == "caption_bar":
        _layout_caption_bar(user_clip_path, output_path)
    else:
        _layout_vstack(user_clip_path, bg_clip_path if has_bg else None,
                       split_ratio, output_path)


# ──────────────────────────────────────────────────────────────
# Layout implementations
# ──────────────────────────────────────────────────────────────

def _layout_vstack(user_path, bg_path, split_ratio, out):
    """User on top, background on bottom. Stacked vertically."""
    top_h = _even(OUT_H * split_ratio)
    bot_h = OUT_H - top_h  # guaranteed even since OUT_H=1920 and top_h is even

    if bg_path:
        fc = (
            f"[0:v]scale={OUT_W}:{top_h}:force_original_aspect_ratio=decrease,"
            f"pad={OUT_W}:{top_h}:(ow-iw)/2:(oh-ih)/2:black[top];"
            f"[1:v]scale={OUT_W}:{bot_h}:force_original_aspect_ratio=decrease,"
            f"pad={OUT_W}:{bot_h}:(ow-iw)/2:(oh-ih)/2:black,setpts=PTS-STARTPTS[bot];"
            f"[top][bot]vstack=inputs=2[v]"
        )
        _run([
            "-ss", "0", "-i", user_path,
            "-stream_loop", "-1", "-i", bg_path,
            "-filter_complex", fc,
            "-map", "[v]", "-map", "0:a",
        ] + ENC + ["-shortest", out], "vstack")
    else:
        # No background: pad with black bar
        fc = (
            f"[0:v]scale={OUT_W}:{top_h}:force_original_aspect_ratio=decrease,"
            f"pad={OUT_W}:{top_h}:(ow-iw)/2:(oh-ih)/2:black[top];"
            f"color=black:{OUT_W}x{bot_h}:r=30[bot];"
            f"[top][bot]vstack=inputs=2[v]"
        )
        _run([
            "-i", user_path,
            "-filter_complex", fc,
            "-map", "[v]", "-map", "0:a",
        ] + ENC + ["-shortest", out], "vstack-noBg")


def _layout_hstack(user_path, bg_path, out):
    """User on left half, background on right half."""
    half_w = OUT_W // 2  # 540

    if bg_path:
        fc = (
            f"[0:v]scale={half_w}:{OUT_H}:force_original_aspect_ratio=decrease,"
            f"pad={half_w}:{OUT_H}:(ow-iw)/2:(oh-ih)/2:black[left];"
            f"[1:v]scale={half_w}:{OUT_H}:force_original_aspect_ratio=decrease,"
            f"pad={half_w}:{OUT_H}:(ow-iw)/2:(oh-ih)/2:black,setpts=PTS-STARTPTS[right];"
            f"[left][right]hstack=inputs=2[v]"
        )
        _run([
            "-i", user_path,
            "-stream_loop", "-1", "-i", bg_path,
            "-filter_complex", fc,
            "-map", "[v]", "-map", "0:a",
        ] + ENC + ["-shortest", out], "hstack")
    else:
        fc = (
            f"[0:v]scale={half_w}:{OUT_H}:force_original_aspect_ratio=decrease,"
            f"pad={half_w}:{OUT_H}:(ow-iw)/2:(oh-ih)/2:black[left];"
            f"color=black:{half_w}x{OUT_H}:r=30[right];"
            f"[left][right]hstack=inputs=2[v]"
        )
        _run([
            "-i", user_path,
            "-filter_complex", fc,
            "-map", "[v]", "-map", "0:a",
        ] + ENC + ["-shortest", out], "hstack-noBg")


def _layout_pip(user_path, bg_path, pip_scale, out):
    """Background fullscreen, user video as small overlay in bottom-right corner."""
    pip_w = _even(OUT_W * pip_scale)   # e.g. 324
    pip_h = _even(OUT_H * pip_scale)   # e.g. 576
    pad = 20

    if bg_path:
        fc = (
            f"[1:v]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease,"
            f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:(oh-ih)/2:black,setpts=PTS-STARTPTS[bg];"
            f"[0:v]scale={pip_w}:{pip_h}[pip];"
            f"[bg][pip]overlay={OUT_W - pip_w - pad}:{OUT_H - pip_h - pad}[v]"
        )
        _run([
            "-i", user_path,
            "-stream_loop", "-1", "-i", bg_path,
            "-filter_complex", fc,
            "-map", "[v]", "-map", "0:a",
        ] + ENC + ["-shortest", out], "pip")
    else:
        # Black background with pip user video in corner
        fc = (
            f"color=black:{OUT_W}x{OUT_H}:r=30[bg];"
            f"[0:v]scale={pip_w}:{pip_h}[pip];"
            f"[bg][pip]overlay={OUT_W - pip_w - pad}:{OUT_H - pip_h - pad}[v]"
        )
        _run([
            "-i", user_path,
            "-filter_complex", fc,
            "-map", "[v]", "-map", "0:a",
        ] + ENC + ["-shortest", out], "pip-noBg")


def _layout_caption_bar(user_path, out):
    """User video on top 70%, solid black bar on bottom 30%. No bg clip needed."""
    top_h = _even(OUT_H * 0.70)   # 1344
    bot_h = OUT_H - top_h          # 576

    fc = (
        f"[0:v]scale={OUT_W}:{top_h}:force_original_aspect_ratio=decrease,"
        f"pad={OUT_W}:{top_h}:(ow-iw)/2:(oh-ih)/2:black[top];"
        f"color=black:{OUT_W}x{bot_h}:r=30[bot];"
        f"[top][bot]vstack=inputs=2[v]"
    )
    _run([
        "-i", user_path,
        "-filter_complex", fc,
        "-map", "[v]", "-map", "0:a",
    ] + ENC + ["-shortest", out], "caption-bar")


# ──────────────────────────────────────────────────────────────
# Background clip helpers
# ──────────────────────────────────────────────────────────────

def get_available_backgrounds(category=None):
    """
    Scan backgrounds/ directory and return clip metadata.
    Returns {category: [{id, name, path, duration, category}]}
    """
    result = {}
    if not os.path.exists(BACKGROUNDS_DIR):
        return result

    cats = [category] if category else os.listdir(BACKGROUNDS_DIR)
    for cat in cats:
        cat_dir = os.path.join(BACKGROUNDS_DIR, cat)
        if not os.path.isdir(cat_dir):
            continue
        clips = []
        for fname in sorted(os.listdir(cat_dir)):
            if not fname.lower().endswith((".mp4", ".mov", ".webm")):
                continue
            fpath = os.path.join(cat_dir, fname)
            try:
                dur = _get_duration(fpath)
            except Exception:
                dur = 0
            clips.append({
                "id": fname,
                "name": os.path.splitext(fname)[0].replace("_", " ").title(),
                "path": fpath,
                "duration": round(dur, 1),
                "category": cat,
            })
        result[cat] = clips
    return result


def get_template_configs():
    from backend.services.template_service import TEMPLATES
    return TEMPLATES
