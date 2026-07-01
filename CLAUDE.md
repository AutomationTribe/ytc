# ClipForge 4.0 — CLAUDE.md

## Project Overview

ClipForge is a YouTube → Shorts automation pipeline. Paste a YouTube URL, and the app downloads the video, transcribes it with Whisper, uses an AI model to find the best moments, and cuts them into vertical Shorts using FFmpeg. Optional ElevenLabs integration adds AI voiceover.

## Architecture

**Two-process app** — run both simultaneously:

| Layer | Stack | Entry point |
|-------|-------|-------------|
| Backend | Python, FastAPI, Uvicorn | `backend/main.py` |
| Frontend | React (no JSX build step — raw `React.createElement`), Vite | `frontend/src/App.jsx` |

```
YouTube URL → yt-dlp (download) → Whisper (transcribe) → AI provider (analyze) → FFmpeg (cut) → ElevenLabs (voiceover, optional)
```

## Running the App

### Backend
```bash
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Must be run from the project root (not `backend/`), because services import as `backend.services.*`.

### Frontend
```bash
cd frontend
npm run dev   # http://localhost:3000
```

Backend serves output videos at `http://localhost:8000/outputs/` via FastAPI StaticFiles.

## Key Files

```
backend/
  main.py                  — FastAPI app, job queue (in-memory dict), pipeline orchestrator
  services/
    downloader.py          — yt-dlp wrapper
    transcriber.py         — OpenAI Whisper (local), returns transcript + timestamped segments
    analyzer.py            — Multi-provider AI router (Anthropic, OpenAI, Groq, Gemini, Ollama)
    processor.py           — FFmpeg clip cutting, landscape→portrait conversion, voiceover merge
    template_service.py    — Template layout definitions (vertical_split, horizontal_split)
frontend/
  src/App.jsx              — Entire UI in one file, React.createElement (no JSX transpilation)
downloads/                 — Temp downloaded videos (keyed by job_id)
outputs/                   — Final cut clips served to browser
```

## Supported AI Providers

| Provider | Free? | Key format | Default model |
|----------|-------|-----------|---------------|
| Groq | Free tier | `gsk_...` | `llama-3.3-70b-versatile` |
| Gemini | Free tier | `AIza...` | `gemini-1.5-flash` |
| Anthropic | Paid | `sk-ant-...` | `claude-sonnet-4-6` |
| OpenAI | Paid | `sk-...` | `gpt-4o-mini` |
| Ollama | Local/free | no key | `llama3.2` |

API keys are passed per-request (stored in `localStorage`, never sent to backend at rest).

## Pipeline Modes

- **shorts** — AI finds best standalone moments, cuts as vertical 9:16
- **template** — Split-screen/reaction layout with commentary script
- **voiceover** — Documentary-style narration via ElevenLabs TTS mixed over muted video

## Video Processing Notes

- Landscape (>1.15 aspect ratio): blurred zoomed background + foreground centered at 30% from top — keeps faces visible
- Portrait/square: simple scale + center crop
- Output: 1080×1920, libx264, yuv420p, crf 23, aac 128k
- `filter_complex` required for landscape (split/overlay pipeline); `-vf` for portrait
- Max 3 concurrent jobs via `asyncio.Semaphore`
- Clips are clamped (never dropped) to `[min_duration, max_duration]` before cutting

## Adding a New Template

1. Add entry to `TEMPLATES` dict in `backend/services/template_service.py`
2. Add layout branch in `create_template_clip()` in `backend/services/processor.py`

## Adding a New AI Provider

1. Add entry to `PROVIDERS` dict in `backend/services/analyzer.py`
2. Add `async def call_<provider>(...)` function returning parsed `dict`
3. Add routing branch in `analyze_content()`
4. Add provider entry to `PROVIDERS` array in `frontend/src/App.jsx`

## Dependencies

- **Python**: FastAPI, Uvicorn, yt-dlp, openai-whisper, anthropic, openai, requests, aiofiles
- **System**: FFmpeg + ffprobe must be in PATH
- **Node**: Vite (dev server only)
- **venv**: Located at `./venv/` — activate before running backend

## Job State Machine

Jobs stored in-memory `dict` keyed by 8-char UUID. States: `queued → downloading → transcribing → analyzing → processing → done | error`. Frontend polls `/api/job/{job_id}` every 2 seconds.

