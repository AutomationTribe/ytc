import subprocess
import os
import json
from backend.services.template_service import TEMPLATES

OUTPUT_DIR = "outputs"


def process_clips(video_path, analysis, mode, template_id, voice_style, elevenlabs_api_key, job_id):
    outputs = []
    clips = analysis.get("clips", [])
    job_out = os.path.join(OUTPUT_DIR, job_id)
    os.makedirs(job_out, exist_ok=True)

    src_w, src_h = get_video_dimensions(video_path)
    print(f"[proc] Source: {src_w}x{src_h}, mode={mode}, clips={len(clips)}")

    for i, clip in enumerate(clips):
        start = float(clip["start_time"])
        end = float(clip["end_time"])
        dur = round(end - start, 1)
        out_path = os.path.join(job_out, f"clip_{i+1}.mp4")
        print(f"[proc] Clip {i+1}: {start:.1f}→{end:.1f}s ({dur}s)")

        try:
            if mode == "shorts":
                create_short(video_path, start, end, src_w, src_h, out_path)
            elif mode == "template":
                tmpl = TEMPLATES.get(template_id, TEMPLATES["split_reaction"])
                create_template_clip(video_path, start, end, tmpl, src_w, src_h, out_path)
            elif mode == "voiceover":
                narration = clip.get("narration", clip.get("commentary", ""))
                create_voiceover_clip(video_path, start, end, src_w, src_h, narration, voice_style, elevenlabs_api_key, out_path)
        except Exception as e:
            print(f"[proc] Clip {i+1} error: {e}")
            continue

        if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
            print(f"[proc] ✅ Clip {i+1}: {os.path.getsize(out_path)//1024}KB")
            outputs.append({
                "path": f"/outputs/{job_id}/clip_{i+1}.mp4",
                "title": clip.get("title", f"Clip {i+1}"),
                "caption": clip.get("caption", ""),
                "hook": clip.get("hook", ""),
                "start": start, "end": end, "duration": dur,
            })

    return outputs


def get_video_dimensions(path):
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path],
            capture_output=True, text=True, timeout=30
        )
        for s in json.loads(r.stdout).get("streams", []):
            if s.get("codec_type") == "video":
                return int(s["width"]), int(s["height"])
    except Exception as e:
        print(f"[proc] ffprobe fail: {e}")
    return 1920, 1080


def build_landscape_to_portrait_filter(src_w, src_h, out_w=1080, out_h=1920):
    """
    For LANDSCAPE videos → 9:16 portrait.
    Shows the FULL frame centered with a blurred zoomed version behind.
    This keeps all faces/subjects visible.
    """
    # Foreground: fit full frame within out_w width
    fg_h = int(out_w * src_h / src_w)
    if fg_h % 2 == 1:
        fg_h += 1

    # Position foreground in upper portion (faces are usually upper half)
    overlay_y = int((out_h - fg_h) * 0.3)  # 30% from top

    # Background: zoomed + blurred version
    bg_scale_w = out_w
    bg_scale_h = out_h

    return (
        f"split=2[bg_in][fg_in];"
        f"[bg_in]scale={bg_scale_w}:{bg_scale_h}:force_original_aspect_ratio=increase,"
        f"crop={out_w}:{out_h},gblur=sigma=35[bg];"
        f"[fg_in]scale={out_w}:{fg_h}[fg];"
        f"[bg][fg]overlay=0:{overlay_y}"
    )


