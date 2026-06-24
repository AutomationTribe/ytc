import yt_dlp
import os


def download_video(youtube_url: str, job_id: str) -> tuple:
    out_dir = os.path.join("downloads", job_id)
    os.makedirs(out_dir, exist_ok=True)

    ydl_opts = {
        # Prefer H.264 (avc1) to avoid AV1/VP9 transcoding issues with FFmpeg
        # Falls back to any mp4, then best available
        "format": (
            "bestvideo[vcodec^=avc1][height<=1080][ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo[vcodec^=avc1][height<=720][ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]"
            "/best[height<=1080][ext=mp4]"
            "/best[ext=mp4]"
            "/best"
        ),
        "outtmpl": os.path.join(out_dir, "video.%(ext)s"),
        "merge_output_format": "mp4",
        "quiet": False,
        "no_warnings": False,
        "noplaylist": True,
        "socket_timeout": 60,
        "retries": 5,
        "fragment_retries": 5,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        },
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        title = info.get("title", "video")

    # Find the downloaded file
    for fname in ["video.mp4", "video.mkv", "video.webm"]:
        fpath = os.path.join(out_dir, fname)
        if os.path.exists(fpath):
            print(f"[downloader] Downloaded: {fpath} ({os.path.getsize(fpath)//1024//1024}MB)")
            return fpath, title

    # Fallback: find any video file
    for fname in os.listdir(out_dir):
        fpath = os.path.join(out_dir, fname)
        if os.path.getsize(fpath) > 10000:
            print(f"[downloader] Found fallback: {fpath}")
            return fpath, title

    raise FileNotFoundError(f"No video file found in {out_dir}")
