import whisper
import os

_model = None

def get_model():
    global _model
    if _model is None:
        print("Loading Whisper model (first run downloads ~150MB)...")
        _model = whisper.load_model("base")
    return _model

def transcribe_video(video_path: str) -> tuple[str, list]:
    """
    Transcribe video audio using Whisper.
    Returns (full_transcript, segments_with_timestamps)
    segments = [{"start": float, "end": float, "text": str}]
    """
    model = get_model()
    result = model.transcribe(video_path, verbose=False)

    segments = [
        {
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip()
        }
        for seg in result["segments"]
    ]

    full_transcript = " ".join(s["text"] for s in segments)
    return full_transcript, segments
