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

---

## ADDENDUM 2: Watermark / Logo Removal (Blur + Cover approach)

### How it works

User selects a region on a preview frame → FFmpeg applies a blur or solid color block over that region on every output clip. Coordinates are pre-calculated as integers — never passed as FFmpeg expressions.

### User flow

```
User enables "Remove watermark" toggle
        ↓
App shows first frame of the downloaded video (extracted with ffmpeg -vframes 1)
        ↓
User draws a rectangle over the logo on the preview image
        ↓
User picks method: Blur | Black box | Custom color
        ↓
Same region applied to all output clips automatically
```

---

### BACKEND

#### New endpoint: `GET /api/preview-frame/{job_id}`

After download completes, extract the first frame and serve it:

```python
@app.get("/api/preview-frame/{job_id}")
def get_preview_frame(job_id: str):
    # Find the downloaded video for this job
    dl_dir = f"downloads/{job_id}"
    for f in os.listdir(dl_dir):
        if f.endswith((".mp4", ".mkv", ".webm")):
            video_path = os.path.join(dl_dir, f)
            break
    frame_path = f"outputs/{job_id}/preview_frame.jpg"
    os.makedirs(f"outputs/{job_id}", exist_ok=True)
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vframes", "1", "-q:v", "2",
        "-vf", "scale=640:-1",   # scale down for fast loading
        frame_path
    ], capture_output=True)
    return FileResponse(frame_path)
```

Mount outputs as static so frontend can load the frame as an image URL.

#### New file: `backend/services/watermark_remover.py`

```python
def apply_watermark_removal(
    input_path: str,
    output_path: str,
    region: dict,        # {x, y, w, h} as integers, relative to source video dimensions
    method: str,         # "blur" | "black" | "color"
    color: str = "black" # hex color for "color" method
) -> bool:
    """
    Apply watermark removal to a video.
    All coordinates are pre-calculated integers — NO FFmpeg expressions.
    region coords are in SOURCE video pixel space (e.g. 1920x1080).
    """
    x = int(region["x"])
    y = int(region["y"])
    w = int(region["w"])
    h = int(region["h"])

    # Ensure w and h are even (required by libx264)
    if w % 2 != 0: w += 1
    if h % 2 != 0: h += 1

    if method == "blur":
        # Crop the logo region, apply gblur, overlay back
        vf = (
            f"[0:v]split=2[bg][fg];"
            f"[fg]crop={w}:{h}:{x}:{y},gblur=sigma=20[blurred];"
            f"[bg][blurred]overlay={x}:{y}"
        )
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-filter_complex", vf,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "23",
            "-c:a", "copy",
            output_path
        ]

    elif method in ("black", "color"):
        fill = "black" if method == "black" else color
        vf = f"drawbox={x}:{y}:{w}:{h}:{fill}:fill"
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-vf", vf,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "23",
            "-c:a", "copy",
            output_path
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        print(f"[watermark] FFmpeg error: {result.stderr[-400:]}")
        return False
    return True
```

#### Update `ProcessRequest` in `main.py`

```python
# Watermark removal
watermark_enabled: Optional[bool] = False
watermark_region: Optional[dict] = None   # {x, y, w, h} integers
watermark_method: Optional[str] = "blur"  # blur | black | color
watermark_color: Optional[str] = "black"
```

#### Update pipeline in `main.py`

After each clip is processed, if watermark_enabled:

```python
if req.watermark_enabled and req.watermark_region:
    wm_input = out_path
    wm_output = out_path.replace(".mp4", "_clean.mp4")
    from backend.services.watermark_remover import apply_watermark_removal

    # Scale region from preview (640px wide) to actual video dimensions
    scale_x = src_w / 640
    scale_y = src_h / (640 * src_h / src_w)
    scaled_region = {
        "x": int(req.watermark_region["x"] * scale_x),
        "y": int(req.watermark_region["y"] * scale_y),
        "w": int(req.watermark_region["w"] * scale_x),
        "h": int(req.watermark_region["h"] * scale_y),
    }
    success = apply_watermark_removal(
        wm_input, wm_output,
        scaled_region, req.watermark_method, req.watermark_color
    )
    if success and os.path.exists(wm_output):
        os.replace(wm_output, wm_input)  # replace original with clean version
```

---

### FRONTEND

#### New state variables

```javascript
var _wmEnabled = s(false), wmEnabled = _wmEnabled[0], setWmEnabled = _wmEnabled[1];
var _wmRegion = s(null), wmRegion = _wmRegion[0], setWmRegion = _wmRegion[1];
var _wmMethod = s("blur"), wmMethod = _wmMethod[0], setWmMethod = _wmMethod[1];
var _wmColor = s("#000000"), wmColor = _wmColor[0], setWmColor = _wmColor[1];
var _previewFrame = s(null), previewFrame = _previewFrame[0], setPreviewFrame = _previewFrame[1];
var _showWmPicker = s(false), showWmPicker = _showWmPicker[0], setShowWmPicker = _showWmPicker[1];
```

#### Region selector component

When the user enables watermark removal, show a panel with:

