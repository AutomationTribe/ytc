import os
import subprocess


def apply_watermark_regions(
    input_path: str,
    output_path: str,
    regions: list,
    video_width: int,
    video_height: int,
    frame_width: int,
    frame_height: int,
) -> bool:
    """
    Apply multiple watermark regions to a video using a chained filter_complex.

    Regions are defined in preview-frame pixel space and scaled to actual video
    dimensions here. All scaled values are pre-calculated integers — no FFmpeg
    math expressions.

    regions: list of {x, y, w, h, method, color}
      method: "blur" | "black" | "color"
      color:  any FFmpeg-accepted color string (ignored unless method=="color")
    video_width/height: actual output video dimensions (e.g. 1080x1920)
    frame_width/height: preview frame dimensions used when the user drew regions
    """
    if not regions:
        return True

    scale_x = video_width / frame_width
    scale_y = video_height / frame_height

    filters = []
    current = "[0:v]"

    for i, region in enumerate(regions):
        # Scale preview coords → video coords
        x = int(region["x"] * scale_x)
        y = int(region["y"] * scale_y)
        w = int(region["w"] * scale_x)
        h = int(region["h"] * scale_y)

        # Even dimensions (libx264 requirement)
        if w % 2 != 0:
            w += 1
        if h % 2 != 0:
            h += 1

        # Clamp to video bounds
        x = max(0, min(x, video_width - w))
        y = max(0, min(y, video_height - h))

        # Skip degenerate regions
        if w <= 0 or h <= 0:
            continue

        method = region.get("method", "blur")
        out_label = f"[v{i}]"

        if method == "blur":
            filters.append(
                f"{current}split=2[bg{i}][fg{i}];"
                f"[fg{i}]crop={w}:{h}:{x}:{y},gblur=sigma=25[blurred{i}];"
                f"[bg{i}][blurred{i}]overlay={x}:{y}{out_label}"
            )
        else:
            color = region.get("color", "black") if method == "color" else "black"
            filters.append(
                f"{current}drawbox={x}:{y}:{w}:{h}:{color}:fill{out_label}"
            )

        current = out_label

    if not filters:
        return True  # all regions were degenerate; nothing to do

    # Build final filter_complex string, renaming the last output label to [vout]
    filter_str = ";".join(filters)
    filter_str = filter_str[:filter_str.rfind("[")] + "[vout]"

    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-filter_complex", filter_str,
        "-map", "[vout]", "-map", "0:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "ultrafast", "-crf", "28",
        "-c:a", "copy",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if result.returncode != 0:
        print(f"[watermark] FFmpeg error: {result.stderr[-500:]}")
        return False
    return os.path.exists(output_path) and os.path.getsize(output_path) > 0
