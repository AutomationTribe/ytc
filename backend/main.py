import os, uuid, asyncio, time, logging, shutil
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

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
    youtube_url: str
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
    bg_clip_id: Optional[str] = None
    bg_category: Optional[str] = "gameplay"
    split_ratio: Optional[float] = 0.55


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
    data = get_available_backgrounds(category=category)
    clips = data.get(category, [])
    # Strip absolute path — return a URL-friendly relative path
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
# Templates endpoint
# ──────────────────────────────────────────────────────────────

@app.get("/api/templates")
def list_templates():
    from backend.services.template_service import TEMPLATES
    return {"templates": list(TEMPLATES.values())}


# ──────────────────────────────────────────────────────────────
# Job processing
# ──────────────────────────────────────────────────────────────

@app.post("/api/process")
async def process_video(req: ProcessRequest, bg: BackgroundTasks):
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


async def pipeline(job_id, req):
    def up(status, pct, msg):
        jobs[job_id].update(status=status, progress=pct, message=msg)
        logger.info(f"[{job_id}] {pct}% {msg}")

    try:
        async with _sem:
            # 1. Download
            up("downloading", 10, "Downloading video...")
            from backend.services.downloader import download_video
            video_path, title = await asyncio.to_thread(download_video, req.youtube_url, job_id)
            logger.info(f"[{job_id}] Downloaded: {video_path}")

            # 2. Transcribe
            up("transcribing", 30, "Transcribing audio...")
            from backend.services.transcriber import transcribe_video
            transcript, segments = await asyncio.to_thread(transcribe_video, video_path)
            logger.info(f"[{job_id}] Transcript: {len(segments)} segments, {len(transcript)} chars")

            # 3. Analyze
            up("analyzing", 55, f"AI analyzing with {req.provider}...")
            from backend.services.analyzer import analyze_content
            analysis = await analyze_content(
                transcript, segments, req.mode, req.num_shorts,
                api_key=req.api_key or "", provider=req.provider, model=req.model,
            )
            raw_count = len(analysis.get("clips", []))
            logger.info(f"[{job_id}] AI returned {raw_count} clips")

            # 4. Clamp clips (NEVER drop — only shorten)
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

            # 5. Resolve background clip path (for template mode)
            bg_clip_path = None
            if req.mode == "template" and req.bg_clip_id:
                cat = req.bg_category or "gameplay"
                candidate = os.path.join("backgrounds", cat, req.bg_clip_id)
                if os.path.exists(candidate):
                    bg_clip_path = candidate
                    logger.info(f"[{job_id}] Background clip: {bg_clip_path}")
                else:
                    logger.warning(f"[{job_id}] Background clip not found: {candidate}")

            # 6. Process
            up("processing", 70, f"Cutting {len(clips)} clips...")
            from backend.services.processor import process_clips
            outputs = await asyncio.to_thread(
                process_clips, video_path, analysis, req.mode,
                req.template_id, req.voice_style, req.elevenlabs_api_key, job_id,
                bg_clip_path=bg_clip_path, split_ratio=float(req.split_ratio or 0.55),
            )
            logger.info(f"[{job_id}] Output: {len(outputs)} clips")

        jobs[job_id].update(status="done", progress=100, message=f"{len(outputs)} clips ready!", outputs=outputs)

    except Exception as e:
        logger.error(f"[{job_id}] FAILED: {e}", exc_info=True)
        jobs[job_id].update(status="error", progress=0, message="Failed", error=str(e))