1. The preview frame image (fetched from `/api/preview-frame/{job_id}` after download)
2. A transparent canvas overlaid on the image that captures mouse drag to draw a rectangle
3. The drawn rectangle shown in red dashed border
4. Method selector: Blur | Black box | Custom color (color input if custom)

```javascript
// Canvas drag logic (pure JS, no JSX)
// onmousedown: record start coords
// onmousemove: draw rectangle preview
// onmouseup: save region {x, y, w, h} relative to canvas display size
```

Since the preview frame is scaled to 640px wide, pass region coords as-is to the backend — the backend scales them to actual video dimensions.

#### Timing: when to show the watermark picker

The watermark picker needs a preview frame, which requires the video to already be downloaded. Two approaches:

**Option A (simpler):** Show a "Remove watermark" toggle in the settings before processing. User enters approximate logo position manually (x%, y%, width%, height% as sliders).

**Option B (better UX):** Two-step process:
- Step 1: User pastes URL, clicks "Analyze video"
- App downloads video, extracts frame, shows preview
- Step 2: User draws region, picks method, clicks "Process"

**Implement Option A first** (simpler, can upgrade to B later). Use percentage-based sliders:

```
Logo position:
  From left:   [====|----] 5%
  From top:    [|--------] 2%
  Width:       [===|-----] 15%
  Height:      [=|-------] 8%
```

These percentages are converted to pixel coordinates in the backend using actual video dimensions.

Update `ProcessRequest` to accept percentages:
```python
watermark_region_pct: Optional[dict] = None  # {x_pct, y_pct, w_pct, h_pct} 0-100
```

Backend converts:
```python
if req.watermark_region_pct:
    region = {
        "x": int(src_w * req.watermark_region_pct["x_pct"] / 100),
        "y": int(src_h * req.watermark_region_pct["y_pct"] / 100),
        "w": int(src_w * req.watermark_region_pct["w_pct"] / 100),
        "h": int(src_h * req.watermark_region_pct["h_pct"] / 100),
    }
```

---

### TESTS

```python
def test_blur_method_produces_output():
    """Blur method produces valid mp4 with same duration as input"""

def test_black_box_method():
    """Black box method produces output with no FFmpeg expressions in filter"""

def test_region_scaling():
    """Region percentages correctly convert to pixel coords for 1920x1080"""

def test_even_dimensions():
    """Region w and h are always even numbers (libx264 requirement)"""

def test_watermark_applied_to_all_clips():
    """All output clips have watermark removed, not just the first"""

def test_watermark_disabled_skips_processing():
    """When watermark_enabled=False, apply_watermark_removal is never called"""
```

---

### Implementation order for Addendum 2

After the trending template feature is complete:

WM1. Create `backend/services/watermark_remover.py`
WM2. Update `ProcessRequest` with watermark fields
WM3. Add watermark step to pipeline (after each clip is processed)
WM4. Add watermark UI section to App.jsx (toggle + 4 percentage sliders + method picker)
WM5. Test with a real video that has a visible watermark

---

## ADDENDUM 3: Enhanced Watermark Removal — Frame capture + multi-region

This replaces the percentage-slider approach from Addendum 2 with a proper frame-capture + draw-on-image workflow. Supports multiple logo regions per video.

---

### USER FLOW (3 steps)

```
Step 1: CAPTURE FRAME
  User enters timestamp (e.g. "00:00:05" or just "5")
  Clicks "Capture frame"
  Backend extracts that exact frame → serves as JPEG
  User sees actual video frame with logos visible
  Quick presets: 2s / 10s / 1min / 5min / 10min
  User can recapture at different timestamps if logo not visible

Step 2: MARK REGIONS
  Captured frame shown full-width
  Transparent canvas overlaid — user click+drags to draw rectangles
  Each rectangle = one region to blur/remove
  Multiple regions supported (no limit)
  Each region shows:
    - Number badge (1, 2, 3...)
    - Method picker: Blur | Black box | Color
    - Delete button (×)
  Region list panel shows all regions with coords
  User can draw as many as needed, delete any

Step 3: CONFIRM + PROCESS
  Summary card: "3 regions marked for removal"
  Same frame shown with all regions highlighted
  User clicks "Process video" → normal pipeline runs with regions applied
```

---

### BACKEND

#### Update endpoint: `POST /api/preview-frame`

Accept timestamp as input, extract that exact frame:

