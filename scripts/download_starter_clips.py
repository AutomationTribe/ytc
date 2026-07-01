"""
Generate or download royalty-free starter background clips for ClipForge.

By default, generates synthetic clips locally using FFmpeg lavfi sources
(no internet needed, instant, always works).

Optionally download real clips from Pexels (free API key required).

Usage:
    # Generate synthetic clips (recommended, no API key needed):
    python scripts/download_starter_clips.py

    # Download real clips from Pexels:
    python scripts/download_starter_clips.py --pexels YOUR_API_KEY
"""

import subprocess
import os
import sys
import argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ──────────────────────────────────────────────────────────────
# Synthetic clips (FFmpeg lavfi — no internet required)
# ──────────────────────────────────────────────────────────────

SYNTHETIC_CLIPS = [
    {
        "category": "gameplay",
        "name": "abstract_motion",
        "filter": "mandelbrot=size=1080x1920:rate=30,format=yuv420p",
        "description": "Mandelbrot fractal zoom",
    },
    {
        "category": "gameplay",
        "name": "cellular_automaton",
        "filter": "cellauto=size=1080x1920:rate=30,format=yuv420p",
        "description": "Cellular automaton animation",
    },
    {
        "category": "satisfying",
        "name": "color_plasma",
        "filter": (
            "color=size=1080x1920:rate=30,"
            "hue=H='2*PI*t':s=10,"
            "format=yuv420p"
        ),
        "description": "Slow color cycle",
    },
    {
        "category": "satisfying",
        "name": "gradient_wave",
        "filter": (
            "gradients=size=1080x1920:rate=30:c0=#6366f1:c1=#ec4899:c2=#f59e0b:c3=#10b981,"
            "format=yuv420p"
        ),
        "description": "Animated gradient wave",
    },
    {
        "category": "nature",
        "name": "noise_field",
        "filter": (
            "perlin=size=1080x1920:rate=30,"
            "colorize=hue=200:saturation=0.8,"
            "format=yuv420p"
        ),
        "description": "Perlin noise field",
    },
    {
        "category": "nature",
        "name": "static_ocean",
        "filter": (
            "color=color=#1e3a5f:size=1080x1920:rate=30,"
            "format=yuv420p"
        ),
        "description": "Dark ocean blue solid",
    },
]

# Fallback: always-available simple filters
SIMPLE_CLIPS = [
    {
        "category": "gameplay",
        "name": "abstract_motion",
        "filter": "testsrc2=size=1080x1920:rate=30,format=yuv420p",
        "description": "Colorful test pattern",
    },
    {
        "category": "satisfying",
        "name": "color_bars",
        "filter": "smptebars=size=1080x1920:rate=30,format=yuv420p",
        "description": "SMPTE color bars",
    },
    {
        "category": "nature",
        "name": "solid_dark",
        "filter": "color=color=#0a1628:size=1080x1920:rate=30,format=yuv420p",
        "description": "Dark blue solid background",
    },
    {
        "category": "nature",
        "name": "solid_dark2",
        "filter": "color=color=#1a0a2e:size=1080x1920:rate=30,format=yuv420p",
        "description": "Dark purple solid background",
    },
    {
        "category": "satisfying",
        "name": "solid_teal",
        "filter": "color=color=#0a2e2e:size=1080x1920:rate=30,format=yuv420p",
        "description": "Dark teal solid background",
    },
]


def generate_clip(category, name, video_filter, duration=25):
    out_dir = os.path.join(ROOT, "backgrounds", category)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{name}.mp4")

    if os.path.exists(out) and os.path.getsize(out) > 10000:
        print(f"  ✓ Already exists: {category}/{name}.mp4")
        return True

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"{video_filter}",
        "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo",
        "-t", str(duration),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "28",
        "-c:a", "aac", "-b:a", "64k",
        "-shortest",
        out,
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=60)
    if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 1000:
        size_kb = os.path.getsize(out) // 1024
        print(f"  ✓ Generated: {category}/{name}.mp4 ({size_kb}KB)")
        return True
    else:
        print(f"  ✗ Failed: {r.stderr.decode()[-200:]}")
        return False


def generate_synthetic():
    print("Generating synthetic background clips with FFmpeg...\n")
    ok = 0

    # Try advanced filters first, fall back to simple ones if they fail
    for clip in SYNTHETIC_CLIPS:
        print(f"→ {clip['category']}/{clip['name']} ({clip['description']})")
        if generate_clip(clip["category"], clip["name"], clip["filter"]):
            ok += 1

    # Check if we got at least one per category; fill gaps with simple clips
    categories_done = set()
    for cat in ("gameplay", "satisfying", "nature"):
        cat_dir = os.path.join(ROOT, "backgrounds", cat)
        files = [f for f in os.listdir(cat_dir) if f.endswith(".mp4")] if os.path.isdir(cat_dir) else []
        if files:
            categories_done.add(cat)

    gaps = [c for c in ("gameplay", "satisfying", "nature") if c not in categories_done]
    if gaps:
        print(f"\nFilling gaps for: {gaps}")
        for clip in SIMPLE_CLIPS:
            if clip["category"] in gaps:
                print(f"→ {clip['category']}/{clip['name']} (simple fallback)")
                if generate_clip(clip["category"], clip["name"], clip["filter"]):
                    ok += 1
                    gaps = [g for g in gaps if g != clip["category"]]

    return ok