def build_portrait_filter(src_w, src_h, out_w=1080, out_h=1920):
    """For PORTRAIT or SQUARE videos — simple scale + crop, already vertical."""
    # Scale to fill, crop center
    scale_w = out_w
    scale_h = int(out_w / (src_w / src_h))
    if scale_h < out_h:
        scale_h = out_h
        scale_w = int(out_h * (src_w / src_h))
    crop_x = max(0, (scale_w - out_w) // 2)
    crop_y = max(0, (scale_h - out_h) // 2)
    return f"scale={scale_w}:{scale_h},crop={out_w}:{out_h}:{crop_x}:{crop_y}"


def get_vf(src_w, src_h, out_w=1080, out_h=1920):
    """Pick the right filter based on source aspect ratio."""
    ratio = src_w / src_h
    if ratio > 1.15:
        # Landscape → use blurred background to keep faces visible
        return build_landscape_to_portrait_filter(src_w, src_h, out_w, out_h)
    else:
        # Portrait/square → simple scale+crop works fine
        return build_portrait_filter(src_w, src_h, out_w, out_h)


ENC = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "23",
       "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]


def run_ff(cmd, label=""):
    full = ["ffmpeg", "-y"] + cmd
    print(f"[ff {label}] running...")
    r = subprocess.run(full, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        print(f"[ff ERROR] {r.stderr[-500:]}")
        return False
    return True


def is_landscape(src_w, src_h):
    return (src_w / src_h) > 1.15


def create_short(vpath, start, end, src_w, src_h, out):
    vf = get_vf(src_w, src_h)
    if is_landscape(src_w, src_h):
        # Landscape: use filter_complex for split/overlay pipeline
        run_ff(["-ss", str(start), "-to", str(end), "-i", vpath,
                "-filter_complex", vf] + ENC + [out], "short")
    else:
        # Portrait/square: simple -vf filter
        run_ff(["-ss", str(start), "-to", str(end), "-i", vpath,
                "-vf", vf] + ENC + [out], "short")


def create_template_clip(vpath, start, end, tmpl, src_w, src_h, out):
    layout = tmpl.get("layout", "vertical_split")
    if layout == "vertical_split":
        # Top: video. Bottom: black space for text
        if is_landscape(src_w, src_h):
            # Fit full frame in top 60%
            top_h = 1152  # 60% of 1920
            fg_h = int(1080 * src_h / src_w)
            if fg_h % 2: fg_h += 1
            if fg_h > top_h: fg_h = top_h
            pad_y = (top_h - fg_h) // 2
            vf = f"scale=1080:{fg_h},pad=1080:1920:0:{pad_y}:black"
            run_ff(["-ss", str(start), "-to", str(end), "-i", vpath,
                    "-vf", vf] + ENC + [out], "tmpl-vsplit")
        else:
            vf = build_portrait_filter(src_w, src_h, 1080, 960)
            run_ff(["-ss", str(start), "-to", str(end), "-i", vpath,
                    "-vf", vf + ",pad=1080:1920:0:0:black"] + ENC + [out], "tmpl-vsplit")
    elif layout == "horizontal_split":
        vf = build_portrait_filter(src_w, src_h, 540, 1920)
        run_ff(["-ss", str(start), "-to", str(end), "-i", vpath,
                "-vf", vf + ",pad=1080:1920:0:0:black"] + ENC + [out], "tmpl-hsplit")
    else:
        create_short(vpath, start, end, src_w, src_h, out)


def create_voiceover_clip(vpath, start, end, src_w, src_h, narration, voice_style, elab_key, out):
    base = out.replace(".mp4", "_base.mp4")
    create_short(vpath, start, end, src_w, src_h, base)

    if elab_key and narration and os.path.exists(base):
        audio = out.replace(".mp4", "_voice.mp3")
        if gen_elevenlabs(narration, elab_key, voice_style, audio):
            ok = run_ff([
                "-i", base, "-i", audio,
                "-filter_complex", "[0:a]volume=0.15[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=shortest[aout]",
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", out
            ], "voice-merge")
            if ok:
                for f in [base, audio]:
                    if os.path.exists(f): os.remove(f)
                return

    if os.path.exists(base):
        os.rename(base, out)


def gen_elevenlabs(text, key, style, path):
    import requests
    ids = {"deep": "VR6AewLTigWG4xSOukaG", "narrator": "ErXwobaYiN019PkySvjV", "dramatic": "TxGEqnHWrfWFTfGW9XjX"}
    try:
        r = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{ids.get(style, ids['deep'])}",
            headers={"Accept": "audio/mpeg", "Content-Type": "application/json", "xi-api-key": key},
            json={"text": text, "model_id": "eleven_monolingual_v1", "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}},
            timeout=30
        )
        if r.status_code == 200:
            with open(path, "wb") as f: f.write(r.content)
            return True
    except Exception as e:
        print(f"[11labs] {e}")
    return False