```python
class FrameRequest(BaseModel):
    job_id: str
    timestamp: str  # "00:00:05" or "5" or "3:45"

@app.post("/api/preview-frame")
def capture_frame(req: FrameRequest):
    """Extract a frame at the given timestamp from the downloaded video."""

    # Find downloaded video
    dl_dir = f"downloads/{req.job_id}"
    video_path = None
    for f in os.listdir(dl_dir):
        if f.endswith((".mp4", ".mkv", ".webm")):
            video_path = os.path.join(dl_dir, f)
            break
    if not video_path:
        raise HTTPException(404, "Video not downloaded yet")

    # Parse timestamp — accept "5", "3:45", "00:01:23"
    ts = parse_timestamp(req.timestamp)

    frame_path = f"outputs/{req.job_id}/preview_{int(ts)}s.jpg"
    os.makedirs(f"outputs/{req.job_id}", exist_ok=True)

    result = subprocess.run([
        "ffmpeg", "-y",
        "-ss", str(ts),
        "-i", video_path,
        "-vframes", "1",
        "-q:v", "2",
        "-vf", "scale=960:-1",   # 960px wide for display, retains aspect ratio
        frame_path
    ], capture_output=True, text=True, timeout=30)

    if result.returncode != 0 or not os.path.exists(frame_path):
        raise HTTPException(500, f"Frame extraction failed: {result.stderr[-200:]}")

    # Return frame URL + video dimensions
    dims = get_video_dimensions(video_path)
    return {
        "frame_url": f"/outputs/{req.job_id}/preview_{int(ts)}s.jpg",
        "video_width": dims[0],
        "video_height": dims[1],
        "timestamp": ts,
        "frame_width": 960,
        "frame_height": int(960 * dims[1] / dims[0])
    }

def parse_timestamp(ts: str) -> float:
    """Parse timestamp string to seconds float."""
    ts = ts.strip()
    if ':' in ts:
        parts = ts.split(':')
        if len(parts) == 3:
            return int(parts[0])*3600 + int(parts[1])*60 + float(parts[2])
        elif len(parts) == 2:
            return int(parts[0])*60 + float(parts[1])
    return float(ts)
```

#### Update `watermark_remover.py` — accept list of regions

```python
def apply_watermark_regions(
    input_path: str,
    output_path: str,
    regions: list,           # list of {x, y, w, h, method, color}
    video_width: int,        # actual source video dimensions
    video_height: int,
    frame_width: int,        # preview frame dimensions (for scaling)
    frame_height: int,
) -> bool:
    """
    Apply multiple watermark regions to a video.
    Regions are defined in preview frame pixel space → scaled to actual video dimensions.
    All values are pre-calculated integers — NO FFmpeg expressions.
    """

    if not regions:
        return True

    # Scale all regions from preview space to video space
    scale_x = video_width / frame_width
    scale_y = video_height / frame_height

    filters = []
    current = "[0:v]"

    for i, region in enumerate(regions):
        # Scale to actual video pixel coords
        x = int(region["x"] * scale_x)
        y = int(region["y"] * scale_y)
        w = int(region["w"] * scale_x)
        h = int(region["h"] * scale_y)

        # Ensure even dimensions for libx264
        if w % 2 != 0: w += 1
        if h % 2 != 0: h += 1

        # Clamp to video bounds
        x = max(0, min(x, video_width - w))
        y = max(0, min(y, video_height - h))

        method = region.get("method", "blur")
        out_label = f"[v{i}]"

        if method == "blur":
            filters.append(
                f"{current}split=2[bg{i}][fg{i}];"
                f"[fg{i}]crop={w}:{h}:{x}:{y},gblur=sigma=25[blurred{i}];"
                f"[bg{i}][blurred{i}]overlay={x}:{y}{out_label}"
            )
        else:
            color = region.get("color", "black")
            filters.append(
                f"{current}drawbox={x}:{y}:{w}:{h}:{color}:fill{out_label}"
            )

        current = out_label

    # Final output label
    filter_str = ";".join(filters)
    # Rename last label to [vout]
    filter_str = filter_str[:filter_str.rfind("[")] + "[vout]"

    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-filter_complex", filter_str,
        "-map", "[vout]", "-map", "0:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        print(f"[watermark] FFmpeg error: {result.stderr[-500:]}")
        return False
    return True
```

#### Update `ProcessRequest`

```python
# Watermark removal — replaces old watermark_region_pct approach
watermark_enabled: Optional[bool] = False
watermark_regions: Optional[list] = None   # list of {x, y, w, h, method, color}
watermark_frame_width: Optional[int] = 960   # preview frame width used when drawing
watermark_frame_height: Optional[int] = 540  # preview frame height used when drawing
```

#### Update pipeline

```python
# After EACH clip is processed, apply watermark removal if enabled
if req.watermark_enabled and req.watermark_regions:
    wm_output = out_path.replace(".mp4", "_wm.mp4")
    success = apply_watermark_regions(
        input_path=out_path,
        output_path=wm_output,
        regions=req.watermark_regions,
        video_width=src_w,
        video_height=src_h,
        frame_width=req.watermark_frame_width,
        frame_height=req.watermark_frame_height,
    )
    if success and os.path.exists(wm_output):
        os.replace(wm_output, out_path)
```

---

### FRONTEND

#### State variables

```javascript
var _wmEnabled = s(false), wmEnabled = _wmEnabled[0], setWmEnabled = _wmEnabled[1];
var _wmStep = s(1), wmStep = _wmStep[0], setWmStep = _wmStep[1];       // 1=capture, 2=mark, 3=confirm
var _wmTimestamp = s("00:00:05"), wmTs = _wmTimestamp[0], setWmTs = _wmTimestamp[1];
var _wmFrame = s(null), wmFrame = _wmFrame[0], setWmFrame = _wmFrame[1]; // {url, width, height}
var _wmRegions = s([]), wmRegions = _wmRegions[0], setWmRegions = _wmRegions[1];
var _wmDrawing = s(false), wmDrawing = _wmDrawing[0], setWmDrawing = _wmDrawing[1];
var _wmDraft = s(null), wmDraft = _wmDraft[0], setWmDraft = _wmDraft[1]; // region being drawn
```