## Common Issues

- `"ffmpeg not found"` — FFmpeg not in PATH; install via `brew install ffmpeg` on Mac
- Backend must be started from project root, not `backend/` subdirectory
- Whisper downloads model on first run (~150MB for `base` model); use `tiny` for speed
- Age-restricted or region-blocked YouTube videos will fail at download step

# ClipForge — Trending template feature build spec

You are a senior full-stack engineer. Build the "Trending Templates" feature for ClipForge, a local YouTube-to-Shorts pipeline app built with FastAPI + React + FFmpeg.

## Current stack

- Backend: Python FastAPI at `backend/main.py`, services in `backend/services/`
- Frontend: React (pure `React.createElement`, no JSX) at `frontend/src/App.jsx`
- Video: FFmpeg for cutting/compositing, yt-dlp for download, Whisper for transcription
- AI: Multi-provider (Groq/OpenAI/Anthropic/Gemini/Ollama) via `backend/services/analyzer.py`
- Output: 1080x1920 (9:16) vertical video

## What to build

A template system that composites the user's YouTube clip with a background filler clip (gameplay, satisfying content, etc.) in a split-screen or PIP layout. This is the format behind every viral TikTok/Shorts commentary channel.

---

## BACKEND

### 1. New file: `backend/services/template_compositor.py`

This is the core FFmpeg compositor. It takes a user clip and a background clip and combines them.

**Function: `composite_template(user_clip_path, bg_clip_path, template_config, output_path)`**

Must handle these 5 layouts:

**Layout: `gameplay_split`** (user on top, background on bottom)
```
Output: 1080x1920
User video: scaled to 1080 wide, placed at top (height = 1920 * split_ratio)
Background: scaled to 1080 wide, placed at bottom (height = 1920 * (1-split_ratio)), LOOPED if shorter than user clip, MUTED
Audio: user clip audio only
```
FFmpeg approach:
```
ffmpeg -i user.mp4 -stream_loop -1 -i bg.mp4 \
  -filter_complex \
    "[0:v]scale=1080:{top_h}[top]; \
     [1:v]scale=1080:{bot_h},setpts=PTS-STARTPTS[bot]; \
     [top][bot]vstack=inputs=2[v]" \
  -map "[v]" -map 0:a \
  -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 \
  -c:a aac -b:a 128k -shortest output.mp4
```

**Layout: `satisfying_split`** — identical to gameplay_split, just a different default bg category.

**Layout: `side_by_side`** (user on left, background on right)
```
User: scaled to 540x1920 (left half)
Background: scaled to 540x1920 (right half), looped, muted
Stack horizontally with hstack
```

**Layout: `picture_in_picture`** (background fullscreen, user in corner)
```
Background: scaled to 1080x1920, looped, muted
User: scaled to small box (e.g. 324x576 = 30% of screen), overlayed at bottom-right with 20px padding
Audio: user clip only
```
FFmpeg: use `overlay=W-w-20:H-h-20` filter

**Layout: `caption_bar`** (user on top 70%, solid color bar on bottom 30%)
```
User: scaled to 1080x1344 (70% of 1920)
Bottom: solid black or dark gray bar at 1080x576
No background clip needed
```
FFmpeg: use `pad=1080:1920:0:0:black`

**Critical rules:**
- All crop/scale values must be pre-calculated as plain integers in Python. Never pass FFmpeg expressions like `(ih-1920)*0.3` — FFmpeg's crop filter doesn't evaluate them
- Always include `-pix_fmt yuv420p` for AV1/VP9 input compatibility
- Background clip uses `-stream_loop -1` to loop seamlessly
- Background audio is always muted (`-map 0:a` maps only user audio)
- Use `-shortest` to stop when user clip ends
- All outputs are 1080x1920 at 9:16

**Function: `get_available_backgrounds(category=None)`**
Scans `backgrounds/` directory, returns list of `{id, name, path, duration, category}`.

**Function: `get_template_configs()`**
Returns the 5 template definitions with their layout specs.

### 2. Update `backend/services/template_service.py`

Replace existing templates with these 5:

