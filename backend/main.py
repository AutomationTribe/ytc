import os, uuid, asyncio, time, logging, shutil, subprocess, hashlib
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ClipForge", version="4.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

jobs = {}
MAX_CONCURRENT = 3
_sem = asyncio.Semaphore(MAX_CONCURRENT)

for d in ["downloads", "outputs", "backgrounds/gameplay", "backgrounds/satisfying", "backgrounds/nature", "backgrounds/custom"]:
    os.makedirs(d, exist_ok=True)

app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")
app.mount("/backgrounds", StaticFiles(directory="backgrounds"), name="backgrounds")


class ProcessRequest(BaseModel):
    youtube_url: Optional[str] = None
    uploaded_video_id: Optional[str] = None  # pre-uploaded local file
    mode: str = "shorts"
    template_id: Optional[str] = None
    num_shorts: int = 3
    max_duration: int = 180
    min_duration: int = 10
    voice_style: str = "deep"
    provider: str = "groq"
    model: Optional[str] = None
    api_key: Optional[str] = None
    elevenlabs_api_key: Optional[str] = None
    # Template compositor fields
    template_enabled: Optional[bool] = False
    bg_clip_id: Optional[str] = None
    bg_category: Optional[str] = "gameplay"
    split_ratio: Optional[float] = 0.55
    template_output_mode: Optional[str] = "shorts"  # legacy — kept for compatibility
    output_format: Optional[str] = "portrait"        # "portrait" (1080x1920) | "landscape" (1920x1080)
    # Watermark removal (Addendum 3)
    watermark_enabled: Optional[bool] = False
    watermark_regions: Optional[List[dict]] = None   # [{x, y, w, h, method, color}, ...]
    watermark_frame_width: Optional[int] = 960        # preview frame display width
    watermark_frame_height: Optional[int] = 540       # preview frame display height
    # Cut / remove segments (Addendum 6)
    cut_enabled: Optional[bool] = False
    cut_segments: Optional[List[dict]] = None         # [{start, end}, ...]


class FrameRequest(BaseModel):
    job_id: Optional[str] = None       # reuse an existing download
    youtube_url: Optional[str] = None  # fresh download (cached by URL hash)
    timestamp: str = "5"               # "5", "3:45", "00:01:23"


class KeywordRequest(BaseModel):
    transcript_excerpt: str
    clip_title: str
    style: str = "seo"        # seo | viral | news | niche
    provider: str = "groq"
    model: Optional[str] = None
    api_key: str = ""


@app.get("/")
def root():
    return {"status": "ok", "version": "4.0"}


# ──────────────────────────────────────────────────────────────
# Background clip endpoints
# ──────────────────────────────────────────────────────────────

@app.get("/api/backgrounds")
def list_all_backgrounds():
    from backend.services.template_compositor import get_available_backgrounds
    return get_available_backgrounds()


@app.get("/api/backgrounds/{category}")
def list_backgrounds_by_category(category: str):
    valid = {"gameplay", "satisfying", "nature", "custom"}
    if category not in valid:
        raise HTTPException(400, f"Category must be one of: {sorted(valid)}")
    from backend.services.template_compositor import get_available_backgrounds
    clips = get_available_backgrounds(category=category)  # returns a list when category is given
    for c in clips:
        c["url"] = f"/backgrounds/{category}/{c['id']}"
    return {"category": category, "clips": clips}


@app.post("/api/backgrounds/upload")
async def upload_background(category: str = "custom", file: UploadFile = File(...)):
    allowed = {".mp4", ".mov", ".webm"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"File type {ext} not supported. Use {allowed}")

    valid_cats = {"gameplay", "satisfying", "nature", "custom"}
    if category not in valid_cats:
        category = "custom"

    safe_name = uuid.uuid4().hex[:8] + ext
    dest_dir = os.path.join("backgrounds", category)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, safe_name)

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "id": safe_name,
        "name": os.path.splitext(file.filename)[0],
        "url": f"/backgrounds/{category}/{safe_name}",
        "category": category,
    }


# ──────────────────────────────────────────────────────────────
# Local video upload endpoint
# ──────────────────────────────────────────────────────────────