#### Step 1 — Capture frame UI

Show this section when `wmEnabled === true`:

```
┌─────────────────────────────────────────────────┐
│ 🎯 Remove watermarks / logos           Step 1/3 │
├─────────────────────────────────────────────────┤
│                                                  │
│  Timestamp  [00:00:05_____________] [📸 Capture] │
│                                                  │
│  Quick: [2s] [10s] [1min] [5min] [10min]        │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │                                          │   │
│  │   🎬  Enter timestamp and capture frame  │   │
│  │       Logos usually appear at 2-5s       │   │
│  │                                          │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  [Next →] (disabled until frame captured)        │
└─────────────────────────────────────────────────┘
```

On "Capture" click:
```javascript
fetch(API + "/api/preview-frame", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({job_id: jobId, timestamp: wmTs})
})
.then(r => r.json())
.then(data => {
  setWmFrame(data);
  setWmStep(2);
})
```

**Important:** The video must be downloaded before frame capture works. Show the watermark section only after the download step completes (when job status moves past "downloading"). If user enables watermark before submitting, start the download first, then show the frame capture UI.

#### Step 2 — Mark regions UI

Show the captured frame in a `<div>` with a `<canvas>` overlaid at 100% size. Use `position:relative` on the container and `position:absolute;inset:0` on the canvas.

Canvas mouse events for drawing:

```javascript
// All coords relative to canvas display size (not actual video size)
// Backend handles scaling

function onMouseDown(e) {
  var rect = canvas.getBoundingClientRect();
  setWmDraft({x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0});
  setWmDrawing(true);
}

function onMouseMove(e) {
  if (!wmDrawing || !wmDraft) return;
  var rect = canvas.getBoundingClientRect();
  setWmDraft(prev => ({
    ...prev,
    w: (e.clientX - rect.left) - prev.x,
    h: (e.clientY - rect.top) - prev.y
  }));
  // Redraw canvas: existing regions in solid color + draft in dashed
  redrawCanvas();
}

function onMouseUp() {
  if (!wmDraft || Math.abs(wmDraft.w) < 10 || Math.abs(wmDraft.h) < 10) {
    setWmDraft(null); setWmDrawing(false); return;
  }
  // Normalize negative w/h (user dragged left/up)
  var norm = {
    x: wmDraft.w < 0 ? wmDraft.x + wmDraft.w : wmDraft.x,
    y: wmDraft.h < 0 ? wmDraft.y + wmDraft.h : wmDraft.y,
    w: Math.abs(wmDraft.w),
    h: Math.abs(wmDraft.h),
    method: "blur",
    color: "black",
    id: Date.now()
  };
  setWmRegions(prev => [...prev, norm]);
  setWmDraft(null);
  setWmDrawing(false);
}
```

Canvas redraw — draw all saved regions + current draft:

```javascript
function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  wmRegions.forEach((r, i) => {
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(239,68,68,0.15)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Number badge
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(r.x, r.y - 18, 20, 18);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui";
    ctx.fillText(i+1, r.x + 6, r.y - 4);
  });
  if (wmDraft) {
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(wmDraft.x, wmDraft.y, wmDraft.w, wmDraft.h);
  }
}
```

Below the canvas, show a region list:

```
Marked regions:
  [1] 📍 x:45 y:12 · 120×32px   Method: [Blur ▾]  [× Remove]
  [2] 📍 x:820 y:560 · 98×28px  Method: [Blur ▾]  [× Remove]

  + Draw another region on the frame above
```

#### Step 3 — Confirm UI

Simple summary before processing:

```
┌─────────────────────────────────────────────────┐
│  ✓ 2 watermark regions marked                   │
│                                                  │
│  [frame image with regions highlighted]          │
│                                                  │
│  Region 1 — Blur — top-left corner              │
│  Region 2 — Black box — bottom-right corner     │
│                                                  │
│  These will be applied to all output clips.     │
│                                                  │
│  [← Edit regions]    [▶ Process video]          │
└─────────────────────────────────────────────────┘
```

#### Add to request body

```javascript
watermark_enabled: wmEnabled && wmRegions.length > 0,
watermark_regions: wmRegions.map(function(r) {
  return {x: r.x, y: r.y, w: r.w, h: r.h, method: r.method, color: r.color};
}),
watermark_frame_width: wmFrame ? wmFrame.frame_width : 960,
watermark_frame_height: wmFrame ? wmFrame.frame_height : 540,
```

---

### TESTS

