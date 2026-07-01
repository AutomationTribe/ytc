import subprocess
import os
import json

OUT_H = 1920  # portrait default, used in tests


def get_video_info(path):
    """Get width, height, duration of a video file."""
    r = subprocess.run([
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", "-show_format", path
    ], capture_output=True, text=True, timeout=30)
    data = json.loads(r.stdout)
    w, h = 1920, 1080
    for s in data.get("streams", []):
        if s.get("codec_type") == "video":
            w = int(s["width"])
            h = int(s["height"])
            break
    dur = float(data.get("format", {}).get("duration", 0))
    return w, h, dur


def _dims(output_format):
    """Return (OUT_W, OUT_H) for the requested format."""
    if output_format == "landscape":
        return 1920, 1080
    return 1080, 1920


def composite_gameplay_split(user_clip, bg_clip, split_ratio, output_path,
                              preset="fast", crf="23", output_format="portrait"):
    """
    Top = user video, Bottom = background clip.
    Both zones fill full width with ZERO black bars.
    output_format="portrait" → 1080x1920 (Shorts/TikTok)
    output_format="landscape" → 1920x1080 (YouTube/Facebook)
    """
    OUT_W, OUT_H = _dims(output_format)

    top_h = int(OUT_H * split_ratio)
    if top_h % 2 != 0:
        top_h += 1
    bot_h = OUT_H - top_h
    if bot_h % 2 != 0:
        bot_h -= 1
        top_h += 1  # keep sum at OUT_H

    print(f"[compositor] {output_format} {OUT_W}x{OUT_H} split={split_ratio} top={top_h} bot={bot_h} sum={top_h + bot_h}")

    fc = (
        f"[0:v]scale={OUT_W}:{top_h}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{top_h}:(iw-{OUT_W})/2:(ih-{top_h})/2[top];"
        f"[1:v]scale={OUT_W}:{bot_h}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{bot_h}:(iw-{OUT_W})/2:(ih-{bot_h})/2[bot];"
        f"[top][bot]vstack=inputs=2[out]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", user_clip,
        "-stream_loop", "-1", "-i", bg_clip,
        "-filter_complex", fc,
        "-map", "[out]", "-map", "0:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", preset, "-crf", crf,
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        "-shortest",
        output_path
    ]

    print(f"[compositor] Starting FFmpeg for {os.path.getsize(user_clip)//1024//1024}MB video...")
    print(f"[compositor] This may take 5-15 minutes for long videos")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)

    if result.returncode != 0:
        print(f"[compositor] FAILED: {result.stderr[-500:]}")
        return False

    w, h, _ = get_video_info(output_path)
    print(f"[compositor] Output: {w}x{h}")
    if w != OUT_W or h != OUT_H:
        print(f"[compositor] WRONG DIMENSIONS: expected {OUT_W}x{OUT_H}, got {w}x{h}")
        return False

    return True


def composite_side_by_side(user_clip, bg_clip, split_ratio, output_path,
                            preset="fast", crf="23", output_format="portrait"):
    """Left = user video, Right = background clip."""
    OUT_W, OUT_H = _dims(output_format)

    # For portrait: split horizontally (widths sum to OUT_W=1080, full height=1920)
    # For landscape: split horizontally (widths sum to OUT_W=1920, full height=1080)
    left_w = int(OUT_W * split_ratio)
    if left_w % 2 != 0:
        left_w += 1
    right_w = OUT_W - left_w
    if right_w % 2 != 0:
        right_w -= 1
        left_w += 1

    fc = (
        f"[0:v]scale={left_w}:{OUT_H}:force_original_aspect_ratio=increase,"
        f"crop={left_w}:{OUT_H}:(iw-{left_w})/2:(ih-{OUT_H})/2[left];"
        f"[1:v]scale={right_w}:{OUT_H}:force_original_aspect_ratio=increase,"
        f"crop={right_w}:{OUT_H}:(iw-{right_w})/2:(ih-{OUT_H})/2[right];"
        f"[left][right]hstack=inputs=2[out]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", user_clip,
        "-stream_loop", "-1", "-i", bg_clip,
        "-filter_complex", fc,
        "-map", "[out]", "-map", "0:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", preset, "-crf", crf,
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        output_path
    ]

    print(f"[compositor] Starting FFmpeg for {os.path.getsize(user_clip)//1024//1024}MB video...")
    print(f"[compositor] This may take 5-15 minutes for long videos")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    return result.returncode == 0