```python
TEMPLATES = {
    "gameplay_split": {
        "id": "gameplay_split",
        "name": "Gameplay split",
        "description": "Your video on top, gameplay on bottom. Most viral format.",
        "layout": "gameplay_split",
        "default_bg_category": "gameplay",
        "default_split_ratio": 0.55,
    },
    "satisfying_split": {
        "id": "satisfying_split",
        "name": "Satisfying split",
        "description": "Your video on top, satisfying ASMR clip on bottom.",
        "layout": "satisfying_split",
        "default_bg_category": "satisfying",
        "default_split_ratio": 0.55,
    },
    "side_by_side": {
        "id": "side_by_side",
        "name": "Side by side",
        "description": "Your video on the left, background clip on the right.",
        "layout": "side_by_side",
        "default_split_ratio": 0.5,
    },
    "picture_in_picture": {
        "id": "picture_in_picture",
        "name": "Picture in picture",
        "description": "Background fullscreen, your video as small corner overlay.",
        "layout": "picture_in_picture",
        "pip_scale": 0.30,
        "pip_position": "bottom_right",
    },
    "caption_bar": {
        "id": "caption_bar",
        "name": "Caption bar",
        "description": "Your video on top 70%, clean caption space on bottom.",
        "layout": "caption_bar",
        "bar_color": "black",
    },
}
```

### 3. Update `backend/main.py`

Add to `ProcessRequest`:
```python
bg_clip_id: Optional[str] = None      # specific background clip filename
bg_category: Optional[str] = "gameplay"  # gameplay | satisfying | nature | custom
split_ratio: Optional[float] = 0.55   # 0.4 to 0.75
```

Add new endpoints:
```python
@app.get("/api/backgrounds")
# Returns list of available background clips, grouped by category
# Scans backgrounds/{category}/ directories
# Returns: {category: [{id, name, path, duration_seconds}]}

@app.get("/api/backgrounds/{category}")
# Returns clips for a specific category

@app.post("/api/backgrounds/upload")
# Accepts file upload, saves to backgrounds/custom/
# Returns the new clip's metadata
```

Update the pipeline: when `mode == "template"`, after cutting the user clip, pass it through `composite_template()` with the selected background clip before saving to outputs.

### 4. Create `backgrounds/` directory structure

```
backgrounds/
├── gameplay/
│   └── .gitkeep
├── satisfying/
│   └── .gitkeep
├── nature/
│   └── .gitkeep
└── custom/
    └── .gitkeep
```

Include a helper script `scripts/download_starter_clips.py` that downloads 3-5 royalty-free clips from Pexels/Pixabay using their API:
- 2 nature clips (ocean waves, rain on window)
- 2 satisfying clips (abstract liquid, geometric patterns)
- 1 gameplay-style clip (abstract colorful motion)

Each clip should be 20-30 seconds, 1080p, mp4.

### 5. Update `backend/services/processor.py`

In `create_template_clip()`:
- Accept `bg_clip_path` and `split_ratio` parameters
- Call `composite_template()` from the new compositor module
- If no background clip is provided, fall back to the current behavior (black bar)

---

## FRONTEND

### 6. Update `frontend/src/App.jsx`

The frontend uses `React.createElement()` — NOT JSX. All UI must be written in `React.createElement` calls.

**Add these state variables:**
```javascript
var _bgCat = s("gameplay"), bgCat = _bgCat[0], setBgCat = _bgCat[1];
var _bgClip = s(""), bgClip = _bgClip[0], setBgClip = _bgClip[1];
var _bgClips = s([]), bgClips = _bgClips[0], setBgClips = _bgClips[1];
var _splitRatio = s(55), splitRatio = _splitRatio[0], setSplitRatio = _splitRatio[1];
```

**Fetch backgrounds on mount and when category changes:**
```javascript
useEffect(function() {
  fetch(API + "/api/backgrounds/" + bgCat)
    .then(function(r) { return r.json(); })
    .then(function(d) { setBgClips(d.clips || []); })
    .catch(function() {});
}, [bgCat]);
```

**Add to request body** (in submit function):
```javascript
bg_clip_id: bgClip || null,
bg_category: bgCat,
split_ratio: splitRatio / 100,
```

**When mode === "template", render 3 sections:**

**Section A: Template layout picker** (5 cards in a grid)
Each card shows:
- A mini phone-shaped preview div (aspect-ratio: 9/16, ~80px wide) with colored zones showing the layout
- Template name below
- Short description
- Selected state: accent border