```python
def test_timestamp_parser():
    """Parse '5', '3:45', '00:01:23' all return correct seconds"""
    assert parse_timestamp("5") == 5.0
    assert parse_timestamp("3:45") == 225.0
    assert parse_timestamp("00:01:23") == 83.0

def test_multi_region_blur():
    """Apply 3 blur regions to synthetic video, output is valid 1080x1920"""

def test_region_scaling():
    """Regions defined at 960px preview scale correctly to 1920x1080 source"""

def test_negative_region_normalized():
    """Negative w/h (drag left/up) are normalized before sending to backend"""

def test_even_dimensions_enforced():
    """All region w/h values are even after scaling"""

def test_region_clamped_to_bounds():
    """Region that extends beyond video edge is clamped, not errored"""

def test_mixed_methods():
    """One region blur + one region black box both applied correctly"""

def test_frame_capture_bad_timestamp():
    """Timestamp beyond video duration returns 400, not crash"""
```

---

### IMPLEMENTATION ORDER for Addendum 3

WM1. Add `parse_timestamp()` and update `POST /api/preview-frame` endpoint
WM2. Rewrite `watermark_remover.py` with multi-region `apply_watermark_regions()`
WM3. Update `ProcessRequest` with new watermark fields
WM4. Update pipeline to call `apply_watermark_regions()` after each clip
WM5. Frontend Step 1 — timestamp input + frame capture UI
WM6. Frontend Step 2 — canvas draw tool with multi-region support
WM7. Frontend Step 3 — confirmation summary
WM8. Run all watermark tests with a synthetic test video

---

## ADDENDUM 4: Output Format Selector — Shorts vs Full Video (approved design)

Applies to both Template and Voiceover modes.
User selects either portrait 1080×1920 (Shorts/Reels) or landscape 1920×1080 (Full Video).

---

### BACKEND

#### Update `ProcessRequest` in `main.py`

```python
output_format: Optional[str] = "portrait"  # "portrait" | "landscape"
# portrait  = 1080x1920, AI cuts clips, multiple outputs
# landscape = 1920x1080, no cutting, single output file
```

#### Update `composite_template()` in `template_compositor.py`

Add `output_format` parameter to every compositor function:

```python
def composite_gameplay_split(user_clip, bg_clip, split_ratio, output_path, output_format="portrait"):
    if output_format == "landscape":
        OUT_W, OUT_H = 1920, 1080
    else:
        OUT_W, OUT_H = 1080, 1920

    top_h = int(OUT_H * split_ratio)
    if top_h % 2 != 0: top_h += 1
    bot_h = OUT_H - top_h
    if bot_h % 2 != 0: bot_h -= 1; top_h += 1

    filter_complex = (
        f"[0:v]scale={OUT_W}:{top_h}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{top_h}:(iw-{OUT_W})/2:(ih-{top_h})/2[top];"
        f"[1:v]scale={OUT_W}:{bot_h}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{bot_h}:(iw-{OUT_W})/2:(ih-{bot_h})/2[bot];"
        f"[top][bot]vstack=inputs=2[out]"
    )
    # rest of function unchanged
```

Apply the same `output_format` parameter to:
- `composite_side_by_side()` — swap OUT_W/OUT_H, use hstack
- `composite_pip()` — scale background to OUT_W x OUT_H
- `composite_caption_bar()` — pad to OUT_W x OUT_H
- `composite_template()` — pass through to all above

#### Update pipeline in `main.py`

```python
output_format = req.output_format or "portrait"

if req.mode in ("template", "voiceover") and output_format == "landscape":
    # FULL VIDEO MODE — no transcription, no AI, no cutting
    update("processing", 40, "Applying template to full video — this takes 5–15 mins...")
    bg_clip = resolve_bg_clip(req.bg_clip_id, req.bg_category)
    out_path = f"outputs/{job_id}/full_video.mp4"
    
    success = await asyncio.to_thread(
        tc.composite_template,
        video_path, bg_clip, req.template_id, req.split_ratio or 0.55,
        out_path, output_format="landscape"
    )
    
    if success:
        dur = get_video_duration(out_path)
        outputs = [{
            "path": f"/outputs/{job_id}/full_video.mp4",
            "title": title,
            "caption": "",
            "duration": dur,
        }]
    
else:
    # SHORTS MODE — transcribe → AI → cut → template at portrait
    # existing pipeline, pass output_format="portrait" to compositor
```

#### Update voiceover pipeline for landscape mode

When `mode == "voiceover"` and `output_format == "landscape"`:
- Skip transcription and AI
- Apply voiceover narration to the full video (generate one long narration from the title/description)
- Merge AI voice over the full video audio
- Output as 1920×1080

---

### FRONTEND

The frontend uses `React.createElement` — NO JSX. Follow existing App.jsx patterns exactly.

#### New state variables

```javascript
var _outFmt = s("portrait"), outFmt = _outFmt[0], setOutFmt = _outFmt[1];
```

#### Add to request body in submit()

```javascript
output_format: outFmt,
```

#### Render the format selector

Show this section when `mode === "template" || mode === "voiceover"`.
Place it BETWEEN the mode selector and the template/background picker sections.

Two cards side by side. Each card contains:
- Icon + name + dimensions
- Short description
- Platform pills
- Mini preview (phone shape for portrait, screen shape for landscape)