def composite_pip(user_clip, bg_clip, pip_scale, output_path,
                  preset="fast", crf="23", output_format="portrait"):
    """Background fullscreen, user video as small corner overlay."""
    OUT_W, OUT_H = _dims(output_format)

    pip_w = int(OUT_W * pip_scale)
    pip_h = int(OUT_H * pip_scale)
    if pip_w % 2 != 0: pip_w += 1
    if pip_h % 2 != 0: pip_h += 1
    margin = 20
    x = OUT_W - pip_w - margin
    y = OUT_H - pip_h - margin

    fc = (
        f"[1:v]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{OUT_H}:(iw-{OUT_W})/2:(ih-{OUT_H})/2[bg];"
        f"[0:v]scale={pip_w}:{pip_h}:force_original_aspect_ratio=increase,"
        f"crop={pip_w}:{pip_h}:(iw-{pip_w})/2:(ih-{pip_h})/2[pip];"
        f"[bg][pip]overlay={x}:{y}[out]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", user_clip,
        "-stream_loop", "-1", "-i", bg_clip,
        "-filter_complex", fc,
        "-map", "[out]", "-map", "0:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", preset, "-crf", crf,
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        output_path
    ]

    print(f"[compositor] Starting FFmpeg for {os.path.getsize(user_clip)//1024//1024}MB video...")
    print(f"[compositor] This may take 5-15 minutes for long videos")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    return result.returncode == 0


def composite_caption_bar(user_clip, split_ratio, bar_color, output_path,
                           preset="fast", crf="23", output_format="portrait"):
    """User video on top, solid color bar on bottom. No bg clip needed."""
    OUT_W, OUT_H = _dims(output_format)

    top_h = int(OUT_H * split_ratio)
    if top_h % 2 != 0: top_h += 1

    fc = (
        f"[0:v]scale={OUT_W}:{top_h}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{top_h}:(iw-{OUT_W})/2:(ih-{top_h})/2,"
        f"pad={OUT_W}:{OUT_H}:0:0:{bar_color}[out]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", user_clip,
        "-filter_complex", fc,
        "-map", "[out]", "-map", "0:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", preset, "-crf", crf,
        "-c:a", "aac", "-b:a", "128k",
        output_path
    ]

    print(f"[compositor] Starting FFmpeg for {os.path.getsize(user_clip)//1024//1024}MB video...")
    print(f"[compositor] This may take 5-15 minutes for long videos")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    return result.returncode == 0


def composite_template(user_clip, bg_clip, template_id, split_ratio, output_path,
                        pip_scale=0.3, bar_color="black", fast=False,
                        output_format="portrait"):
    """
    Main entry point. Routes to the correct layout compositor.
    fast=True        → ultrafast/crf28 encoding (used for full_video mode)
    output_format    → "portrait" (1080x1920) or "landscape" (1920x1080)
    """
    preset = "ultrafast" if fast else "fast"
    crf = "28" if fast else "23"

    print(f"[compositor] template={template_id} split={split_ratio} preset={preset} crf={crf} format={output_format} user={user_clip} bg={bg_clip}")

    if template_id in ("gameplay_split", "satisfying_split"):
        return composite_gameplay_split(user_clip, bg_clip, split_ratio, output_path,
                                        preset=preset, crf=crf, output_format=output_format)
    elif template_id == "side_by_side":
        return composite_side_by_side(user_clip, bg_clip, split_ratio, output_path,
                                      preset=preset, crf=crf, output_format=output_format)
    elif template_id == "picture_in_picture":
        return composite_pip(user_clip, bg_clip, pip_scale, output_path,
                             preset=preset, crf=crf, output_format=output_format)
    elif template_id == "caption_bar":
        return composite_caption_bar(user_clip, split_ratio, bar_color, output_path,
                                     preset=preset, crf=crf, output_format=output_format)
    else:
        print(f"[compositor] Unknown template: {template_id}, defaulting to gameplay_split")
        return composite_gameplay_split(user_clip, bg_clip, split_ratio, output_path,
                                        preset=preset, crf=crf, output_format=output_format)


def is_valid_background_clip(fpath, max_duration=600):
    """
    Reject corrupt/incomplete downloads before they reach the compositor.
    Background clips are meant to be short (~20-30s) loops; a file claiming
    hours of duration or with no decodable video stream is a broken leftover
    (e.g. an interrupted yt-dlp download), not real content.
    """
    try:
        w, h, dur = get_video_info(fpath)
    except Exception:
        return False
    return w > 0 and h > 0 and 0 < dur <= max_duration


def get_available_backgrounds(category=None):
    bg_dir = "backgrounds"
    result = {}
    categories = [category] if category else os.listdir(bg_dir)
    for cat in categories:
        cat_path = os.path.join(bg_dir, cat)
        if not os.path.isdir(cat_path):
            continue
        clips = []
        for f in os.listdir(cat_path):
            if f.endswith((".mp4", ".mov", ".webm")):
                fpath = os.path.join(cat_path, f)
                if not is_valid_background_clip(fpath):
                    print(f"[compositor] Skipping invalid background clip: {fpath}")
                    continue
                clips.append({
                    "id": f,
                    "name": f.rsplit(".", 1)[0].replace("_", " ").title(),
                    "path": fpath,
                })
        result[cat] = clips
    return result if category is None else result.get(category, [])