The 5 layouts with their zone previews:
1. Gameplay split: top 55% = accent zone "Your video", bottom 45% = warning zone "Gameplay"
2. Satisfying split: top 55% = accent, bottom 45% = warning "Satisfying"
3. Side by side: left 50% = accent "Video", right 50% = warning "BG clip"
4. Picture in picture: full = warning "Background", small box bottom-right = accent "You"
5. Caption bar: top 70% = accent "Your video", bottom 30% = success "Captions"

**Section B: Background clip picker** (only for layouts that use a bg clip, not caption_bar)
- Category pills: Gameplay | Satisfying | Nature | Custom (clickable, one selected)
- Clip grid: 4 columns. Each clip card shows a placeholder thumbnail, clip name, duration. Plus an "Upload your own" card with dashed border and upload icon
- Upload card: triggers a file input that POSTs to /api/backgrounds/upload

**Section C: Settings** (3 controls in a grid)
- Split ratio slider: 40-75, default 55, shows "55 / 45" label
- Number of clips: 1-10, default 3
- Max clip length: 15-180s, default 60

**Live preview:** Small phone-shaped div (140px wide) next to a text summary. The phone preview dynamically adjusts zone heights based on the split ratio slider value.

**Results screen:** Same as current but each clip card shows the template layout zones inside the video preview area instead of a plain video player. The actual video player renders on top with controls.

---

## TESTS

### 7. Create `tests/test_compositor.py`

```python
def test_gameplay_split_dimensions():
    """Output must be exactly 1080x1920"""

def test_background_loops():
    """When bg clip is shorter than user clip, output duration matches user clip"""

def test_no_ffmpeg_expressions():
    """All filter strings contain only integers, no parentheses or math operators"""

def test_audio_from_user_only():
    """Output audio matches user clip audio, not background"""

def test_split_ratio_range():
    """Split ratios outside 0.4-0.75 are clamped"""

def test_missing_background_fallback():
    """When bg clip doesn't exist, falls back to black bar"""

def test_all_layouts():
    """Each of the 5 layouts produces a valid output file > 1KB"""
```

### 8. Create `tests/test_api.py`

```python
def test_backgrounds_endpoint():
    """GET /api/backgrounds returns categories with clips"""

def test_upload_background():
    """POST /api/backgrounds/upload saves file and returns metadata"""

def test_process_with_template():
    """POST /api/process with mode=template and template_id returns job"""

def test_invalid_template_id():
    """Unknown template_id returns 400"""
```

---

## IMPLEMENTATION ORDER

Build in this exact sequence, testing each step:

1. `template_service.py` — update template definitions
2. `template_compositor.py` — core FFmpeg compositor, test with synthetic videos
3. Create `backgrounds/` dirs + starter clip downloader script
4. Update `main.py` — new endpoints + pipeline integration
5. Update `processor.py` — wire compositor into existing pipeline
6. Update `App.jsx` — template picker UI
7. Update `App.jsx` — background clip picker + upload
8. Update `App.jsx` — settings controls + live preview
9. Run full integration test: paste YouTube URL → select gameplay split → select a bg clip → process → download

---

## CRITICAL CONSTRAINTS

1. **No FFmpeg expressions in filter strings.** Pre-calculate all pixel values in Python as integers. FFmpeg's crop/scale filters do NOT evaluate math expressions like `(ih-1920)*0.3`. This has caused bugs 4 times already.

2. **Always use `-pix_fmt yuv420p`** in encode flags. YouTube videos may be AV1 or VP9 with 10-bit color. Without this flag, libx264 fails silently.

3. **Frontend uses React.createElement, NOT JSX.** The entire App.jsx is written without JSX syntax. Continue this pattern. Example:
```javascript
React.createElement("button", { onClick: handler, style: btnStyle }, "Click me")
```

4. **Background clips must loop.** Use `-stream_loop -1` on the background input and `-shortest` to trim to user clip length.

5. **Background audio is always muted.** Only map user audio: `-map "[v]" -map 0:a`

6. **Landscape user videos (>1.15 aspect ratio) need smart scaling.** Scale to fit the zone width while preserving aspect ratio. Do NOT crop — show the full frame. If the video doesn't fill the zone height, pad with black or use blurred background fill.

7. **All clip values (start_time, end_time, split_ratio) are floats.** Always cast with `float()` before using in FFmpeg commands. Convert to string with `str()` for FFmpeg args.

