import os, uuid, asyncio, time, logging
from fastapi import FastAPI, HTTPException, BackgroundTasks
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

for d in ["downloads", "outputs"]:
    os.makedirs(d, exist_ok=True)
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")


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


@app.get("/")
def root():
    return {"status": "ok", "version": "4.0"}


@app.post("/api/process")
async def process_video(req: ProcessRequest, bg: BackgroundTasks):
    if not req.api_key and req.provider != "ollama":
        raise HTTPException(400, "API key required")
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

            # 5. Process
            up("processing", 70, f"Cutting {len(clips)} clips...")
            from backend.services.processor import process_clips
            outputs = await asyncio.to_thread(
                process_clips, video_path, analysis, req.mode,
                req.template_id, req.voice_style, req.elevenlabs_api_key, job_id
            )
            logger.info(f"[{job_id}] Output: {len(outputs)} clips")

        jobs[job_id].update(status="done", progress=100, message=f"{len(outputs)} clips ready!", outputs=outputs)

    except Exception as e:
        logger.error(f"[{job_id}] FAILED: {e}", exc_info=True)
        jobs[job_id].update(status="error", progress=0, message="Failed", error=str(e))