@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """Accept a local video file upload. Saves to downloads/{video_id}/video.mp4."""
    allowed = {".mp4", ".mov", ".webm", ".avi", ".mkv"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"File type '{ext}' not supported. Allowed: {sorted(allowed)}")

    video_id = str(uuid.uuid4())[:8]
    out_dir = os.path.join("downloads", video_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "video.mp4")

    with open(out_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    title = os.path.splitext(file.filename or "video")[0]
    logger.info(f"[upload] {title} → {out_path} ({size_mb:.1f}MB)")

    return {
        "video_id": video_id,
        "video_path": out_path,
        "filename": file.filename,
        "size_mb": round(size_mb, 1),
        "title": title,
    }


# ──────────────────────────────────────────────────────────────
# Templates endpoint
# ──────────────────────────────────────────────────────────────

@app.post("/api/regenerate-keywords")
async def regenerate_keywords(req: KeywordRequest):
    from backend.services.analyzer import generate_keywords
    result = await generate_keywords(
        req.transcript_excerpt, req.clip_title,
        req.style, req.api_key, req.provider, req.model
    )
    return result


@app.get("/api/templates")
def list_templates():
    from backend.services.template_service import TEMPLATES
    return {"templates": list(TEMPLATES.values())}


# ──────────────────────────────────────────────────────────────
# Watermark preview frame endpoint
# ──────────────────────────────────────────────────────────────

def parse_timestamp(ts: str) -> float:
    """Parse '5', '3:45', '00:01:23' → seconds as float."""
    ts = ts.strip()
    if ":" in ts:
        parts = ts.split(":")
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
    return float(ts)


def _find_video(dl_dir: str):
    """Return path of first video file found in dl_dir, or None."""
    if not os.path.isdir(dl_dir):
        return None
    for f in os.listdir(dl_dir):
        if f.lower().endswith((".mp4", ".mkv", ".webm")):
            return os.path.join(dl_dir, f)
    return None


def get_video_dimensions(path: str):
    """Return (width, height) of the first video stream."""
    import json as _json
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path],
        capture_output=True, text=True, timeout=30,
    )
    for s in _json.loads(r.stdout).get("streams", []):
        if s.get("codec_type") == "video":
            return int(s["width"]), int(s["height"])
    return 1920, 1080


@app.post("/api/preview-frame")
def capture_frame(req: FrameRequest):
    """
    Extract a frame at the given timestamp.
    Accepts either an existing job_id (video already downloaded) or a youtube_url
    (downloads to a cache dir keyed by URL hash — reused on subsequent calls).
    """
    if req.job_id:
        dl_dir = f"downloads/{req.job_id}"
        video_path = _find_video(dl_dir)
        if not video_path:
            raise HTTPException(404, "Video not found for this job_id — not downloaded yet")
        cache_key = req.job_id
    elif req.youtube_url:
        url_hash = hashlib.md5(req.youtube_url.encode()).hexdigest()[:8]
        cache_key = f"preview_{url_hash}"
        dl_dir = f"downloads/{cache_key}"
        video_path = _find_video(dl_dir)
        if not video_path:
            # Download the video on demand
            from backend.services.downloader import download_video
            try:
                video_path, _ = download_video(req.youtube_url, cache_key)
            except Exception as e:
                raise HTTPException(500, f"Download failed: {e}")
    else:
        raise HTTPException(400, "Provide either job_id or youtube_url")

    ts = parse_timestamp(req.timestamp)

    frame_dir = f"outputs/{cache_key}"
    os.makedirs(frame_dir, exist_ok=True)
    frame_path = f"{frame_dir}/preview_{int(ts)}s.jpg"

    result = subprocess.run([
        "ffmpeg", "-y",
        "-ss", str(ts),
        "-i", video_path,
        "-vframes", "1",
        "-q:v", "2",
        "-vf", "scale=960:-1",
        frame_path,
    ], capture_output=True, text=True, timeout=30)

    if result.returncode != 0 or not os.path.exists(frame_path):
        raise HTTPException(500, f"Frame extraction failed: {result.stderr[-200:]}")

    w, h = get_video_dimensions(video_path)

    # Use ffprobe to get actual saved frame dimensions instead of calculating them.
    # scale=960:-1 rounds height to even numbers, so the calculated value can be off by 1.
    actual_fw, actual_fh = 960, int(960 * h / w)  # fallback
    probe = subprocess.run([
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", frame_path,
    ], capture_output=True, text=True)
    if probe.returncode == 0:
        import json as _json
        probe_data = _json.loads(probe.stdout)
        for stream in probe_data.get("streams", []):
            if stream.get("codec_type") == "video":
                actual_fw = int(stream["width"])
                actual_fh = int(stream["height"])
                break

    return {
        "frame_url": f"/outputs/{cache_key}/preview_{int(ts)}s.jpg",
        "video_width": w,
        "video_height": h,
        "timestamp": ts,
        "frame_width": actual_fw,
        "frame_height": actual_fh,
        "cache_key": cache_key,
    }


