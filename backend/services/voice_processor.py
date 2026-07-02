import subprocess
import os
import random


MUSIC_DIR = "music"


def remove_voice(input_path: str, output_path: str) -> bool:
    """
    Remove vocals using center-channel cancellation (Left - Right).
    Works best on professionally mixed stereo audio.
    Keeps background sounds/music.
    """
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-af", "pan=stereo|c0=c0-c1|c1=c1-c0",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if result.returncode != 0:
        print(f"[voice] remove_voice failed: {result.stderr[-300:]}")
        return False
    return True


def add_music(
    input_path: str,
    output_path: str,
    category: str,
    music_volume: float = 0.8,
    original_volume: float = 0.2,
) -> bool:
    """
    Mix a random royalty-free music track from the category folder over the video.
    Music loops if shorter than the video.
    """
    music_folder = os.path.join(MUSIC_DIR, category)
    if not os.path.exists(music_folder):
        print(f"[voice] Music folder not found: {music_folder}")
        return False

    tracks = [
        f for f in os.listdir(music_folder)
        if f.endswith((".mp3", ".wav", ".m4a", ".ogg"))
    ]
    if not tracks:
        print(f"[voice] No music tracks in {music_folder}")
        return False

    track = os.path.join(music_folder, random.choice(tracks))
    print(f"[voice] Using music track: {track}")

    # Clamp volumes to sane range
    music_volume = max(0.0, min(2.0, float(music_volume)))
    original_volume = max(0.0, min(2.0, float(original_volume)))

    filter_complex = (
        f"[0:a]volume={original_volume}[orig];"
        f"[1:a]volume={music_volume}[music];"
        f"[orig][music]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-stream_loop", "-1", "-i", track,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if result.returncode != 0:
        print(f"[voice] add_music failed: {result.stderr[-300:]}")
        return False
    return True


def replace_with_ai_voice(
    input_path: str,
    output_path: str,
    transcript: str,
    voice_id: str,
    elevenlabs_api_key: str,
    original_volume: float = 0.0,
) -> bool:
    """
    Replace video audio with AI-generated voice via ElevenLabs.
    original_volume=0.0 silences the source audio entirely.
    """
    import requests as _req

    audio_path = output_path.replace(".mp4", "_ai_voice.mp3")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": elevenlabs_api_key,
    }
    payload = {
        "text": transcript[:5000],  # ElevenLabs has a char limit
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }

    try:
        response = _req.post(url, json=payload, headers=headers, timeout=120)
        if response.status_code != 200:
            print(f"[voice] ElevenLabs error {response.status_code}: {response.text[:200]}")
            return False
        with open(audio_path, "wb") as f:
            f.write(response.content)
        print(f"[voice] AI audio generated: {audio_path} ({len(response.content)//1024}KB)")
    except Exception as e:
        print(f"[voice] ElevenLabs request failed: {e}")
        return False

    try:
        if original_volume > 0:
            filter_complex = (
                f"[0:a]volume={original_volume}[orig];"
                f"[1:a]volume=1.0[ai];"
                f"[orig][ai]amix=inputs=2:duration=shortest[aout]"
            )
            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-i", audio_path,
                "-filter_complex", filter_complex,
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-shortest", output_path,
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-i", audio_path,
                "-map", "0:v", "-map", "1:a",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-shortest", output_path,
            ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
        if result.returncode != 0:
            print(f"[voice] replace_with_ai_voice merge failed: {result.stderr[-300:]}")
            return False
        return True
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)


def pitch_shift(input_path: str, output_path: str, semitones: float = 2.0) -> bool:
    """
    Shift audio pitch by N semitones without changing speed.
    +2/-2 semitones breaks audio fingerprinting but is imperceptible to listeners.
    Uses asetrate to change pitch then aresample to restore original sample rate.
    """
    factor = 2 ** (semitones / 12)
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-af", f"asetrate=44100*{factor},aresample=44100",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if result.returncode != 0:
        print(f"[voice] pitch_shift failed: {result.stderr[-300:]}")
        return False
    return True


def speed_adjust(input_path: str, output_path: str, speed: float = 1.02) -> bool:
    """
    Change video speed by a small factor (e.g. 1.02 = 2% faster).
    Breaks video fingerprinting; 2% is below human perception threshold.
    Re-encodes video with setpts and audio with atempo.
    """
    pts_factor = round(1.0 / speed, 6)
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-vf", f"setpts={pts_factor}*PTS",
        "-af", f"atempo={speed}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if result.returncode != 0:
        print(f"[voice] speed_adjust failed: {result.stderr[-300:]}")
        return False
    return True