**Portrait card (Shorts/Reels):**
```javascript
React.createElement("div", {
  style: {...cardStyle, border: outFmt === "portrait" ? "2px solid #6366f1" : "1px solid #1e293b",
           background: outFmt === "portrait" ? "#6366f115" : "#0f172a"},
  onClick: function() { setOutFmt("portrait"); }
},
  // 📱 icon
  // "Shorts / Reels" title
  // "1080 × 1920 · 9:16" subtitle in monospace
  // Description: "AI finds best moments and cuts them into portrait clips"
  // Platform pills: YouTube Shorts, TikTok, Instagram Reels
  // Mini phone preview: top zone (user video) + bottom zone (bg clip)
)
```

**Landscape card (Full Video):**
```javascript
React.createElement("div", {
  style: {...cardStyle, border: outFmt === "landscape" ? "2px solid #10b981" : "1px solid #1e293b",
           background: outFmt === "landscape" ? "#10b98112" : "#0f172a"},
  onClick: function() { setOutFmt("landscape"); }
},
  // 🖥️ icon
  // "Full Video" title
  // "1920 × 1080 · 16:9" subtitle
  // Description: "Entire video templated as one landscape output — no cutting"
  // Platform pills: YouTube, Facebook, Twitter/X
  // Mini screen preview (wider than tall): top zone + bottom zone
)
```

#### Info banner below format cards

Show a colored banner that updates based on selection:

Portrait selected:
```javascript
// background: "#6366f115", border: "1px solid #6366f133", color: "#a5b4fc"
// "📱 AI will find the best 3–5 moments and cut them into portrait Shorts.
//    Processing takes 3–8 minutes."
```

Landscape selected:
```javascript
// background: "#10b98112", border: "1px solid #10b98133", color: "#6ee7b7"  
// "🖥️ The full video will be processed as one 1920×1080 landscape output.
//    No AI cutting. Processing takes 5–15 minutes depending on video length."
```

#### Dynamic settings based on format

When `outFmt === "portrait"` show all 3 controls:
- Number of clips (1–10)
- Split ratio (40–75)
- Max clip length (15–180s)

When `outFmt === "landscape"` show only 2 controls:
- Split ratio (40–75) — spans 2 columns
- A warning box (not a slider): "⏳ Long videos take 5–15 mins to process. Keep this tab open."

#### Results screen

For landscape output, show a single video player (full width, not a grid):
```javascript
job.outputs && job.outputs.length > 0 &&
React.createElement("div", null,
  React.createElement("video", {
    src: API + job.outputs[0].path,
    controls: true,
    style: { width: "100%", borderRadius: 10, marginBottom: 16 }
  }),
  React.createElement("p", { style: { fontWeight: 700 } }, job.outputs[0].title),
  React.createElement("p", { style: { color: "#64748b", fontSize: 13 } },
    "⏱️ " + job.outputs[0].duration + "s · 1920×1080 landscape"
  ),
  React.createElement("a", {
    href: API + job.outputs[0].path, download: true,
    style: downloadBtnStyle
  }, "⬇️ Download full video")
)
```

For portrait output, use the existing clip grid (unchanged).

---

### TESTS

```python
def test_portrait_output_dimensions():
    """composite_template with output_format=portrait → 1080x1920"""

def test_landscape_output_dimensions():
    """composite_template with output_format=landscape → 1920x1080"""

def test_landscape_skips_transcription():
    """landscape mode never calls transcribe_video or analyze_content"""

def test_portrait_produces_multiple_clips():
    """portrait mode produces req.num_shorts output files"""

def test_landscape_produces_single_file():
    """landscape mode produces exactly 1 output file"""

def test_split_ratio_works_in_both_formats():
    """split_ratio=0.65 produces different zone sizes in both portrait and landscape"""
```

---

### IMPLEMENTATION ORDER

F1. Add `output_format` to `ProcessRequest`
F2. Update all compositor functions to accept `output_format` and compute OUT_W/OUT_H
F3. Update pipeline in `main.py` — landscape branch skips transcription/AI
F4. Test both formats with ffprobe: portrait→1080x1920, landscape→1920x1080
F5. Add format selector UI to App.jsx (two cards)
F6. Add dynamic info banner
F7. Update settings grid to show/hide clip count based on format
F8. Update results screen — single player for landscape, grid for portrait
F9. Run all tests

---

## ADDENDUM 5: Keyword & Tag Editor (approved design)

Generate SEO keywords, hashtags and platform-ready tags for each clip.
User can edit, add, remove and copy tags directly from the results screen.

---

### BACKEND

#### Update analyzer.py — add keyword extraction to AI prompt

In `build_prompt()`, add keyword extraction to the existing shorts/template/voiceover prompts.
Add this to the JSON response schema for ALL modes:

