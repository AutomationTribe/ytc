import json
import re
from typing import Optional

# ─────────────────────────────────────────────
# Provider router — add new providers here
# ─────────────────────────────────────────────

PROVIDERS = {
    "anthropic": {
        "name": "Anthropic Claude",
        "models": ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
        "default_model": "claude-sonnet-4-6",
        "key_hint": "sk-ant-...",
    },
    "openai": {
        "name": "OpenAI",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
        "default_model": "gpt-4o-mini",
        "key_hint": "sk-...",
    },
    "groq": {
        "name": "Groq (Free)",
        "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        "default_model": "llama-3.3-70b-versatile",
        "key_hint": "gsk_...",
    },
    "gemini": {
        "name": "Google Gemini (Free)",
        "models": ["gemini-1.5-flash", "gemini-1.5-pro"],
        "default_model": "gemini-1.5-flash",
        "key_hint": "AIza...",
    },
    "ollama": {
        "name": "Ollama (Local / Free)",
        "models": ["llama3.2", "mistral", "gemma2"],
        "default_model": "llama3.2",
        "key_hint": "no key needed",
    },
}


def get_providers():
    return PROVIDERS


async def analyze_content(
    transcript: str,
    segments: list,
    mode: str,
    num_shorts: int,
    api_key: str,
    provider: str = "anthropic",
    model: Optional[str] = None,
) -> dict:
    """Route to the correct AI provider and analyze content"""

    prompt = build_prompt(transcript, segments, mode, num_shorts)

    if provider == "anthropic":
        return await call_anthropic(prompt, api_key, model or "claude-sonnet-4-6")
    elif provider == "openai":
        return await call_openai(prompt, api_key, model or "gpt-4o-mini")
    elif provider == "groq":
        return await call_groq(prompt, api_key, model or "llama-3.3-70b-versatile")
    elif provider == "gemini":
        return await call_gemini(prompt, api_key, model or "gemini-1.5-flash")
    elif provider == "ollama":
        return await call_ollama(prompt, model or "llama3.2")
    else:
        raise ValueError(f"Unknown provider: {provider}. Choose from: {list(PROVIDERS.keys())}")


# ─────────────────────────────────────────────
# Prompt builder (shared across all providers)
# ─────────────────────────────────────────────

def build_prompt(transcript: str, segments: list, mode: str, num_shorts: int) -> str:
    segments_json = json.dumps(segments[:80], indent=2)  # cap to avoid token limits

    if mode == "shorts":
        return f"""You are an expert YouTube Shorts editor. Analyze this transcript and find the {num_shorts} best moments for YouTube Shorts.

TRANSCRIPT SEGMENTS (with timestamps in seconds):
{segments_json}

FULL TRANSCRIPT:
{transcript[:6000]}

For each Short, find a moment that:
- Is self-contained and engaging (20-90 seconds ideal, NEVER more than 120 seconds)
- Has a strong hook in the first 3 seconds
- Tells a complete micro-story or insight
- Would make viewers stop scrolling
- IMPORTANT: keep start_time and end_time as exact float values in seconds

Return ONLY valid JSON, no other text, no markdown fences:
{{
  "clips": [
    {{
      "rank": 1,
      "start_time": 12.5,
      "end_time": 45.0,
      "title": "punchy title here",
      "hook": "first 3 seconds hook text",
      "caption": "viral caption with #hashtags",
      "why": "one sentence why this works"
    }}
  ]
}}"""

    elif mode == "template":
        return f"""You are an expert video editor. Analyze this transcript and find the {num_shorts} best moments for a split-screen reaction/commentary template.

TRANSCRIPT SEGMENTS:
{segments_json}

Find moments that are visually interesting, emotionally engaging, and 20-90 seconds long (max 120s).
Generate a commentary script for each clip that a host would say while watching.

Return ONLY valid JSON, no markdown fences:
{{
  "clips": [
    {{
      "rank": 1,
      "start_time": 10.0,
      "end_time": 45.0,
      "title": "clip title",
      "commentary": "what the host says while watching, 2-4 sentences",
      "caption": "caption with #hashtags",
      "hook": "opening hook"
    }}
  ]
}}"""

    elif mode == "voiceover":
        return f"""You are an expert documentary narrator. Analyze this transcript and create compelling voiceover narration for the {num_shorts} best moments.

TRANSCRIPT SEGMENTS:
{segments_json}

FULL TRANSCRIPT:
{transcript[:6000]}

Create deep, authoritative narration for each clip like a documentary or news commentary.

Return ONLY valid JSON, no markdown fences:
{{
  "clips": [
    {{
      "rank": 1,
      "start_time": 10.0,
      "end_time": 50.0,
      "title": "clip title",
      "narration": "full narration script, dramatic and engaging, 50-100 words",
      "caption": "caption with #hashtags",
      "hook": "opening hook"
    }}
  ]
}}"""

    raise ValueError(f"Unknown mode: {mode}")


def parse_json_response(text: str) -> dict:
    """Robustly parse JSON from any LLM response"""
    text = text.strip()
    # Strip markdown fences
    text = re.sub(r'^```(?:json)?\s*\n?', '', text)
    text = re.sub(r'\n?```\s*$', '', text)
    # Find first { to last }
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1:
        text = text[start:end+1]
    return json.loads(text)


# ─────────────────────────────────────────────
# Provider implementations
# ─────────────────────────────────────────────

async def call_anthropic(prompt: str, api_key: str, model: str) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    return parse_json_response(message.content[0].text)


async def call_openai(prompt: str, api_key: str, model: str) -> dict:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    return parse_json_response(response.choices[0].message.content)


async def call_groq(prompt: str, api_key: str, model: str) -> dict:
    # Groq uses OpenAI-compatible API
    from openai import OpenAI
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )
    response = client.chat.completions.create(
        model=model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    return parse_json_response(response.choices[0].message.content)


async def call_gemini(prompt: str, api_key: str, model: str) -> dict:
    import requests
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    response = requests.post(
        url,
        params={"key": api_key},
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=60
    )
    response.raise_for_status()
    text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    return parse_json_response(text)


async def call_ollama(prompt: str, model: str) -> dict:
    import requests
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": model, "prompt": prompt, "stream": False},
        timeout=120
    )
    response.raise_for_status()
    return parse_json_response(response.json()["response"])
