TEMPLATES = {
    "split_reaction": {
        "id": "split_reaction",
        "name": "Split Screen Reaction",
        "description": "Your video on top, reaction/commentary space on bottom. Perfect for commentary channels.",
        "icon": "⬆️⬇️",
        "layout": "vertical_split",
        "video_position": "top",
        "overlay_position": "bottom",
        "video_scale": 0.5,
        "requires_reaction_clip": False,
        "color_accent": "#FF0000"
    },
    "side_by_side": {
        "id": "side_by_side",
        "name": "Side by Side",
        "description": "Original video on left, branding/text panel on right. Great for educational content.",
        "icon": "◀️▶️",
        "layout": "horizontal_split",
        "video_position": "left",
        "overlay_position": "right",
        "video_scale": 0.5,
        "requires_reaction_clip": False,
        "color_accent": "#00FF88"
    },
    "picture_in_picture": {
        "id": "picture_in_picture",
        "name": "Picture in Picture",
        "description": "Full screen video with a smaller overlay in the corner.",
        "icon": "🖼️",
        "layout": "pip",
        "video_position": "fullscreen",
        "overlay_position": "bottom_right",
        "video_scale": 1.0,
        "pip_scale": 0.25,
        "requires_reaction_clip": False,
        "color_accent": "#FFD700"
    },
    "caption_only": {
        "id": "caption_only",
        "name": "Viral Captions",
        "description": "Full screen video with bold animated captions. TikTok/Shorts style.",
        "icon": "💬",
        "layout": "fullscreen_captions",
        "video_position": "fullscreen",
        "overlay_position": "center",
        "video_scale": 1.0,
        "requires_reaction_clip": False,
        "color_accent": "#FFFFFF"
    },
    "voiceover_narration": {
        "id": "voiceover_narration",
        "name": "AI Deep Voice Narration",
        "description": "Your video with a powerful AI-generated voiceover commentary. Like a documentary narrator.",
        "icon": "🎙️",
        "layout": "fullscreen_voice",
        "video_position": "fullscreen",
        "video_scale": 1.0,
        "requires_elevenlabs": True,
        "color_accent": "#8B5CF6"
    }
}