8. **Test before shipping.** Create a 3-second synthetic test video with `ffmpeg -f lavfi -i testsrc2=duration=3:size=1920x1080:rate=30` and verify each layout produces a valid 1080x1920 output.# ClipForge — Trending template feature build spec

You are a senior full-stack engineer. Build the "Trending Templates" feature for ClipForge, a local YouTube-to-Shorts pipeline app built with FastAPI + React + FFmpeg.

## Current stack

- Backend: Python FastAPI at `backend/main.py`, services in `backend/services/`
- Frontend: React (pure `React.createElement`, no JSX) at `frontend/src/App.jsx`
- Video: FFmpeg for cutting/compositing, yt-dlp for download, Whisper for transcription
- AI: Multi-provider (Groq/OpenAI/Anthropic/Gemini/Ollama) via `backend/services/analyzer.py`
- Output: 1080x1920 (9:16) vertical video

## What to build

A template system that composites the user's YouTube clip with a background filler clip (gameplay, satisfying content, etc.) in a split-screen or PIP layout. This is the format behind every viral TikTok/Shorts commentary channel.

---

## BACKEND

### 1. New file: `backend/services/template_compositor.py`

This is the core FFmpeg compositor. It takes a user clip and a background clip and combines them.

**Function: `composite_template(user_clip_path, bg_clip_path, template_config, output_path)`**

Must handle these 5 layouts:

**Layout: `gameplay_split`** (user on top, background on bottom)
```
Output: 1080x1920
User video: scaled to 1080 wide, placed at top (height = 1920 * split_ratio)
Background: scaled to 1080 wide, placed at bottom (height = 1920 * (1-split_ratio)), LOOPED if shorter than user clip, MUTED
Audio: user clip audio only
```
FFmpeg approach:
```
ffmpeg -i user.mp4 -stream_loop -1 -i bg.mp4 \
  -filter_complex \
    "[0:v]scale=1080:{top_h}[top]; \
     [1:v]scale=1080:{bot_h},setpts=PTS-STARTPTS[bot]; \
     [top][bot]vstack=inputs=2[v]" \
  -map "[v]" -map 0:a \
  -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 \
  -c:a aac -b:a 128k -shortest output.mp4
```

**Layout: `satisfying_split`** — identical to gameplay_split, just a different default bg category.

**Layout: `side_by_side`** (user on left, background on right)
```
User: scaled to 540x1920 (left half)
Background: scaled to 540x1920 (right half), looped, muted
Stack horizontally with hstack
```

**Layout: `picture_in_picture`** (background fullscreen, user in corner)
```
Background: scaled to 1080x1920, looped, muted
User: scaled to small box (e.g. 324x576 = 30% of screen), overlayed at bottom-right with 20px padding
Audio: user clip only
```
FFmpeg: use `overlay=W-w-20:H-h-20` filter

**Layout: `caption_bar`** (user on top 70%, solid color bar on bottom 30%)
```
User: scaled to 1080x1344 (70% of 1920)
Bottom: solid black or dark gray bar at 1080x576
No background clip needed
```
FFmpeg: use `pad=1080:1920:0:0:black`

**Critical rules:**
- All crop/scale values must be pre-calculated as plain integers in Python. Never pass FFmpeg expressions like `(ih-1920)*0.3` — FFmpeg's crop filter doesn't evaluate them
- Always include `-pix_fmt yuv420p` for AV1/VP9 input compatibility
- Background clip uses `-stream_loop -1` to loop seamlessly
- Background audio is always muted (`-map 0:a` maps only user audio)
- Use `-shortest` to stop when user clip ends
- All outputs are 1080x1920 at 9:16

**Function: `get_available_backgrounds(category=None)`**
Scans `backgrounds/` directory, returns list of `{id, name, path, duration, category}`.

**Function: `get_template_configs()`**
Returns the 5 template definitions with their layout specs.

### 2. Update `backend/services/template_service.py`

Replace existing templates with these 5:

