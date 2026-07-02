import subprocess
import os
import shutil


def get_video_duration(path: str) -> float:
    result = subprocess.run([
        "ffprobe", "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path
    ], capture_output=True, text=True, timeout=30)
    try:
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def parse_timestamp(ts: str) -> float:
    """Parse MM:SS, HH:MM:SS, or raw seconds string to float seconds."""
    ts = str(ts).strip()
    if ':' in ts:
        parts = ts.split(':')
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
    return float(ts)


def apply_cuts(input_path: str, cuts: list, output_path: str) -> bool:
    """
    Remove specified time segments from a video by concatenating the kept segments.

    cuts: list of {start, end} dicts with times in seconds or MM:SS format
    """
    if not cuts:
        shutil.copy2(input_path, output_path)
        return True

    duration = get_video_duration(input_path)
    if duration <= 0:
        print(f"[cutter] Could not get duration for {input_path}")
        return False

    # Parse and sort cuts
    parsed_cuts = []
    for cut in cuts:
        start = parse_timestamp(cut.get("start", 0))
        end = parse_timestamp(cut.get("end", 0))
        if end > start and start >= 0:
            parsed_cuts.append((max(0.0, start), min(duration, end)))

    parsed_cuts.sort(key=lambda x: x[0])

    # Merge overlapping cuts
    merged = []
    for cut in parsed_cuts:
        if merged and cut[0] <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], cut[1]))
        else:
            merged.append(list(cut))

    # Calculate kept segments (inverse of cuts)
    kept = []
    prev_end = 0.0
    for cut_start, cut_end in merged:
        if cut_start > prev_end + 0.01:
            kept.append((prev_end, cut_start))
        prev_end = cut_end
    if prev_end < duration - 0.01:
        kept.append((prev_end, duration))

    if not kept:
        print("[cutter] No segments to keep after applying cuts")
        return False

    print(f"[cutter] Cuts: {merged}")
    print(f"[cutter] Keeping {len(kept)} segment(s): {kept}")

    # Single segment — extract directly (faster, no re-encode of concat step)
    if len(kept) == 1:
        start, end = kept[0]
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-to", str(end),
            "-i", input_path,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
        if result.returncode != 0:
            print(f"[cutter] Segment extraction failed: {result.stderr[-300:]}")
            return False
        print(f"[cutter] Done. Output: {output_path}")
        return True

    # Multiple segments — extract each to a temp file then concat
    tmp_dir = os.path.dirname(output_path)
    tmp_files = []
    concat_list_path = os.path.join(tmp_dir, "_concat_list.txt")

    try:
        for idx, (start, end) in enumerate(kept):
            tmp_path = os.path.join(tmp_dir, f"_seg_{idx}.mp4")
            tmp_files.append(tmp_path)
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(start),
                "-to", str(end),
                "-i", input_path,
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-preset", "ultrafast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-avoid_negative_ts", "make_zero",
                tmp_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
            if result.returncode != 0:
                print(f"[cutter] Segment {idx} failed: {result.stderr[-200:]}")
                return False
            print(f"[cutter] Segment {idx}: {start:.1f}s → {end:.1f}s")

        with open(concat_list_path, "w") as f:
            for tp in tmp_files:
                f.write(f"file '{os.path.abspath(tp)}'\n")

        cmd_concat = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_list_path,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            output_path,
        ]
        result = subprocess.run(cmd_concat, capture_output=True, text=True, timeout=7200)
        if result.returncode != 0:
            print(f"[cutter] Concat failed: {result.stderr[-300:]}")
            return False

        print(f"[cutter] Done. Output: {output_path}")
        return True

    finally:
        for f in tmp_files:
            if os.path.exists(f):
                os.remove(f)
        if os.path.exists(concat_list_path):
            os.remove(concat_list_path)