def download_pexels(api_key):
    """Download real video clips from the Pexels API."""
    import urllib.error
    import urllib.parse
    import urllib.request
    import json

    QUERIES = [
        ("gameplay", "gaming screen abstract"),
        ("gameplay", "gaming setup neon"),
        ("gameplay", "arcade screen"),
        ("gameplay", "retro game background"),
        ("satisfying", "satisfying liquid abstract"),
        ("satisfying", "ink in water abstract"),
        ("satisfying", "kinetic sand"),
        ("satisfying", "abstract particles"),
        ("nature", "ocean waves"),
        ("nature", "rain window"),
        ("nature", "forest waterfall"),
        ("nature", "mountain clouds"),
        ("nature", "sunset ocean"),
        ("satisfying", "geometric motion"),
    ]

    base_headers = {
        "Accept": "application/json",
        "User-Agent": "ClipForge/4.0",
    }
    use_auth = bool(api_key)
    auth_warning_shown = False
    ok = 0

    for category, query in QUERIES:
        cat_dir = os.path.join(ROOT, "backgrounds", category)
        os.makedirs(cat_dir, exist_ok=True)
        fname = query.replace(" ", "_") + ".mp4"
        out = os.path.join(cat_dir, fname)

        if os.path.exists(out) and os.path.getsize(out) > 10000:
            print(f"  ✓ Already exists: {category}/{fname}")
            ok += 1
            continue

        print(f"\n→ {category}/{fname}")
        try:
            params = urllib.parse.urlencode({
                "query": query,
                "per_page": 1,
                "orientation": "portrait",
            })
            url = f"https://api.pexels.com/videos/search?{params}"
            headers = dict(base_headers)
            if use_auth:
                headers["Authorization"] = api_key

            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read())
            except urllib.error.HTTPError as e:
                if use_auth and (e.code == 401 or e.code == 403):
                    use_auth = False
                    if not auth_warning_shown:
                        print("  ! Pexels rejected the API key; retrying without it.")
                        auth_warning_shown = True
                    req = urllib.request.Request(url, headers=base_headers)
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        data = json.loads(resp.read())
                else:
                    raise

            videos = data.get("videos", [])
            if not videos:
                print(f"  ✗ No results for '{query}'")
                continue

            # Pick smallest HD file
            files = videos[0].get("video_files", [])
            files_hd = [f for f in files if f.get("height", 0) >= 720]
            if not files_hd:
                files_hd = files
            files_hd.sort(key=lambda f: f.get("height", 0))
            dl_url = files_hd[0]["link"]

            print(f"  Downloading from Pexels...")
            req2 = urllib.request.Request(dl_url, headers={"User-Agent": "ClipForge/4.0"})
            with urllib.request.urlopen(req2, timeout=60) as resp:
                data = resp.read()
            with open(out, "wb") as f:
                f.write(data)

            # Trim to 25s with ffmpeg
            trimmed = out.replace(".mp4", "_trim.mp4")
            r = subprocess.run([
                "ffmpeg", "-y", "-i", out, "-t", "25",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "26",
                "-c:a", "aac", "-b:a", "128k",
                trimmed
            ], capture_output=True, timeout=120)

            if r.returncode == 0 and os.path.getsize(trimmed) > 1000:
                os.replace(trimmed, out)
                print(f"  ✓ Saved & trimmed: {category}/{fname} ({os.path.getsize(out)//1024}KB)")
                ok += 1
            else:
                os.remove(out)
                print(f"  ✗ Trim failed")

        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace").strip()
            detail = f": {body}" if body else ""
            print(f"  ✗ HTTP {e.code} {e.reason}{detail}")
            if e.code == 401 or e.code == 403:
                print("    Check that your Pexels API key is active and copied exactly.")
        except Exception as e:
            print(f"  ✗ Error: {e}")

    return ok


def main():
    parser = argparse.ArgumentParser(description="Download or generate ClipForge background clips")
    parser.add_argument("--pexels", metavar="API_KEY", help="Pexels API key for downloading real clips")
    args = parser.parse_args()

    print("ClipForge — Background clip generator\n")

    if args.pexels:
        print("Mode: Pexels download\n")
        ok = download_pexels(args.pexels)
    else:
        print("Mode: Synthetic generation (FFmpeg lavfi — no internet required)\n")
        ok = generate_synthetic()

    print(f"\n{'='*50}")
    print(f"Done! {ok} clips ready in backgrounds/")
    print(f"\nTip: Drop any .mp4 into backgrounds/<category>/ to use it.")
    if not args.pexels:
        print(f"Tip: For real clips, run: python scripts/download_starter_clips.py --pexels YOUR_KEY")
        print(f"     Get a free key at: https://www.pexels.com/api/")


if __name__ == "__main__":
    main()
