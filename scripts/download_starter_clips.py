"""
Download royalty-free starter background clips for ClipForge.
Uses yt-dlp to grab short clips from YouTube (Creative Commons licensed).

Usage:
    python scripts/download_starter_clips.py

Requires yt-dlp in PATH or venv activated.
"""

import subprocess
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CLIPS = [
    # Nature
    {
        "url": "https://www.youtube.com/watch?v=vIcGQPSVhoU",
        "category": "nature",
        "name": "ocean_waves",
        "duration": 25,
    },
    {
        "url": "https://www.youtube.com/watch?v=mPZkdNFkNps",
        "category": "nature",
        "name": "rain_window",
        "duration": 25,
    },
    # Satisfying
    {
        "url": "https://www.youtube.com/watch?v=LDU_Txk06tM",
        "category": "satisfying",
        "name": "abstract_liquid",
        "duration": 25,
    },
    {
        "url": "https://www.youtube.com/watch?v=BHACKCNDMW8",
        "category": "satisfying",
        "name": "geometric_patterns",
        "duration": 25,
    },
    # Gameplay-style (abstract motion)
    {
        "url": "https://www.youtube.com/watch?v=hHW1oY26kxQ",
        "category": "gameplay",
        "name": "abstract_motion",
        "duration": 25,
    },
]


def download_clip(url, out_path, duration=25):
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "-f", "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]",
        "--merge-output-format", "mp4",
        "--postprocessor-args", f"ffmpeg:-t {duration} -vf scale=1080:-2",
        "-o", out_path,
        url,
    ]
    print(f"  Downloading: {url}")
    r = subprocess.run(cmd, capture_output=False)
    return r.returncode == 0


def main():
    print("ClipForge — Downloading starter background clips\n")
    ok = 0
    for clip in CLIPS:
        cat_dir = os.path.join(ROOT, "backgrounds", clip["category"])
        os.makedirs(cat_dir, exist_ok=True)
        out = os.path.join(cat_dir, f"{clip['name']}.mp4")
        if os.path.exists(out) and os.path.getsize(out) > 10000:
            print(f"  ✓ Already exists: {clip['name']}")
            ok += 1
            continue
        print(f"\n→ {clip['category']}/{clip['name']}")
        if download_clip(clip["url"], out, clip["duration"]):
            print(f"  ✓ Saved to {out}")
            ok += 1
        else:
            print(f"  ✗ Failed — try a different URL or download manually")

    print(f"\nDone: {ok}/{len(CLIPS)} clips downloaded.")
    print("Place any .mp4 file in backgrounds/<category>/ to use it as a background.")


if __name__ == "__main__":
    main()
