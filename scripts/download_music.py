#!/usr/bin/env python3
"""
Download royalty-free music tracks for ClipForge voice/audio feature.
Uses Pixabay Audio API. Set PIXABAY_KEY env var or pass --key.

Usage:
    python scripts/download_music.py --key YOUR_PIXABAY_API_KEY
    python scripts/download_music.py  # uses PIXABAY_KEY env var

Each category gets 3 tracks (~60-120s each).
Saves to music/{category}/*.mp3
"""

import os
import sys
import argparse
import requests
import time

MUSIC_DIR = "music"

SEARCHES = {
    "gaming": ["gaming", "electronic game", "8bit"],
    "motivational": ["motivational", "uplifting", "inspiring"],
    "chill": ["lofi", "chill", "ambient relax"],
    "news": ["news dramatic", "corporate", "broadcast"],
    "sports": ["sports energetic", "action", "workout"],
    "cinematic": ["cinematic", "epic", "orchestral"],
}


def pixabay_search(api_key, query, per_page=5):
    url = "https://pixabay.com/api/music/"
    params = {
        "key": api_key,
        "q": query,
        "per_page": per_page,
        "safesearch": "true",
    }
    try:
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        return r.json().get("hits", [])
    except Exception as e:
        print(f"  [warn] Pixabay search failed for '{query}': {e}")
        return []


def download_track(url, dest_path):
    try:
        r = requests.get(url, timeout=120, stream=True)
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        size_kb = os.path.getsize(dest_path) // 1024
        print(f"  ✓ {os.path.basename(dest_path)} ({size_kb}KB)")
        return True
    except Exception as e:
        print(f"  ✗ Download failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download music tracks for ClipForge")
    parser.add_argument("--key", default=os.environ.get("PIXABAY_KEY", ""), help="Pixabay API key")
    parser.add_argument("--per-category", type=int, default=3, help="Tracks per category (default: 3)")
    args = parser.parse_args()

    if not args.key:
        print("Error: Pixabay API key required. Set PIXABAY_KEY env var or use --key.")
        print("Get a free key at https://pixabay.com/api/docs/")
        sys.exit(1)

    os.makedirs(MUSIC_DIR, exist_ok=True)
    total_downloaded = 0

    for category, queries in SEARCHES.items():
        cat_dir = os.path.join(MUSIC_DIR, category)
        os.makedirs(cat_dir, exist_ok=True)

        # Skip if already has enough tracks
        existing = [f for f in os.listdir(cat_dir) if f.endswith((".mp3", ".wav", ".m4a"))]
        if len(existing) >= args.per_category:
            print(f"[{category}] Already has {len(existing)} tracks — skipping")
            continue

        needed = args.per_category - len(existing)
        print(f"\n[{category}] Downloading {needed} track(s)...")

        downloaded = 0
        for query in queries:
            if downloaded >= needed:
                break
            hits = pixabay_search(args.key, query)
            for hit in hits:
                if downloaded >= needed:
                    break
                audio_url = hit.get("audio", {}).get("mp3")
                if not audio_url:
                    continue
                duration = hit.get("duration", 0)
                if duration < 30:
                    continue  # too short
                fname = f"{category}_{hit['id']}.mp3"
                dest = os.path.join(cat_dir, fname)
                if os.path.exists(dest):
                    print(f"  ↩ {fname} already exists")
                    downloaded += 1
                    continue
                if download_track(audio_url, dest):
                    downloaded += 1
                    total_downloaded += 1
                time.sleep(0.5)  # rate limit

        if downloaded == 0:
            print(f"  [warn] No tracks downloaded for '{category}'. Check your API key.")

    print(f"\nDone! {total_downloaded} track(s) downloaded.")
    print("Run 'GET /api/music-categories' to verify counts.")


if __name__ == "__main__":
    main()