```python
TEMPLATES = {
    "gameplay_split": {
        "id": "gameplay_split",
        "name": "Gameplay split",
        "description": "Your video on top, gameplay on bottom. Most viral format.",
        "layout": "gameplay_split",
        "default_bg_category": "gameplay",
        "default_split_ratio": 0.55,
    },
    "satisfying_split": {
        "id": "satisfying_split",
        "name": "Satisfying split",
        "description": "Your video on top, satisfying ASMR clip on bottom.",
        "layout": "satisfying_split",
        "default_bg_category": "satisfying",
        "default_split_ratio": 0.55,
    },
    "side_by_side": {
        "id": "side_by_side",
        "name": "Side by side",
        "description": "Your video on the left, background clip on the right.",
        "layout": "side_by_side",
        "default_split_ratio": 0.5,
    },
    "picture_in_picture": {
        "id": "picture_in_picture",
        "name": "Picture in picture",
        "description": "Background fullscreen, your video as small corner overlay.",
        "layout": "picture_in_picture",
        "pip_scale": 0.30,
        "pip_position": "bottom_right",
    },
    "caption_bar": {
        "id": "caption_bar",
        "name": "Caption bar",
        "description": "Your video on top 70%, clean caption space on bottom.",
        "layout": "caption_bar",
        "bar_color": "black",
    },
}
```

### 3. Update `backend/main.py`

Add to `ProcessRequest`:
```python
bg_clip_id: Optional[str] = None      # specific background clip filename
bg_category: Optional[str] = "gameplay"  # gameplay | satisfying | nature | custom
split_ratio: Optional[float] = 0.55   # 0.4 to 0.75
```

Add new endpoints:
```python
@app.get("/api/backgrounds")
# Returns list of available background clips, grouped by category
# Scans backgrounds/{category}/ directories
# Returns: {category: [{id, name, path, duration_seconds}]}

@app.get("/api/backgrounds/{category}")
# Returns clips for a specific category

@app.post("/api/backgrounds/upload")
# Accepts file upload, saves to backgrounds/custom/
# Returns the new clip's metadata
```

Update the pipeline: when `mode == "template"`, after cutting the user clip, pass it through `composite_template()` with the selected background clip before saving to outputs.

### 4. Create `backgrounds/` directory structure

```
backgrounds/
├── gameplay/
│   └── .gitkeep
├── satisfying/
│   └── .gitkeep
├── nature/
│   └── .gitkeep
└── custom/
    └── .gitkeep
```

Include a helper script `scripts/download_starter_clips.py` that downloads 3-5 royalty-free clips from Pexels/Pixabay using their API:
- 2 nature clips (ocean waves, rain on window)
- 2 satisfying clips (abstract liquid, geometric patterns)
- 1 gameplay-style clip (abstract colorful motion)

Each clip should be 20-30 seconds, 1080p, mp4.

### 5. Update `backend/services/processor.py`

In `create_template_clip()`:
- Accept `bg_clip_path` and `split_ratio` parameters
- Call `composite_template()` from the new compositor module
- If no background clip is provided, fall back to the current behavior (black bar)

---

## FRONTEND

### 6. Update `frontend/src/App.jsx`

The frontend uses `React.createElement()` — NOT JSX. All UI must be written in `React.createElement` calls.

**Add these state variables:**
```javascript
var _bgCat = s("gameplay"), bgCat = _bgCat[0], setBgCat = _bgCat[1];
var _bgClip = s(""), bgClip = _bgClip[0], setBgClip = _bgClip[1];
var _bgClips = s([]), bgClips = _bgClips[0], setBgClips = _bgClips[1];
var _splitRatio = s(55), splitRatio = _splitRatio[0], setSplitRatio = _splitRatio[1];
```

**Fetch backgrounds on mount and when category changes:**
```javascript
useEffect(function() {
  fetch(API + "/api/backgrounds/" + bgCat)
    .then(function(r) { return r.json(); })
    .then(function(d) { setBgClips(d.clips || []); })
    .catch(function() {});
}, [bgCat]);
```

**Add to request body** (in submit function):
```javascript
bg_clip_id: bgClip || null,
bg_category: bgCat,
split_ratio: splitRatio / 100,
```

**When mode === "template", render 3 sections:**

**Section A: Template layout picker** (5 cards in a grid)
Each card shows:
- A mini phone-shaped preview div (aspect-ratio: 9/16, ~80px wide) with colored zones showing the layout
- Template name below
- Short description
- Selected state: accent border

