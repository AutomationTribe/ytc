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

Also include SEO metadata for each clip: primary_keywords (4-6 high search volume phrases), secondary_keywords (4-6 long-tail phrases), hashtags (6-10 with # prefix), youtube_tags (all keywords comma-separated, max 500 chars), tiktok_description (caption with hashtags, max 150 chars).

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
      "why": "one sentence why this works",
      "primary_keywords": ["keyword phrase 1", "keyword phrase 2", "keyword phrase 3"],
      "secondary_keywords": ["long tail 1", "long tail 2", "long tail 3"],
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6"],
      "youtube_tags": "keyword phrase 1, keyword phrase 2, long tail 1",
      "tiktok_description": "Short engaging caption with #hashtags max 150 chars"
    }}
  ]
}}"""

    elif mode == "template":
        return f"""You are an expert video editor. Analyze this transcript and find the {num_shorts} best moments for a split-screen reaction/commentary template.

TRANSCRIPT SEGMENTS:
{segments_json}

Find moments that are visually interesting, emotionally engaging, and 20-90 seconds long (max 120s).
Generate a commentary script for each clip that a host would say while watching.

Also include SEO metadata for each clip: primary_keywords (4-6 high search volume phrases), secondary_keywords (4-6 long-tail phrases), hashtags (6-10 with # prefix), youtube_tags (all keywords comma-separated, max 500 chars), tiktok_description (caption with hashtags, max 150 chars).

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
      "hook": "opening hook",
      "primary_keywords": ["keyword phrase 1", "keyword phrase 2", "keyword phrase 3"],
      "secondary_keywords": ["long tail 1", "long tail 2", "long tail 3"],
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6"],
      "youtube_tags": "keyword phrase 1, keyword phrase 2, long tail 1",
      "tiktok_description": "Short engaging caption with #hashtags max 150 chars"
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

Also include SEO metadata for each clip: primary_keywords (4-6 high search volume phrases), secondary_keywords (4-6 long-tail phrases), hashtags (6-10 with # prefix), youtube_tags (all keywords comma-separated, max 500 chars), tiktok_description (caption with hashtags, max 150 chars).

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
      "hook": "opening hook",
      "primary_keywords": ["keyword phrase 1", "keyword phrase 2", "keyword phrase 3"],
      "secondary_keywords": ["long tail 1", "long tail 2", "long tail 3"],
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6"],
      "youtube_tags": "keyword phrase 1, keyword phrase 2, long tail 1",
      "tiktok_description": "Short engaging caption with #hashtags max 150 chars"
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
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )
    return parse_json_response(message.content[0].text)


async def call_openai(prompt: str, api_key: str, model: str) -> dict:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        max_tokens=4000,
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
        max_tokens=4000,
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


async def generate_keywords(transcript: str, title: str, style: str, api_key: str, provider: str, model: Optional[str] = None) -> dict:
    style_instructions = {
        "seo": "Focus on high search volume terms people actually search on YouTube. Prioritize evergreen keywords.",
        "viral": "Focus on trending, emotional, and shareable terms. Use power words that drive clicks.",
        "news": "Focus on factual, journalistic terms. Include proper nouns, event names, dates.",
        "niche": "Focus on community-specific terms, insider language, and passionate niche audiences.",
    }

    prompt = f"""Generate SEO metadata for a video clip.

Title: {title}
Content: {transcript[:500]}
Style: {style_instructions.get(style, style_instructions['seo'])}

Return ONLY valid JSON:
{{
  "primary_keywords": ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "secondary_keywords": ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"],
  "youtube_tags": "keyword1, keyword2, keyword3, ...",
  "tiktok_description": "Short caption with inline #hashtags max 150 chars"
}}

Rules:
- primary_keywords: 4-6 phrases, 2-4 words each, high search volume
- secondary_keywords: 4-6 phrases, more specific/long-tail
- hashtags: 6-10 tags with # prefix
- youtube_tags: all keywords comma-separated, MUST be under 500 characters total
- tiktok_description: engaging caption with hashtags, under 150 chars
"""

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
        raise ValueError(f"Unknown provider: {provider}")