```python
# Add to every mode's prompt instruction:
"""
Also generate SEO metadata for each clip:
- primary_keywords: 4-6 high search volume keyword phrases (2-4 words each)
- secondary_keywords: 4-6 related/long-tail keyword phrases
- hashtags: 6-10 hashtags for TikTok/Shorts (include # prefix)
- youtube_tags: comma-separated string of all keywords, max 500 chars total
- tiktok_description: caption text with inline hashtags, max 150 chars
"""

# Add to JSON schema in every mode:
{
  "clips": [
    {
      "rank": 1,
      "start_time": 12.5,
      "end_time": 45.0,
      "title": "...",
      "hook": "...",
      "caption": "...",
      "why": "...",
      "primary_keywords": ["FIFA World Cup 2026", "Canada Soccer", "World Cup Goals"],
      "secondary_keywords": ["Canada vs South Africa", "World Cup Highlights", "Football 2026"],
      "hashtags": ["#WorldCup2026", "#FIFA", "#Canada", "#Soccer", "#Football", "#Goals"],
      "youtube_tags": "FIFA World Cup 2026, Canada Soccer, World Cup Goals, Canada vs South Africa",
      "tiktok_description": "Canada's stunning opener vs South Africa 🔥 #WorldCup2026 #FIFA #Canada #Soccer"
    }
  ]
}
```

#### New endpoint: `POST /api/regenerate-keywords`

Allow user to regenerate keywords with a different style:

```python
class KeywordRequest(BaseModel):
    transcript_excerpt: str   # portion of transcript for this clip
    clip_title: str
    style: str = "seo"        # seo | viral | news | niche
    provider: str = "groq"
    model: Optional[str] = None
    api_key: str

@app.post("/api/regenerate-keywords")
async def regenerate_keywords(req: KeywordRequest):
    from backend.services.analyzer import generate_keywords
    result = await generate_keywords(
        req.transcript_excerpt, req.clip_title,
        req.style, req.api_key, req.provider, req.model
    )
    return result
```

#### New function in analyzer.py: `generate_keywords()`

```python
async def generate_keywords(transcript: str, title: str, style: str, api_key: str, provider: str, model: str = None) -> dict:
    style_instructions = {
        "seo": "Focus on high search volume terms people actually search on YouTube. Prioritize evergreen keywords.",
        "viral": "Focus on trending, emotional, and shareable terms. Use power words that drive clicks.",
        "news": "Focus on factual, journalistic terms. Include proper nouns, event names, dates.",
        "niche": "Focus on community-specific terms, insider language, and passionate niche audiences.",
    }

    prompt = f"""Generate SEO metadata for a video clip.

Title: {title}
Content: {transcript[:500]}
Style: {style_instructions.get(style, style_instructions['seo'])}

Return ONLY valid JSON:
{{
  "primary_keywords": ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "secondary_keywords": ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"],
  "youtube_tags": "keyword1, keyword2, keyword3, ...",
  "tiktok_description": "Short caption with inline #hashtags max 150 chars"
}}

Rules:
- primary_keywords: 4-6 phrases, 2-4 words each, high search volume
- secondary_keywords: 4-6 phrases, more specific/long-tail
- hashtags: 6-10 tags with # prefix
- youtube_tags: all keywords comma-separated, MUST be under 500 characters total
- tiktok_description: engaging caption with hashtags, under 150 chars
"""

    # Route to correct provider (reuse existing provider routing)
    result = await call_provider(prompt, api_key, provider, model)
    return parse_json_response(result)
```

#### Update outputs in pipeline

Each clip in the outputs list must include keyword fields:

```python
outputs.append({
    "path": f"/outputs/{job_id}/clip_{i+1}.mp4",
    "title": clip.get("title", f"Clip {i+1}"),
    "caption": clip.get("caption", ""),
    "hook": clip.get("hook", ""),
    "start": start,
    "end": end,
    "duration": dur,
    # NEW keyword fields:
    "primary_keywords": clip.get("primary_keywords", []),
    "secondary_keywords": clip.get("secondary_keywords", []),
    "hashtags": clip.get("hashtags", []),
    "youtube_tags": clip.get("youtube_tags", ""),
    "tiktok_description": clip.get("tiktok_description", ""),
})
```

---

### FRONTEND

The frontend uses React.createElement — NO JSX.

#### New state per clip

Store editable keywords in state, initialized from API response:

```javascript
// Initialize when job completes
var _clipKeywords = s({}), clipKeywords = _clipKeywords[0], setClipKeywords = _clipKeywords[1];

// When job.status === "done", initialize keywords state from outputs:
useEffect(function() {
  if (job && job.status === "done" && job.outputs) {
    var kw = {};
    job.outputs.forEach(function(clip, i) {
      kw[i] = {
        primary: clip.primary_keywords || [],
        secondary: clip.secondary_keywords || [],
        hashtags: clip.hashtags || [],
        youtube_tags: clip.youtube_tags || "",
        tiktok_description: clip.tiktok_description || "",
        activeTab: "keywords",
        newTagInput: "",
        keywordStyle: "seo",
        regenerating: false,
      };
    });
    setClipKeywords(kw);
  }
}, [job && job.status]);
```

#### Per-clip tab component

For each clip in the results grid, add tabs below the video player and download button:

**Tab bar** (3 tabs):
```
[📝 Caption] [🏷️ Keywords] [📤 Export]
```

**Caption tab:**
- Editable div (contenteditable) showing the clip caption
- Copy button

**Keywords tab:**
- Style dropdown: SEO focused / Viral / Trending / News style / Sport niche
- Regenerate button — calls `/api/regenerate-keywords`
- Three tag groups:

