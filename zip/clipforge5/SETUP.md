# ⚡ ClipForge — Setup Guide
## YouTube → Shorts Generator | All 3 Phases

---

## STEP 1: Install Prerequisites

### A) Install Python 3.10+
Download from: https://www.python.org/downloads/
- ✅ During install, check "Add Python to PATH"
- Verify: open Terminal/Command Prompt and type:
  ```
  python --version
  ```

### B) Install FFmpeg
**Windows:**
1. Download from: https://ffmpeg.org/download.html → Windows builds → BtbN releases
2. Extract the zip → go into the `bin` folder
3. Copy `ffmpeg.exe`, `ffprobe.exe` to `C:\Windows\System32\`
4. Verify: `ffmpeg -version`

**Mac:**
```bash
brew install ffmpeg
```
If you don't have Homebrew: https://brew.sh

**Linux (Ubuntu/Debian):**
```bash
sudo apt install ffmpeg
```

### C) Install Node.js 18+
Download from: https://nodejs.org (LTS version)
Verify: `node --version`

---

## STEP 2: Set Up the Backend

Open Terminal/Command Prompt in the `clipforge` folder:

```bash
# Navigate to backend
cd clipforge/backend

# Create Python virtual environment
python -m venv venv

# Activate it:
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install all Python packages
pip install -r requirements.txt
```

⚠️ The first install downloads ~500MB (Whisper AI model included). This is a one-time download.

---

## STEP 3: Set Up the Frontend

Open a NEW Terminal window:

```bash
cd clipforge/frontend

# Install Node packages
npm install
```

---

## STEP 4: Get Your API Keys

### Anthropic API Key (REQUIRED)
1. Go to: https://console.anthropic.com
2. Sign up / Log in
3. Click "API Keys" → "Create Key"
4. Copy the key (starts with `sk-ant-...`)

### ElevenLabs API Key (OPTIONAL — for AI voice only)
1. Go to: https://elevenlabs.io
2. Sign up (free tier = 10,000 chars/month)
3. Profile → API Keys → Copy

---

## STEP 5: Run the App

### Terminal 1 — Start Backend:
```bash
cd clipforge/backend
source venv/bin/activate   # (Mac/Linux)
# OR: venv\Scripts\activate  (Windows)

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Terminal 2 — Start Frontend:
```bash
cd clipforge/frontend
npm run dev
```

You should see:
```
  ➜  Local:   http://localhost:3000/
```

---

## STEP 6: Use the App

1. Open your browser: **http://localhost:3000**
2. Click ⚙️ **Settings** and paste your Anthropic API key
3. Paste a YouTube URL
4. Choose your mode:
   - **Auto Shorts** — AI finds best moments and cuts them
   - **Video Template** — Apply split-screen / reaction layouts
   - **AI Voiceover** — Documentary-style narration (needs ElevenLabs)
5. Click **Process →** and wait 2–5 minutes
6. Download your Shorts! 🎉

---

## How the Pipeline Works

```
YouTube URL
    ↓
yt-dlp          ← Downloads video (up to 1080p)
    ↓
Whisper AI      ← Transcribes speech with timestamps
    ↓
Claude API      ← Finds best moments + writes captions/scripts
    ↓
FFmpeg          ← Cuts clips, applies templates, burns captions
    ↓
ElevenLabs      ← Generates AI voice (voiceover mode only)
    ↓
Your Shorts ✅
```

---

## Troubleshooting

**"ffmpeg not found"**
→ Make sure FFmpeg is in your PATH. Try restarting terminal after install.

**"Module not found"**
→ Make sure your virtual environment is activated (you see `(venv)` in terminal)

**"API key invalid"**
→ Double-check key in Settings. Anthropic keys start with `sk-ant-`

**Video processing fails**
→ Some YouTube videos are age-restricted or region-blocked. Try a different video.

**Whisper is slow**
→ First run downloads the model. Subsequent runs are faster. For speed, change `"base"` to `"tiny"` in `backend/services/transcriber.py`

---

## File Structure

```
clipforge/
├── backend/
│   ├── main.py                  ← FastAPI server
│   ├── requirements.txt
│   └── services/
│       ├── downloader.py        ← yt-dlp YouTube download
│       ├── transcriber.py       ← Whisper AI transcription
│       ├── analyzer.py          ← Claude AI content analysis
│       ├── processor.py         ← FFmpeg video processing
│       └── template_service.py  ← Template definitions
├── frontend/
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       └── App.jsx              ← Full React UI
├── downloads/                   ← Temp downloaded videos
└── outputs/                     ← Your finished Shorts go here
```

---

## Upgrading Templates (Phase 3)

To add a new template:
1. Open `backend/services/template_service.py`
2. Add a new entry to `TEMPLATES` dict
3. Open `backend/services/processor.py`
4. Add a new layout branch in `create_template_clip()`

---

Built with: yt-dlp + OpenAI Whisper + Anthropic Claude + FFmpeg + ElevenLabs + React + FastAPI