# ──────────────────────────────────────────────────────────────
# Job processing
# ──────────────────────────────────────────────────────────────

@app.post("/api/process")
async def process_video(req: ProcessRequest, bg: BackgroundTasks):
    if not req.youtube_url and not req.uploaded_video_id:
        raise HTTPException(400, "Either youtube_url or uploaded_video_id is required")
    if not req.api_key and req.provider != "ollama":
        raise HTTPException(400, "API key required")

    if req.mode == "template" and req.template_id:
        from backend.services.template_service import TEMPLATES
        if req.template_id not in TEMPLATES:
            raise HTTPException(400, f"Unknown template_id '{req.template_id}'. Valid: {list(TEMPLATES.keys())}")

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"job_id": job_id, "status": "queued", "progress": 0, "message": "Starting...", "outputs": [], "error": None}
    bg.add_task(pipeline, job_id, req)
    return {"job_id": job_id}


@app.get("/api/job/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Not found")
    return jobs[job_id]


class DurationRequest(BaseModel):
    youtube_url: str


@app.post("/api/video-duration")
async def get_video_duration_endpoint(req: DurationRequest):
    """Get video duration without downloading — metadata-only via yt-dlp."""
    import yt_dlp
    try:
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "js_runtimes": {"node": {}},
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.youtube_url, download=False)
            return {"duration": info.get("duration", 0), "title": info.get("title", "")}
    except Exception as e:
        return {"duration": 0, "error": str(e)}


# ──────────────────────────────────────────────────────────────
# Pipeline helpers
# ──────────────────────────────────────────────────────────────

def get_video_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, timeout=30,
    )
    try:
        return round(float(r.stdout.strip()), 1)
    except (ValueError, AttributeError):
        return 0.0


def resolve_bg_clip(bg_clip_id, bg_category):
    if not bg_clip_id:
        return None
    cat = bg_category or "gameplay"
    candidate = os.path.join("backgrounds", cat, bg_clip_id)
    return candidate if os.path.exists(candidate) else None


# ──────────────────────────────────────────────────────────────
# Main pipeline
# ──────────────────────────────────────────────────────────────