The 5 layouts with their zone previews:
1. Gameplay split: top 55% = accent zone "Your video", bottom 45% = warning zone "Gameplay"
2. Satisfying split: top 55% = accent, bottom 45% = warning "Satisfying"
3. Side by side: left 50% = accent "Video", right 50% = warning "BG clip"
4. Picture in picture: full = warning "Background", small box bottom-right = accent "You"
5. Caption bar: top 70% = accent "Your video", bottom 30% = success "Captions"

**Section B: Background clip picker** (only for layouts that use a bg clip, not caption_bar)
- Category pills: Gameplay | Satisfying | Nature | Custom (clickable, one selected)
- Clip grid: 4 columns. Each clip card shows a placeholder thumbnail, clip name, duration. Plus an "Upload your own" card with dashed border and upload icon
- Upload card: triggers a file input that POSTs to /api/backgrounds/upload

**Section C: Settings** (3 controls in a grid)
- Split ratio slider: 40-75, default 55, shows "55 / 45" label
- Number of clips: 1-10, default 3
- Max clip length: 15-180s, default 60

**Live preview:** Small phone-shaped div (140px wide) next to a text summary. The phone preview dynamically adjusts zone heights based on the split ratio slider value.

**Results screen:** Same as current but each clip card shows the template layout zones inside the video preview area instead of a plain video player. The actual video player renders on top with controls.

---

## TESTS

### 7. Create `tests/test_compositor.py`

```python
def test_gameplay_split_dimensions():
    """Output must be exactly 1080x1920"""

def test_background_loops():
    """When bg clip is shorter than user clip, output duration matches user clip"""

def test_no_ffmpeg_expressions():
    """All filter strings contain only integers, no parentheses or math operators"""

def test_audio_from_user_only():
    """Output audio matches user clip audio, not background"""

def test_split_ratio_range():
    """Split ratios outside 0.4-0.75 are clamped"""

def test_missing_background_fallback():
    """When bg clip doesn't exist, falls back to black bar"""

def test_all_layouts():
    """Each of the 5 layouts produces a valid output file > 1KB"""
```

### 8. Create `tests/test_api.py`

```python
def test_backgrounds_endpoint():
    """GET /api/backgrounds returns categories with clips"""

def test_upload_background():
    """POST /api/backgrounds/upload saves file and returns metadata"""

def test_process_with_template():
    """POST /api/process with mode=template and template_id returns job"""

def test_invalid_template_id():
    """Unknown template_id returns 400"""
```

---

## IMPLEMENTATION ORDER

Build in this exact sequence, testing each step:

1. `template_service.py` — update template definitions
2. `template_compositor.py` — core FFmpeg compositor, test with synthetic videos
3. Create `backgrounds/` dirs + starter clip downloader script
4. Update `main.py` — new endpoints + pipeline integration
5. Update `processor.py` — wire compositor into existing pipeline
6. Update `App.jsx` — template picker UI
7. Update `App.jsx` — background clip picker + upload
8. Update `App.jsx` — settings controls + live preview
9. Run full integration test: paste YouTube URL → select gameplay split → select a bg clip → process → download

---

## CRITICAL CONSTRAINTS

1. **No FFmpeg expressions in filter strings.** Pre-calculate all pixel values in Python as integers. FFmpeg's crop/scale filters do NOT evaluate math expressions like `(ih-1920)*0.3`. This has caused bugs 4 times already.

2. **Always use `-pix_fmt yuv420p`** in encode flags. YouTube videos may be AV1 or VP9 with 10-bit color. Without this flag, libx264 fails silently.

3. **Frontend uses React.createElement, NOT JSX.** The entire App.jsx is written without JSX syntax. Continue this pattern. Example:
```javascript
React.createElement("button", { onClick: handler, style: btnStyle }, "Click me")
```

4. **Background clips must loop.** Use `-stream_loop -1` on the background input and `-shortest` to trim to user clip length.

5. **Background audio is always muted.** Only map user audio: `-map "[v]" -map 0:a`

6. **Landscape user videos (>1.15 aspect ratio) need smart scaling.** Scale to fit the zone width while preserving aspect ratio. Do NOT crop — show the full frame. If the video doesn't fill the zone height, pad with black or use blurred background fill.

7. **All clip values (start_time, end_time, split_ratio) are floats.** Always cast with `float()` before using in FFmpeg commands. Convert to string with `str()` for FFmpeg args.