Primary keywords (purple tags `#6366f1`):
```javascript
// Render each keyword as a pill with × button
React.createElement("span", {
  style: { display:"inline-flex", alignItems:"center", gap:4,
           padding:"5px 10px", borderRadius:20, fontSize:12,
           background:"#6366f122", border:"1px solid #6366f144", color:"#a78bfa" }
},
  keyword,
  React.createElement("span", {
    onClick: function() { removeKeyword(clipIndex, "primary", kwIndex); },
    style: { cursor:"pointer", opacity:.6, fontSize:11 }
  }, "×")
)
```

Secondary keywords (grey tags):
- Same pattern, different colors: `background:"#1e293b"`, `color:"#94a3b8"`

Hashtags (blue tags):
- Same pattern: `background:"#0284c722"`, `color:"#38bdf8"`

Add tag button per group:
- Dashed border pill `+ Add`
- On click: show inline input
- On Enter: add tag to state
- On Escape: cancel

Copy row at bottom:
- "📋 Copy hashtags"
- "📋 Copy all YouTube tags" (primary)

**Export tab:**
- YouTube tags preview box (monospace, word-break: break-all)
- Character counter: `{youtube_tags.length} / 500 characters`
  - Normal: grey text
  - Over 450: amber warning
  - Over 500: red error
- Copy YouTube tags button
- TikTok/Shorts description preview box
- Copy TikTok description button

#### Helper functions

```javascript
function removeKeyword(clipIdx, group, kwIdx) {
  setClipKeywords(function(prev) {
    var updated = Object.assign({}, prev);
    var clip = Object.assign({}, updated[clipIdx]);
    clip[group] = clip[group].filter(function(_, i) { return i !== kwIdx; });
    // Rebuild youtube_tags string
    clip.youtube_tags = [...clip.primary, ...clip.secondary].join(", ");
    updated[clipIdx] = clip;
    return updated;
  });
}

function addKeyword(clipIdx, group, value) {
  if (!value.trim()) return;
  var val = group === "hashtags"
    ? (value.startsWith("#") ? value : "#" + value)
    : value;
  setClipKeywords(function(prev) {
    var updated = Object.assign({}, prev);
    var clip = Object.assign({}, updated[clipIdx]);
    clip[group] = [...clip[group], val];
    clip.youtube_tags = [...clip.primary, ...clip.secondary].join(", ");
    updated[clipIdx] = clip;
    return updated;
  });
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    var orig = btn.textContent;
    btn.textContent = "✓ Copied!";
    setTimeout(function() { btn.textContent = orig; }, 1500);
  });
}

async function regenerateKeywords(clipIdx) {
  var clip = clipKeywords[clipIdx];
  var output = job.outputs[clipIdx];
  // Set regenerating state
  setClipKeywords(function(prev) {
    var u = Object.assign({}, prev);
    u[clipIdx] = Object.assign({}, u[clipIdx], { regenerating: true });
    return u;
  });

  try {
    var res = await fetch(API + "/api/regenerate-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript_excerpt: output.caption || output.title,
        clip_title: output.title,
        style: clip.keywordStyle,
        provider: provider,
        model: model || cp.models[0],
        api_key: apiKey,
      })
    });
    var data = await res.json();
    setClipKeywords(function(prev) {
      var u = Object.assign({}, prev);
      u[clipIdx] = Object.assign({}, u[clipIdx], {
        primary: data.primary_keywords || [],
        secondary: data.secondary_keywords || [],
        hashtags: data.hashtags || [],
        youtube_tags: data.youtube_tags || "",
        tiktok_description: data.tiktok_description || "",
        regenerating: false,
      });
      return u;
    });
  } catch(e) {
    setClipKeywords(function(prev) {
      var u = Object.assign({}, prev);
      u[clipIdx] = Object.assign({}, u[clipIdx], { regenerating: false });
      return u;
    });
  }
}
```

---

### TESTS

```python
def test_keywords_in_analyzer_output():
    """analyze_content returns primary_keywords, secondary_keywords, hashtags for each clip"""

def test_youtube_tags_under_500_chars():
    """youtube_tags string is always <= 500 characters"""

def test_hashtags_have_hash_prefix():
    """All hashtags start with #"""

def test_regenerate_keywords_endpoint():
    """POST /api/regenerate-keywords returns valid keyword structure"""

def test_keyword_style_changes_output():
    """seo vs viral styles produce meaningfully different keywords"""

def test_keywords_in_outputs():
    """pipeline() includes keyword fields in every output clip dict"""
```

---

### IMPLEMENTATION ORDER

K1. Update analyzer.py — add keyword fields to all mode prompts
K2. Add generate_keywords() function to analyzer.py  
K3. Add POST /api/regenerate-keywords endpoint to main.py
K4. Update pipeline() to include keyword fields in outputs
K5. Add clipKeywords state + initialization useEffect to App.jsx
K6. Build keyword tab UI — tag pills with remove, add input, copy buttons
K7. Build caption tab — editable contenteditable + copy
K8. Build export tab — YouTube tags with char counter + TikTok description
K9. Wire up regenerateKeywords() function with loading state
K10. Run all keyword tests