async def pipeline(job_id, req):
    def up(status, pct, msg):
        jobs[job_id].update(status=status, progress=pct, message=msg)
        logger.info(f"[{job_id}] {pct}% {msg}")

    try:
        async with _sem:
            # 1. Get video — either use uploaded file or download from YouTube
            if req.uploaded_video_id:
                up("processing", 10, "Using uploaded video...")
                upload_dir = os.path.join("downloads", req.uploaded_video_id)
                candidates = [
                    f for f in os.listdir(upload_dir)
                    if f.lower().endswith((".mp4", ".mov", ".webm", ".avi", ".mkv"))
                ]
                if not candidates:
                    raise FileNotFoundError(f"No video found for upload_id={req.uploaded_video_id}")
                video_path = os.path.join(upload_dir, candidates[0])
                title = os.path.splitext(candidates[0])[0]
                logger.info(f"[{job_id}] Using uploaded video: {video_path}")
            else:
                if not req.youtube_url:
                    raise ValueError("Either youtube_url or uploaded_video_id is required")
                up("downloading", 10, "Downloading video from YouTube...")
                from backend.services.downloader import download_video
                video_path, title = await asyncio.to_thread(download_video, req.youtube_url, job_id)
                logger.info(f"[{job_id}] Downloaded: {video_path}")

            # 1b. Apply cuts if enabled (before transcription / routing)
            if req.cut_enabled and req.cut_segments:
                up("processing", 15, f"Removing {len(req.cut_segments)} segment(s)...")
                from backend.services.cutter import apply_cuts
                cut_output = video_path.replace(".mp4", "_cut.mp4")
                success = await asyncio.to_thread(apply_cuts, video_path, req.cut_segments, cut_output)
                if success and os.path.exists(cut_output):
                    os.replace(cut_output, video_path)
                    logger.info(f"[{job_id}] Cuts applied. Trimmed file: {video_path}")
                else:
                    logger.warning(f"[{job_id}] Cut failed — continuing with original video")

            # ── Routing decision ──
            output_format = req.output_format or "portrait"
            use_template = (req.template_enabled is True and req.template_id is not None)
            logger.info(
                f"[{job_id}] template_enabled={req.template_enabled} "
                f"template_id={req.template_id} "
                f"output_format={output_format} "
                f"use_template={use_template}"
            )

            # ── Shared helpers ──

            def apply_wm(file_path, src_w, src_h):
                """Apply watermark in-place. Always the last step before final output."""
                if not (req.watermark_enabled and req.watermark_regions):
                    return
                from backend.services.watermark_remover import apply_watermark_regions
                wm_out = file_path.replace(".mp4", "_clean.mp4")
                ok = apply_watermark_regions(
                    input_path=file_path, output_path=wm_out,
                    regions=req.watermark_regions,
                    video_width=src_w, video_height=src_h,
                    frame_width=req.watermark_frame_width or 960,
                    frame_height=req.watermark_frame_height or 540,
                )
                if ok and os.path.exists(wm_out):
                    os.replace(wm_out, file_path)
                    logger.info(f"[{job_id}] Watermark applied: {file_path}")

            async def gen_keywords(transcript_text):
                if not (req.api_key or req.provider == "ollama"):
                    return {}
                from backend.services.analyzer import generate_keywords
                try:
                    up("processing", 90, "Generating SEO keywords...")
                    return await generate_keywords(
                        transcript=transcript_text, title=title, style="seo",
                        api_key=req.api_key or "", provider=req.provider or "groq",
                        model=req.model,
                    )
                except Exception as e:
                    logger.error(f"[{job_id}] Keyword generation failed: {e}")
                    return {}

            def kw_fields(kw):
                return {
                    "primary_keywords": kw.get("primary_keywords", []),
                    "secondary_keywords": kw.get("secondary_keywords", []),
                    "hashtags": kw.get("hashtags", []),
                    "youtube_tags": kw.get("youtube_tags", ""),
                    "tiktok_description": kw.get("tiktok_description", ""),
                }

            # ── ROUTE A: landscape + template ──
            if output_format == "landscape" and use_template:
                logger.info(f"[{job_id}] ROUTE A: landscape + template")
                from backend.services.template_service import TEMPLATES
                import backend.services.template_compositor as tc

                up("processing", 40, "Compositing full video — this takes 5-15 mins for long videos. Please wait...")

                tmpl_id = req.template_id or "gameplay_split"
                template_config = TEMPLATES.get(tmpl_id, TEMPLATES["gameplay_split"])
                split_ratio = float(req.split_ratio or 0.55)
                layout = template_config.get("layout", "gameplay_split")
                bar_color = template_config.get("bar_color", "black")

                bg_clip_path = resolve_bg_clip(req.bg_clip_id, req.bg_category)
                if bg_clip_path:
                    logger.info(f"[{job_id}] Background clip: {bg_clip_path}")
                bg = bg_clip_path if bg_clip_path and os.path.exists(str(bg_clip_path)) else None
                if layout != "caption_bar" and bg is None:
                    logger.warning(f"[{job_id}] No bg clip found, skipping template composite")
                    tmpl_id = None
                    bg = None

                job_out = os.path.join("outputs", job_id)
                os.makedirs(job_out, exist_ok=True)
                out_path = os.path.join(job_out, "full_video.mp4")

                logger.info(f"[{job_id}] layout={layout} split_ratio={split_ratio:.4f} output_format={output_format}")
                if layout in ("gameplay_split", "satisfying_split"):
                    await asyncio.to_thread(tc.composite_template, video_path, bg, tmpl_id, split_ratio, out_path, fast=True, output_format=output_format)
                elif layout == "side_by_side":
                    await asyncio.to_thread(tc.composite_side_by_side, video_path, bg, split_ratio, out_path, preset="ultrafast", crf="28", output_format=output_format)
                elif layout == "picture_in_picture":
                    pip_scale = float(template_config.get("pip_scale", 0.30))
                    await asyncio.to_thread(tc.composite_pip, video_path, bg, pip_scale, out_path, preset="ultrafast", crf="28", output_format=output_format)
                elif layout == "caption_bar":
                    await asyncio.to_thread(tc.composite_caption_bar, video_path, split_ratio, bar_color, out_path, preset="ultrafast", crf="28", output_format=output_format)
                else:
                    await asyncio.to_thread(tc.composite_template, video_path, bg, tmpl_id, split_ratio, out_path, fast=True, output_format=output_format)

                duration = get_video_duration(out_path)
                kw = await gen_keywords(title)
                outputs = [{
                    "path": f"/outputs/{job_id}/full_video.mp4",
                    "title": title,
                    "caption": kw.get("tiktok_description", title),
                    "hook": "",
                    "start": 0, "end": duration, "duration": duration,
                    "template_id": tmpl_id,
                    "output_mode": "full_video",
                    "output_format": output_format,
                    **kw_fields(kw),
                }]
                src_w, src_h = get_video_dimensions(video_path)
                apply_wm(out_path, src_w, src_h)
                logger.info(f"[{job_id}] ROUTE A complete: {out_path}")

            # ── ROUTE B: landscape + no template ──
            elif output_format == "landscape" and not use_template:
                logger.info(f"[{job_id}] ROUTE B: landscape, no template")
                import subprocess as _sp
                up("processing", 40, "Processing full video...")
                job_out = os.path.join("outputs", job_id)
                os.makedirs(job_out, exist_ok=True)
                out_path = os.path.join(job_out, "full_video.mp4")
                cmd = [
                    "ffmpeg", "-y", "-i", video_path,
                    "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-preset", "fast", "-crf", "23",
                    "-c:a", "aac", "-b:a", "128k",
                    "-movflags", "+faststart",
                    out_path,
                ]
                result = _sp.run(cmd, capture_output=True, text=True, timeout=7200)
                if result.returncode != 0:
                    raise RuntimeError(f"FFmpeg failed: {result.stderr[-500:]}")

                duration = get_video_duration(out_path)
                kw = await gen_keywords(title)
                outputs = [{
                    "path": f"/outputs/{job_id}/full_video.mp4",
                    "title": title,
                    "caption": kw.get("tiktok_description", title),
                    "hook": "",
                    "start": 0, "end": duration, "duration": duration,
                    "template_id": None,
                    "output_mode": "full_video",
                    "output_format": output_format,
                    **kw_fields(kw),
                }]
                src_w, src_h = get_video_dimensions(video_path)
                apply_wm(out_path, src_w, src_h)
                logger.info(f"[{job_id}] ROUTE B complete: {out_path}")

            # ── ROUTE C: portrait + template ──
            elif use_template:
                logger.info(f"[{job_id}] ROUTE C: portrait + template")
                up("transcribing", 30, "Transcribing audio...")
                from backend.services.transcriber import transcribe_video
                transcript, segments = await asyncio.to_thread(transcribe_video, video_path)
                logger.info(f"[{job_id}] Transcript: {len(segments)} segments, {len(transcript)} chars")

                up("analyzing", 55, f"AI analyzing with {req.provider} (mode={req.mode})...")
                from backend.services.analyzer import analyze_content
                analysis = await analyze_content(
                    transcript, segments, req.mode, req.num_shorts,
                    api_key=req.api_key or "", provider=req.provider, model=req.model,
                )
                clips = analysis.get("clips", [])
                for c in clips:
                    dur = c["end_time"] - c["start_time"]
                    if dur > req.max_duration:
                        c["end_time"] = c["start_time"] + req.max_duration
                    if dur < req.min_duration:
                        c["end_time"] = c["start_time"] + req.min_duration
                clips = clips[:req.num_shorts]
                analysis["clips"] = clips
                logger.info(f"[{job_id}] After clamp: {len(clips)} clips")

                bg_clip_path = resolve_bg_clip(req.bg_clip_id, req.bg_category)
                effective_template_id = req.template_id
                if not bg_clip_path:
                    if req.bg_clip_id:
                        logger.warning(f"[{job_id}] Background clip not found: {req.bg_clip_id}")
                    from backend.services.template_service import TEMPLATES as _TMPLS
                    tmpl_layout = (_TMPLS.get(req.template_id) or {}).get("layout", "")
                    if tmpl_layout != "caption_bar":
                        logger.warning(f"[{job_id}] No bg clip found, skipping template composite")
                        effective_template_id = None
                else:
                    logger.info(f"[{job_id}] Background clip: {bg_clip_path}")

                up("processing", 70, f"Cutting {len(clips)} clips with template...")
                from backend.services.processor import process_clips
                outputs = await asyncio.to_thread(
                    process_clips, video_path, analysis, req.mode,
                    effective_template_id, req.voice_style, req.elevenlabs_api_key, job_id,
                    bg_clip_path=bg_clip_path, split_ratio=float(req.split_ratio or 0.55),
                )

                kw = await gen_keywords(transcript)
                src_w, src_h = get_video_dimensions(video_path)
                for clip in outputs:
                    clip["output_mode"] = "shorts"
                    clip["output_format"] = output_format
                    clip.update(kw_fields(kw))
                    if not clip.get("caption"):
                        clip["caption"] = kw.get("tiktok_description", title)
                    apply_wm(clip["path"].lstrip("/"), src_w, src_h)
                logger.info(f"[{job_id}] ROUTE C complete: {len(outputs)} clips")

            # ── ROUTE D: portrait + no template ──
            else:
                logger.info(f"[{job_id}] ROUTE D: portrait, no template")
                up("transcribing", 30, "Transcribing audio...")
                from backend.services.transcriber import transcribe_video
                transcript, segments = await asyncio.to_thread(transcribe_video, video_path)
                logger.info(f"[{job_id}] Transcript: {len(segments)} segments, {len(transcript)} chars")

                effective_mode = req.mode if req.mode == "voiceover" else "shorts"
                up("analyzing", 55, f"AI analyzing with {req.provider} (mode={effective_mode})...")
                from backend.services.analyzer import analyze_content
                analysis = await analyze_content(
                    transcript, segments, effective_mode, req.num_shorts,
                    api_key=req.api_key or "", provider=req.provider, model=req.model,
                )
                clips = analysis.get("clips", [])
                for c in clips:
                    dur = c["end_time"] - c["start_time"]
                    if dur > req.max_duration:
                        c["end_time"] = c["start_time"] + req.max_duration
                    if dur < req.min_duration:
                        c["end_time"] = c["start_time"] + req.min_duration
                clips = clips[:req.num_shorts]
                analysis["clips"] = clips
                logger.info(f"[{job_id}] After clamp: {len(clips)} clips")

                up("processing", 70, f"Cutting {len(clips)} clips...")
                from backend.services.processor import process_clips
                outputs = await asyncio.to_thread(
                    process_clips, video_path, analysis, effective_mode,
                    None, req.voice_style, req.elevenlabs_api_key, job_id,
                    bg_clip_path=None, split_ratio=float(req.split_ratio or 0.55),
                )

                kw = await gen_keywords(transcript)
                src_w, src_h = get_video_dimensions(video_path)
                for clip in outputs:
                    clip["output_mode"] = "shorts"
                    clip["output_format"] = output_format
                    clip.update(kw_fields(kw))
                    if not clip.get("caption"):
                        clip["caption"] = kw.get("tiktok_description", title)
                    apply_wm(clip["path"].lstrip("/"), src_w, src_h)
                logger.info(f"[{job_id}] ROUTE D complete: {len(outputs)} clips")

        logger.info(f"[{job_id}] Final outputs keywords check: "
                    f"{outputs[0].get('primary_keywords', 'MISSING') if outputs else 'NO OUTPUTS'}")
        jobs[job_id].update(status="done", progress=100, message=f"{len(outputs)} clips ready!", outputs=outputs)

    except Exception as e:
        logger.error(f"[{job_id}] FAILED: {e}", exc_info=True)
        jobs[job_id].update(status="error", progress=0, message="Failed", error=str(e))