8. **Test before shipping.** Create a 3-second synthetic test video with `ffmpeg -f lavfi -i testsrc2=duration=3:size=1920x1080:rate=30` and verify each layout produces a valid 1080x1920 output.

---

## ADDENDUM: Template output mode — Shorts vs Full Video

This was added after the original spec was approved. It changes how the template pipeline works.

### The core concept

The template compositor is the same regardless of output mode. What changes is whether the video is cut into clips first or passed through whole.

Add a new field to `ProcessRequest`:

```python
template_output_mode: Optional[str] = "shorts"  # "shorts" | "full_video"
```

### Mode: `shorts` (existing behaviour)

```
Download → Transcribe → AI finds best moments → Cut clips → Apply template to each clip
Output: 3-10 short files (30-180s each)
```

### Mode: `full_video` (new)

```
Download → Apply template to entire video → Output one file
Skip: Whisper transcription, AI analysis, clip cutting entirely
Output: 1 full-length templated video
```

This is significantly faster since we skip transcription and AI entirely.

### Backend changes

In `backend/main.py`, update `run_pipeline()`:

```python
async def pipeline(job_id, req):
    # Step 1: Always download
    video_path, title = await download_video(req.youtube_url, job_id)

    if req.mode == "template" and req.template_output_mode == "full_video":
        # FULL VIDEO MODE: skip transcription + AI, apply template directly
        update("processing", 40, "Applying template to full video...")
        bg_clip_path = resolve_bg_clip(req.bg_clip_id, req.bg_category)
        template_config = TEMPLATES[req.template_id]
        out_path = f"outputs/{job_id}/full_video.mp4"
        await asyncio.to_thread(
            composite_template,
            video_path, bg_clip_path, template_config,
            req.split_ratio or 0.55, out_path
        )
        outputs = [{
            "path": f"/outputs/{job_id}/full_video.mp4",
            "title": title,
            "caption": "",
            "duration": get_video_duration(video_path),
        }]

    else:
        # SHORTS MODE: existing pipeline (transcribe → analyze → cut → template)
        transcript, segments = await transcribe_video(video_path)
        analysis = await analyze_content(...)
        # ... rest of existing pipeline

    jobs[job_id].update(status="done", outputs=outputs)
```

Add a helper `get_video_duration(path)` using ffprobe:
```python
def get_video_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True
    )
    return round(float(result.stdout.strip()), 1)
```

### Frontend changes

In `App.jsx`, when mode is "template", show a toggle between the two output modes below the template layout picker and ABOVE the background clip picker:

```
┌──────────────────────────────────────────┐
│  Output type                             │
│  ○ Create Shorts    ● Full Video         │
│  AI cuts best       Apply template to    │
│  moments into       the entire video,    │
│  3-10 short clips   no cutting           │
└──────────────────────────────────────────┘
```

Implement as two clickable cards side by side (same style as mode cards):

```javascript
var _tmplMode = s("shorts"), tmplMode = _tmplMode[0], setTmplMode = _tmplMode[1];
```

Add to request body:
```javascript
template_output_mode: tmplMode,
```

When `tmplMode === "full_video"`:
- Hide the "Number of clips" and "Max clip length" sliders (not relevant)
- Show a note: "The full video will be templated without cutting. Processing time depends on video length."
- Still show split ratio slider and background clip picker — those still apply

When `tmplMode === "shorts"`:
- Show all existing controls as normal

### Results screen

For full_video mode, the results card shows a single video player (no grid) with:
- Video title from YouTube
- Duration of full video
- Download button
- A "Process another" button

For shorts mode, show the existing 3-column clip grid.

### Tests to add

```python
def test_full_video_mode_skips_transcription():
    """When template_output_mode=full_video, Whisper is never called"""

def test_full_video_output_is_single_file():
    """Full video mode produces exactly 1 output file"""

def test_full_video_duration_matches_source():
    """Output duration is within 2 seconds of source video duration"""

def test_shorts_mode_still_works():
    """Existing shorts pipeline unaffected by new mode field"""
```

### Implementation order for this addendum

Add this after step 5 (processor.py) and before step 6 (frontend):

5a. Add `template_output_mode` to `ProcessRequest` in `main.py`
5b. Add full video branch to `pipeline()` in `main.py`
5c. Add `get_video_duration()` helper
5d. Update frontend toggle UI
5e. Test both modes with a short YouTube video (under 5 mins for speed)
