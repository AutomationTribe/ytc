import React, { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";

// --- Error Boundary ---
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return React.createElement("div", { style: { color: "red", padding: 40, fontFamily: "monospace" } },
        React.createElement("h2", null, "UI Error"),
        React.createElement("pre", null, this.state.error.toString())
      );
    }
    return this.props.children;
  }
}

// --- Constants ---
const PROVIDERS = [
  { id: "groq", name: "Groq", tag: "FREE", hint: "gsk_...", url: "https://console.groq.com", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], color: "#6366f1", free: true },
  { id: "openai", name: "OpenAI", tag: "Paid", hint: "sk-...", url: "https://platform.openai.com/api-keys", models: ["gpt-4o-mini", "gpt-4o"], color: "#10b981", free: false },
  { id: "anthropic", name: "Claude", tag: "Paid", hint: "sk-ant-...", url: "https://console.anthropic.com", models: ["claude-sonnet-4-6"], color: "#f97316", free: false },
  { id: "gemini", name: "Gemini", tag: "FREE", hint: "AIza...", url: "https://aistudio.google.com/app/apikey", models: ["gemini-1.5-flash"], color: "#3b82f6", free: true },
  { id: "ollama", name: "Ollama", tag: "Local", hint: "no key", url: "https://ollama.com", models: ["llama3.2", "mistral"], color: "#8b5cf6", free: true },
];

const TEMPLATE_DEFS = [
  {
    id: "gameplay_split",
    name: "Gameplay Split",
    description: "Your video on top, gameplay on bottom",
    needsBg: true,
    preview: function(ratio) {
      var top = Math.round(ratio * 100);
      var bot = 100 - top;
      return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { flex: top, background: "#6366f133", border: "1px solid #6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#a5b4fc" } }, "Your video"),
        React.createElement("div", { style: { flex: bot, background: "#f59e0b22", border: "1px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fcd34d" } }, "Gameplay")
      );
    }
  },
  {
    id: "satisfying_split",
    name: "Satisfying Split",
    description: "Your video on top, satisfying ASMR clip on bottom",
    needsBg: true,
    preview: function(ratio) {
      var top = Math.round(ratio * 100);
      var bot = 100 - top;
      return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { flex: top, background: "#6366f133", border: "1px solid #6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#a5b4fc" } }, "Your video"),
        React.createElement("div", { style: { flex: bot, background: "#ec489922", border: "1px solid #ec4899", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#f9a8d4" } }, "Satisfying")
      );
    }
  },
  {
    id: "side_by_side",
    name: "Side by Side",
    description: "Your video on the left, background clip on the right",
    needsBg: true,
    preview: function() {
      return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex" } },
        React.createElement("div", { style: { flex: 1, background: "#6366f133", border: "1px solid #6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#a5b4fc" } }, "Video"),
        React.createElement("div", { style: { flex: 1, background: "#f59e0b22", border: "1px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fcd34d" } }, "BG clip")
      );
    }
  },
  {
    id: "picture_in_picture",
    name: "Picture in Picture",
    description: "Background fullscreen, your video in corner",
    needsBg: true,
    preview: function() {
      return React.createElement("div", { style: { width: "100%", height: "100%", position: "relative", background: "#f59e0b22", border: "1px solid #f59e0b" } },
        React.createElement("div", { style: { fontSize: 7, color: "#fcd34d", position: "absolute", top: 4, left: 4 } }, "Background"),
        React.createElement("div", { style: { position: "absolute", bottom: 4, right: 4, width: "32%", height: "28%", background: "#6366f1aa", border: "1px solid #a5b4fc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, color: "#fff" } }, "You")
      );
    }
  },
  {
    id: "caption_bar",
    name: "Caption Bar",
    description: "Your video on top 70%, caption space on bottom",
    needsBg: false,
    preview: function() {
      return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { flex: 70, background: "#6366f133", border: "1px solid #6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#a5b4fc" } }, "Your video"),
        React.createElement("div", { style: { flex: 30, background: "#10b98122", border: "1px solid #10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#6ee7b7" } }, "Captions")
      );
    }
  },
];

const BG_CATEGORIES = ["gameplay", "satisfying", "nature", "custom"];

const MUSIC_CATEGORIES = [
  { id: "gaming", label: "🎮 Gaming" },
  { id: "motivational", label: "💪 Motivational" },
  { id: "chill", label: "😌 Chill / Lo-fi" },
  { id: "news", label: "📰 News / Dramatic" },
  { id: "sports", label: "⚽ Sports" },
  { id: "cinematic", label: "🎭 Cinematic" },
];

const AI_VOICES = [
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", style: "Deep · Powerful", icon: "🎙️", color: "#7c3aed" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", style: "Documentary · Narrator", icon: "📖", color: "#0369a1" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", style: "Dramatic · News", icon: "🎭", color: "#b45309" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", style: "Warm · Conversational", icon: "💃", color: "#059669" },
];

function getLS(k, fallback) {
  try { return localStorage.getItem(k) || fallback; } catch(e) { return fallback; }
}
function setLS(k, v) {
  try { localStorage.setItem(k, v); } catch(e) {}
}

// --- Main App ---
function ClipForge() {
  var initProvider = getLS("cf_prov", "groq");
  var s = useState;

  // Core
  var _url = s(""), url = _url[0], setUrl = _url[1];
  var _mode = s("shorts"), mode = _mode[0], setMode = _mode[1];
  var _num = s(3), num = _num[0], setNum = _num[1];
  var _minD = s(10), minD = _minD[0], setMinD = _minD[1];
  var _maxD = s(60), maxD = _maxD[0], setMaxD = _maxD[1];
  var _prov = s(initProvider), prov = _prov[0], setProv = _prov[1];
  var _model = s(""), model = _model[0], setModel = _model[1];
  var _key = s(getLS("cf_key_" + initProvider, "")), apiKey = _key[0], setKey = _key[1];
  var _eKey = s(getLS("cf_ekey", "")), eKey = _eKey[0], setEKey = _eKey[1];
  var _settings = s(false), showSettings = _settings[0], setSettings = _settings[1];
  var _jobId = s(null), jobId = _jobId[0], setJobId = _jobId[1];
  var _job = s(null), job = _job[0], setJob = _job[1];
  var _err = s(""), err = _err[0], setErr = _err[1];
  var pollRef = useRef(null);

  // Keyword editor state — Addendum 5
  var _clipKeywords = s({}), clipKeywords = _clipKeywords[0], setClipKeywords = _clipKeywords[1];

  // Template fields
  var _tmpl = s("gameplay_split"), tmpl = _tmpl[0], setTmpl = _tmpl[1];
  var _bgCat = s("gameplay"), bgCat = _bgCat[0], setBgCat = _bgCat[1];
  var _bgClip = s(""), bgClip = _bgClip[0], setBgClip = _bgClip[1];
  var _bgClips = s([]), bgClips = _bgClips[0], setBgClips = _bgClips[1];
  var _splitRatio = s(55), splitRatio = _splitRatio[0], setSplitRatio = _splitRatio[1];
  var _tmplMode = s("shorts"), tmplMode = _tmplMode[0], setTmplMode = _tmplMode[1];
  var _outFmt = s("portrait"), outFmt = _outFmt[0], setOutFmt = _outFmt[1];
  var _uploading = s(false), uploading = _uploading[0], setUploading = _uploading[1];
  var fileInputRef = useRef(null);

  var _tmplEnabled = s(false), tmplEnabled = _tmplEnabled[0], setTmplEnabled = _tmplEnabled[1];

  // Watermark removal — Addendum 3 (frame capture + multi-region canvas)
  var _wmEnabled = s(false), wmEnabled = _wmEnabled[0], setWmEnabled = _wmEnabled[1];
  var _wmStep = s(1), wmStep = _wmStep[0], setWmStep = _wmStep[1];         // 1=capture 2=mark 3=confirm
  var _wmTs = s("00:00:05"), wmTs = _wmTs[0], setWmTs = _wmTs[1];
  var _wmFrame = s(null), wmFrame = _wmFrame[0], setWmFrame = _wmFrame[1]; // {url,frame_width,frame_height,...}
  var _wmRegions = s([]), wmRegions = _wmRegions[0], setWmRegions = _wmRegions[1];
  var _wmCapturing = s(false), wmCapturing = _wmCapturing[0], setWmCapturing = _wmCapturing[1];
  var canvasRef = useRef(null);
  var drawingRef = useRef(false);
  var draftRef = useRef(null);

  // Cut / remove segments — Addendum 6
  var _cutEnabled = s(false), cutEnabled = _cutEnabled[0], setCutEnabled = _cutEnabled[1];
  var _cutSegments = s([]), cutSegments = _cutSegments[0], setCutSegments = _cutSegments[1];
  var _videoDuration = s(0), videoDuration = _videoDuration[0], setVideoDuration = _videoDuration[1];

  // Voice & Audio — Addendum 7
  var _voiceEnabled = s(false), voiceEnabled = _voiceEnabled[0], setVoiceEnabled = _voiceEnabled[1];
  var _voiceMode = s("music"), voiceMode = _voiceMode[0], setVoiceMode = _voiceMode[1];
  var _musicCat = s("gaming"), musicCat = _musicCat[0], setMusicCat = _musicCat[1];
  var _musicVol = s(80), musicVol = _musicVol[0], setMusicVol = _musicVol[1];
  var _origVol = s(20), origVol = _origVol[0], setOrigVol = _origVol[1];
  var _aiVoiceId = s("VR6AewLTigWG4xSOukaG"), aiVoiceId = _aiVoiceId[0], setAiVoiceId = _aiVoiceId[1];
  var _pitchShift = s(false), pitchShift = _pitchShift[0], setPitchShift = _pitchShift[1];
  var _speedAdj = s(false), speedAdj = _speedAdj[0], setSpeedAdj = _speedAdj[1];

  // Local video upload
  var _inputMode = s("youtube"), inputMode = _inputMode[0], setInputMode = _inputMode[1];
  var _uploadedVideoId = s(null), uploadedVideoId = _uploadedVideoId[0], setUploadedVideoId = _uploadedVideoId[1];
  var _uploadedFilename = s(""), uploadedFilename = _uploadedFilename[0], setUploadedFilename = _uploadedFilename[1];
  var _uploadProgress = s(0), uploadProgress = _uploadProgress[0], setUploadProgress = _uploadProgress[1];
  var _uploadingVideo = s(false), uploadingVideo = _uploadingVideo[0], setUploadingVideo = _uploadingVideo[1];
  var uploadVideoRef = useRef(null);

  var cp = PROVIDERS.find(function(p) { return p.id === prov; }) || PROVIDERS[0];
  var currentTmplDef = TEMPLATE_DEFS.find(function(t) { return t.id === tmpl; }) || TEMPLATE_DEFS[0];

  useEffect(function() {
    setLS("cf_prov", prov);
    setKey(getLS("cf_key_" + prov, ""));
    setModel(cp.models[0]);
  }, [prov]);

  useEffect(function() { if (apiKey) setLS("cf_key_" + prov, apiKey); }, [apiKey]);
  useEffect(function() { if (eKey) setLS("cf_ekey", eKey); }, [eKey]);

  // Fetch background clips when category changes
  useEffect(function() {
    if (!tmplEnabled) return;
    fetch(API + "/api/backgrounds/" + bgCat)
      .then(function(r) { return r.json(); })
      .then(function(d) { setBgClips(d.clips || []); setBgClip(""); })
      .catch(function() { setBgClips([]); });
  }, [bgCat, tmplEnabled]);

  useEffect(function() {
    if (!jobId) return;
    pollRef.current = setInterval(function() {
      fetch(API + "/api/job/" + jobId)
        .then(function(r) { return r.json(); })
        .then(function(d) {
          setJob(d);
          if (d.status === "done" || d.status === "error") clearInterval(pollRef.current);
        })
        .catch(function() {});
    }, 2000);
    return function() { clearInterval(pollRef.current); };
  }, [jobId]);

  // Canvas redraw whenever regions or draft change (Step 2)
  useEffect(function() {
    var canvas = canvasRef.current;
    if (!canvas || !wmFrame || wmStep !== 2) return;

    canvas.width = wmFrame.frame_width;
    canvas.height = wmFrame.frame_height;

    var ctx = canvas.getContext("2d");

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      wmRegions.forEach(function(r, i) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = "rgba(239,68,68,0.15)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(r.x, r.y - 18, 20, 18);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px system-ui";
        ctx.fillText(i + 1, r.x + 6, r.y - 4);
      });
      if (draftRef.current) {
        var d = draftRef.current;
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(d.x, d.y, d.w, d.h);
      }
    }

    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    }

    function onDown(e) {
      var p = pos(e);
      draftRef.current = { x: p.x, y: p.y, w: 0, h: 0 };
      drawingRef.current = true;
    }

    function onMove(e) {
      if (!drawingRef.current || !draftRef.current) return;
      var p = pos(e);
      draftRef.current.w = p.x - draftRef.current.x;
      draftRef.current.h = p.y - draftRef.current.y;
      redraw();
    }

    function onUp() {
      if (!drawingRef.current || !draftRef.current) return;
      var d = draftRef.current;
      if (Math.abs(d.w) >= 10 && Math.abs(d.h) >= 10) {
        var norm = {
          x: d.w < 0 ? d.x + d.w : d.x,
          y: d.h < 0 ? d.y + d.h : d.y,
          w: Math.abs(d.w),
          h: Math.abs(d.h),
          method: "blur",
          color: "black",
          id: Date.now(),
        };
        setWmRegions(function(prev) { return prev.concat([norm]); });
      }
      draftRef.current = null;
      drawingRef.current = false;
      redraw();
    }

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    redraw();

    return function() {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
    };
  }, [wmRegions, wmFrame, wmStep]);

  // Initialize keyword state when job completes — Addendum 5
  useEffect(function() {
    if (!job || job.status !== "done" || !job.outputs) return;
    setClipKeywords(function(prev) {
      var kw = {};
      job.outputs.forEach(function(clip, i) {
        kw[i] = prev[i] || {
          primary: clip.primary_keywords || [],
          secondary: clip.secondary_keywords || [],
          hashtags: clip.hashtags || [],
          youtube_tags: clip.youtube_tags || "",
          tiktok_description: clip.tiktok_description || "",
          activeTab: "keywords",
          keywordStyle: "seo",
          regenerating: false,
          addingTo: null,
          addingValue: "",
        };
      });
      return kw;
    });
  }, [job && job.status]);

  function captureFrame() {
    if (inputMode === "upload" && !uploadedVideoId && !jobId) { setErr("Upload a video first"); return; }
    if (inputMode === "youtube" && !url.trim() && !jobId) { setErr("Enter a YouTube URL first"); return; }
    setWmCapturing(true);
    fetch(API + "/api/preview-frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtube_url: inputMode === "youtube" ? (url || null) : null,
        job_id: jobId || (inputMode === "upload" ? uploadedVideoId : null),
        timestamp: wmTs,
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      setWmFrame(d);
      setWmStep(2);
      setWmCapturing(false);
    })
    .catch(function(e) { setErr("Frame capture failed: " + e.message); setWmCapturing(false); });
  }

  function submit() {
    setErr("");
    if (inputMode === "youtube" && !url.trim()) { setErr("Enter a YouTube URL"); return; }
    if (inputMode === "upload" && !uploadedVideoId) { setErr("Please upload a video file first"); return; }
    if (!apiKey && prov !== "ollama") { setErr("Add API key in Settings"); return; }

    setJob({ status: "queued", progress: 0, message: "Submitting..." });
    fetch(API + "/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtube_url: inputMode === "youtube" ? url : null,
        uploaded_video_id: inputMode === "upload" ? uploadedVideoId : null,
        mode: mode,
        provider: prov,
        model: model || cp.models[0],
        api_key: apiKey || null,
        elevenlabs_api_key: eKey || null,
        voice_style: "deep",

        // Template fields — only meaningful when toggle is ON
        template_enabled: tmplEnabled,
        template_id: tmplEnabled ? tmpl : null,
        bg_clip_id: (tmplEnabled && bgClip) ? bgClip : null,
        bg_category: tmplEnabled ? bgCat : null,
        split_ratio: tmplEnabled ? splitRatio / 100 : 0.55,

        output_format: outFmt,

        // Clip settings
        num_shorts: num,
        min_duration: minD,
        max_duration: maxD,

        // Watermark
        watermark_enabled: wmEnabled && wmRegions.length > 0,
        watermark_regions: wmRegions.map(function(r) {
          return { x: r.x, y: r.y, w: r.w, h: r.h, method: r.method, color: r.color };
        }),
        watermark_frame_width: wmFrame ? wmFrame.frame_width : 960,
        watermark_frame_height: wmFrame ? wmFrame.frame_height : 540,

        // Cut segments
        cut_enabled: cutEnabled && cutSegments.length > 0,
        cut_segments: cutSegments.map(function(c) { return { start: c.start, end: c.end }; }),

        // Voice & Audio
        voice_enabled: voiceEnabled,
        voice_mode: voiceEnabled ? voiceMode : null,
        music_category: voiceMode === "music" ? musicCat : null,
        music_volume: musicVol / 100,
        original_volume: origVol / 100,
        ai_voice_id: voiceMode === "ai" ? aiVoiceId : null,
        pitch_shift_enabled: pitchShift,
        speed_adjust_enabled: speedAdj,
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.job_id) setJobId(d.job_id);
      else { setErr(d.detail || "Server error"); setJob(null); }
    })
    .catch(function(e) { setErr(e.message); setJob(null); });
  }

  function reset() {
    setJob(null); setJobId(null); setUrl(""); setErr("");
    clearInterval(pollRef.current);
    setUploadedVideoId(null); setUploadedFilename(""); setUploadProgress(0);
  }

  function handleUpload(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    var fd = new FormData();
    fd.append("file", file);
    fetch(API + "/api/backgrounds/upload?category=" + bgCat, { method: "POST", body: fd })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.id) {
          var newClip = { id: d.id, name: d.name, url: d.url, duration: 0, category: bgCat };
          setBgClips(function(prev) { return prev.concat([newClip]); });
          setBgClip(d.id);
        }
        setUploading(false);
      })
      .catch(function() { setUploading(false); });
  }

  // ── Cut segment helpers — Addendum 6 ──

  function fetchDuration() {
    if (inputMode !== "youtube" || !url.trim()) return;
    fetch(API + "/api/video-duration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtube_url: url })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) { if (d.duration) setVideoDuration(d.duration); })
    .catch(function() {});
  }

  function addCutSegment() {
    setCutSegments(function(prev) {
      return prev.concat([{ id: Date.now(), start: "00:00", end: "00:30" }]);
    });
  }

  function removeCutSegment(id) {
    setCutSegments(function(prev) { return prev.filter(function(c) { return c.id !== id; }); });
  }

  function updateCutSegment(id, field, value) {
    setCutSegments(function(prev) {
      return prev.map(function(c) { return c.id === id ? Object.assign({}, c, { [field]: value }) : c; });
    });
  }

  function parseTs(ts) {
    var parts = String(ts).split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(ts) || 0;
  }

  function formatDur(secs) {
    var s = Math.round(Math.abs(secs));
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    if (h > 0) return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  // ── Local video upload handler ──

  function handleVideoUpload(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    setUploadingVideo(true);
    setUploadProgress(0);
    setErr("");

    var formData = new FormData();
    formData.append("file", file);

    var xhr = new XMLHttpRequest();
    xhr.upload.onprogress = function(ev) {
      if (ev.lengthComputable) {
        setUploadProgress(Math.round(ev.loaded / ev.total * 100));
      }
    };
    xhr.onload = function() {
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        setUploadedVideoId(data.video_id);
        setUploadedFilename(data.filename);
        setUploadProgress(100);
        setUploadingVideo(false);
      } else {
        var msg = "Upload failed";
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch(ex) {}
        setErr(msg);
        setUploadingVideo(false);
      }
    };
    xhr.onerror = function() {
      setErr("Upload failed — check your connection");
      setUploadingVideo(false);
    };
    xhr.open("POST", API + "/api/upload-video");
    xhr.send(formData);
  }

  // ── Keyword helper functions — Addendum 5 ──

  function removeKeyword(clipIdx, group, kwIdx) {
    setClipKeywords(function(prev) {
      var updated = Object.assign({}, prev);
      var clip = Object.assign({}, updated[clipIdx]);
      clip[group] = clip[group].filter(function(_, j) { return j !== kwIdx; });
      clip.youtube_tags = [].concat(clip.primary, clip.secondary).join(", ");
      updated[clipIdx] = clip;
      return updated;
    });
  }

  function addKeyword(clipIdx, group, value) {
    if (!value || !value.trim()) return;
    var val = group === "hashtags" ? (value.startsWith("#") ? value : "#" + value) : value;
    setClipKeywords(function(prev) {
      var updated = Object.assign({}, prev);
      var clip = Object.assign({}, updated[clipIdx]);
      clip[group] = clip[group].concat([val]);
      clip.youtube_tags = [].concat(clip.primary, clip.secondary).join(", ");
      clip.addingTo = null;
      clip.addingValue = "";
      updated[clipIdx] = clip;
      return updated;
    });
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(function() {});
  }

  async function regenerateKeywords(clipIdx) {
    var kwState = clipKeywords[clipIdx] || {};
    var output = job && job.outputs && job.outputs[clipIdx];
    if (!output) return;
    setClipKeywords(function(prev) {
      var u = Object.assign({}, prev);
      u[clipIdx] = Object.assign({}, u[clipIdx], { regenerating: true });
      return u;
    });
    try {
      var res = await fetch(API + "/api/regenerate-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript_excerpt: output.caption || output.title,
          clip_title: output.title,
          style: kwState.keywordStyle || "seo",
          provider: prov,
          model: model || cp.models[0],
          api_key: apiKey,
        }),
      });
      var data = await res.json();
      setClipKeywords(function(prev) {
        var u = Object.assign({}, prev);
        u[clipIdx] = Object.assign({}, u[clipIdx], {
          primary: data.primary_keywords || [],
          secondary: data.secondary_keywords || [],
          hashtags: data.hashtags || [],
          youtube_tags: data.youtube_tags || "",
          tiktok_description: data.tiktok_description || "",
          regenerating: false,
        });
        return u;
      });
    } catch(e) {
      setClipKeywords(function(prev) {
        var u = Object.assign({}, prev);
        u[clipIdx] = Object.assign({}, u[clipIdx], { regenerating: false });
        return u;
      });
    }
  }

  var colors = { queued: "#6366f1", downloading: "#f59e0b", transcribing: "#3b82f6", analyzing: "#8b5cf6", processing: "#ec4899", done: "#10b981", error: "#ef4444" };

  return (
    React.createElement("div", { style: { minHeight: "100vh", background: "#0a0b14", color: "#e2e8f0", fontFamily: "system-ui,sans-serif" } },

      // Header
      React.createElement("header", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid #1e293b" } },
        React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: "#a78bfa", cursor: "pointer" }, onClick: reset }, "⚡ ClipForge"),
        React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
          React.createElement("span", { style: { fontSize: 12, background: cp.color + "22", color: cp.color, padding: "4px 10px", borderRadius: 12, fontWeight: 600 } }, cp.name),
          React.createElement("button", { onClick: function() { setSettings(!showSettings); }, style: btn("#1e293b") }, "⚙️ Settings")
        )
      ),

      // Settings panel
      showSettings && React.createElement("div", { style: { margin: "0 32px", padding: 24, background: "#111827", border: "1px solid #1e293b", borderRadius: 12 } },
        React.createElement("h3", { style: { margin: "0 0 16px", fontSize: 16 } }, "Settings"),

        React.createElement("p", { style: lbl }, "AI Provider"),
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" } },
          PROVIDERS.map(function(p) {
            return React.createElement("button", {
              key: p.id,
              onClick: function() { setProv(p.id); },
              style: Object.assign({}, btn(prov === p.id ? p.color + "33" : "#1e293b"), { border: prov === p.id ? "1px solid " + p.color : "1px solid #374151" })
            }, p.name + " " + p.tag);
          })
        ),

        React.createElement("p", { style: lbl }, "Model"),
        React.createElement("select", { value: model || cp.models[0], onChange: function(e) { setModel(e.target.value); }, style: inp },
          cp.models.map(function(m) { return React.createElement("option", { key: m, value: m }, m); })
        ),

        prov !== "ollama" && React.createElement("div", null,
          React.createElement("p", { style: lbl }, cp.name + " API Key ",
            React.createElement("a", { href: cp.url, target: "_blank", style: { color: "#6366f1", fontSize: 12 } }, "Get key →")
          ),
          React.createElement("input", { type: "password", placeholder: cp.hint, value: apiKey, onChange: function(e) { setKey(e.target.value); }, style: inp })
        ),

        React.createElement("p", { style: lbl }, "ElevenLabs Key (optional, for AI voice)"),
        React.createElement("input", { type: "password", placeholder: "optional", value: eKey, onChange: function(e) { setEKey(e.target.value); }, style: inp }),

        React.createElement("button", { onClick: function() { setSettings(false); }, style: Object.assign({}, btn("#6366f1"), { color: "#fff", fontWeight: 700 }) }, "Save & Close")
      ),

      // Main content
      React.createElement("main", { style: { maxWidth: 860, margin: "0 auto", padding: "40px 24px" } },

        // Hero
        React.createElement("div", { style: { textAlign: "center", marginBottom: 40 } },
          React.createElement("p", { style: { color: "#6366f1", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 } }, "YouTube → Shorts Pipeline"),
          React.createElement("h1", { style: { fontSize: 48, fontWeight: 800, lineHeight: 1.1, margin: "0 0 16px", color: "#f1f5f9" } }, "Paste a URL. Get Shorts."),
          React.createElement("p", { style: { color: "#64748b", fontSize: 16 } }, "AI downloads, transcribes, finds best moments, and cuts your Shorts.")
        ),

        // Form
        !job && React.createElement("div", null,
          // URL / Upload + submit
          React.createElement("div", { style: Object.assign({}, card, { marginBottom: 16 }) },

            // Input mode toggle
            React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } },
              React.createElement("button", {
                onClick: function() { setInputMode("youtube"); },
                style: Object.assign({}, btn(inputMode === "youtube" ? "#6366f133" : "#0f172a"), {
                  border: inputMode === "youtube" ? "1px solid #6366f1" : "1px solid #374151",
                  flex: 1, fontWeight: inputMode === "youtube" ? 700 : 400,
                  color: inputMode === "youtube" ? "#a78bfa" : "#64748b"
                })
              }, "🔗 YouTube URL"),
              React.createElement("button", {
                onClick: function() { setInputMode("upload"); },
                style: Object.assign({}, btn(inputMode === "upload" ? "#6366f133" : "#0f172a"), {
                  border: inputMode === "upload" ? "1px solid #6366f1" : "1px solid #374151",
                  flex: 1, fontWeight: inputMode === "upload" ? 700 : 400,
                  color: inputMode === "upload" ? "#a78bfa" : "#64748b"
                })
              }, "📁 Upload Video")
            ),

            // YouTube URL input
            inputMode === "youtube" && React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 20 } },
              React.createElement("input", { placeholder: "https://youtube.com/watch?v=...", value: url, onChange: function(e) { setUrl(e.target.value); }, onKeyDown: function(e) { if (e.key === "Enter") { fetchDuration(); submit(); } }, onBlur: fetchDuration, style: Object.assign({}, inp, { flex: 1, marginBottom: 0 }) }),
              React.createElement("button", { onClick: submit, style: Object.assign({}, btn("#6366f1"), { color: "#fff", fontWeight: 700, padding: "12px 24px" }) }, "Process →")
            ),

            // Upload drop zone
            inputMode === "upload" && React.createElement("div", { style: { marginBottom: 20 } },
              React.createElement("div", {
                onClick: function() { uploadVideoRef.current && uploadVideoRef.current.click(); },
                style: {
                  border: uploadedVideoId ? "2px solid #10b981" : "2px dashed #374151",
                  borderRadius: 10, padding: "24px 16px", textAlign: "center",
                  cursor: "pointer", background: uploadedVideoId ? "#10b98111" : "#0f172a",
                  marginBottom: 10, transition: "all .2s"
                }
              },
                uploadingVideo
                  ? React.createElement("div", null,
                      React.createElement("p", { style: { color: "#94a3b8", margin: "0 0 8px", fontSize: 14 } }, "⏳ Uploading..."),
                      React.createElement("div", { style: { background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden" } },
                        React.createElement("div", { style: { width: uploadProgress + "%", height: "100%", background: "#6366f1", borderRadius: 4, transition: "width .3s" } })
                      ),
                      React.createElement("p", { style: { color: "#475569", fontSize: 12, marginTop: 6 } }, uploadProgress + "% uploaded")
                    )
                  : uploadedVideoId
                    ? React.createElement("div", null,
                        React.createElement("p", { style: { fontSize: 20, margin: "0 0 6px" } }, "✅"),
                        React.createElement("p", { style: { color: "#10b981", fontWeight: 700, margin: "0 0 4px", fontSize: 14 } }, uploadedFilename),
                        React.createElement("p", { style: { color: "#475569", fontSize: 12 } }, "Click to replace")
                      )
                    : React.createElement("div", null,
                        React.createElement("p", { style: { fontSize: 28, margin: "0 0 8px" } }, "📁"),
                        React.createElement("p", { style: { color: "#94a3b8", margin: "0 0 4px", fontSize: 14, fontWeight: 600 } }, "Click to upload video"),
                        React.createElement("p", { style: { color: "#475569", fontSize: 12 } }, "MP4, MOV, WebM, AVI, MKV · Max 2GB")
                      )
              ),
              React.createElement("input", {
                ref: uploadVideoRef,
                type: "file",
                accept: ".mp4,.mov,.webm,.avi,.mkv",
                style: { display: "none" },
                onChange: handleVideoUpload
              }),
              uploadedVideoId && React.createElement("button", {
                onClick: submit,
                style: Object.assign({}, btn("#6366f1"), { color: "#fff", fontWeight: 700, width: "100%", padding: "12px" })
              }, "Process →")
            ),

            err && React.createElement("div", { style: { background: "#7f1d1d33", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 } }, "⚠️ " + err),

            outFmt === "landscape" && React.createElement("div", { style: { background: "#1c1917", border: "1px solid #78350f", borderRadius: 8, padding: "10px 14px", color: "#fcd34d", fontSize: 13, marginBottom: 16 } },
              "⏳ Full video processing takes 5-15 minutes depending on length."
            ),

            !apiKey && prov !== "ollama" && React.createElement("div", { style: { background: "#78350f33", border: "1px solid #f59e0b55", borderRadius: 8, padding: "10px 14px", color: "#fcd34d", fontSize: 13, marginBottom: 16 } },
              "No " + cp.name + " key. ",
              React.createElement("button", { onClick: function() { setSettings(true); }, style: { background: "none", border: "none", color: "#fbbf24", cursor: "pointer", textDecoration: "underline", fontSize: 13, padding: 0 } }, "Open Settings →")
            )
          ),

          // ── Output Format Selector ──
          React.createElement("div", { style: card },
            React.createElement("p", { style: lbl }, "Output Format"),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 } },

              // Portrait card
              React.createElement("div", {
                onClick: function() { setOutFmt("portrait"); },
                style: {
                  cursor: "pointer", borderRadius: 12, padding: "16px 14px",
                  background: outFmt === "portrait" ? "#6366f115" : "#0f172a",
                  border: outFmt === "portrait" ? "2px solid #6366f1" : "2px solid #1e293b",
                }
              },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } },
                  React.createElement("span", { style: { fontSize: 24 } }, "📱"),
                  React.createElement("div", null,
                    React.createElement("p", { style: { margin: 0, fontWeight: 700, fontSize: 14, color: outFmt === "portrait" ? "#a5b4fc" : "#e2e8f0" } }, "Shorts / Reels"),
                    React.createElement("p", { style: { margin: 0, fontSize: 11, color: "#64748b", fontFamily: "monospace" } }, "1080 × 1920 · 9:16")
                  )
                ),
                React.createElement("p", { style: { margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.5 } }, "AI finds best moments and cuts them into portrait clips"),
                React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
                  ["YouTube Shorts", "TikTok", "Instagram Reels"].map(function(p) {
                    return React.createElement("span", { key: p, style: { fontSize: 10, background: "#1e293b", border: "1px solid #374151", borderRadius: 4, padding: "2px 6px", color: "#64748b" } }, p);
                  })
                ),
                React.createElement("div", { style: { marginTop: 12, display: "flex", justifyContent: "center" } },
                  React.createElement("div", { style: { width: 36, height: 64, borderRadius: 6, border: "2px solid " + (outFmt === "portrait" ? "#6366f1" : "#374151"), overflow: "hidden", background: "#0a0b14" } },
                    React.createElement("div", { style: { height: "55%", background: "#6366f133", borderBottom: "1px solid #6366f144", display: "flex", alignItems: "center", justifyContent: "center" } },
                      React.createElement("span", { style: { fontSize: 7, color: "#a5b4fc" } }, "You")
                    ),
                    React.createElement("div", { style: { height: "45%", background: "#f59e0b22", display: "flex", alignItems: "center", justifyContent: "center" } },
                      React.createElement("span", { style: { fontSize: 7, color: "#fcd34d" } }, "BG")
                    )
                  )
                )
              ),

              // Landscape card
              React.createElement("div", {
                onClick: function() { setOutFmt("landscape"); },
                style: {
                  cursor: "pointer", borderRadius: 12, padding: "16px 14px",
                  background: outFmt === "landscape" ? "#10b98112" : "#0f172a",
                  border: outFmt === "landscape" ? "2px solid #10b981" : "2px solid #1e293b",
                }
              },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } },
                  React.createElement("span", { style: { fontSize: 24 } }, "🖥️"),
                  React.createElement("div", null,
                    React.createElement("p", { style: { margin: 0, fontWeight: 700, fontSize: 14, color: outFmt === "landscape" ? "#6ee7b7" : "#e2e8f0" } }, "Full Video"),
                    React.createElement("p", { style: { margin: 0, fontSize: 11, color: "#64748b", fontFamily: "monospace" } }, "1920 × 1080 · 16:9")
                  )
                ),
                React.createElement("p", { style: { margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.5 } }, "Entire video templated as one landscape output — no cutting"),
                React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
                  ["YouTube", "Facebook", "Twitter/X"].map(function(p) {
                    return React.createElement("span", { key: p, style: { fontSize: 10, background: "#1e293b", border: "1px solid #374151", borderRadius: 4, padding: "2px 6px", color: "#64748b" } }, p);
                  })
                ),
                React.createElement("div", { style: { marginTop: 12, display: "flex", justifyContent: "center" } },
                  React.createElement("div", { style: { width: 64, height: 36, borderRadius: 6, border: "2px solid " + (outFmt === "landscape" ? "#10b981" : "#374151"), overflow: "hidden", background: "#0a0b14" } },
                    React.createElement("div", { style: { height: "55%", background: "#10b98122", borderBottom: "1px solid #10b98144", display: "flex", alignItems: "center", justifyContent: "center" } },
                      React.createElement("span", { style: { fontSize: 7, color: "#6ee7b7" } }, "You")
                    ),
                    React.createElement("div", { style: { height: "45%", background: "#f59e0b22", display: "flex", alignItems: "center", justifyContent: "center" } },
                      React.createElement("span", { style: { fontSize: 7, color: "#fcd34d" } }, "BG")
                    )
                  )
                )
              )
            ),

            // Info banner (F6)
            outFmt === "portrait"
              ? React.createElement("div", { style: { background: "#6366f115", border: "1px solid #6366f133", borderRadius: 8, padding: "10px 14px", color: "#a5b4fc", fontSize: 13 } },
                  "📱 AI will find the best 3–5 moments and cut them into portrait Shorts. Processing takes 3–8 minutes."
                )
              : React.createElement("div", { style: { background: "#10b98112", border: "1px solid #10b98133", borderRadius: 8, padding: "10px 14px", color: "#6ee7b7", fontSize: 13 } },
                  "🖥️ The full video will be processed as one 1920×1080 landscape output. No AI cutting. Processing takes 5–15 minutes depending on video length."
                )
          )
        ),

        // ── Cut / Remove Segments card (Addendum 6) ──
        !job && React.createElement("div", { style: card },
          React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            React.createElement("div", null,
              React.createElement("p", { style: Object.assign({}, lbl, { marginBottom: 2 }) }, "✂️ Cut / Remove Segments"),
              React.createElement("p", { style: { margin: 0, fontSize: 12, color: "#475569" } },
                cutEnabled ? "Define time ranges to remove from the video" : "Toggle on to remove sections from the video"
              )
            ),
            React.createElement("div", {
              onClick: function() { setCutEnabled(!cutEnabled); },
              style: { width: 44, height: 24, borderRadius: 12, cursor: "pointer",
                       background: cutEnabled ? "#6366f1" : "#374151",
                       position: "relative", transition: "background 0.2s", flexShrink: 0 }
            },
              React.createElement("div", {
                style: { position: "absolute", top: 3,
                         left: cutEnabled ? 23 : 3,
                         width: 18, height: 18, borderRadius: "50%",
                         background: "#fff", transition: "left 0.2s" }
              })
            )
          ),

          cutEnabled && React.createElement("div", { style: { marginTop: 16 } },

            // Timeline bar
            React.createElement("div", { style: { marginBottom: 16 } },
              React.createElement("p", { style: Object.assign({}, lbl, { marginBottom: 8 }) }, "Timeline preview"),
              React.createElement("div", { style: { position: "relative", height: 40, background: "#0f172a",
                                                     border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden" } },
                (function() {
                  if (!videoDuration || cutSegments.length === 0) {
                    return React.createElement("div", { style: { height: "100%", background: "#6366f122",
                                                                  borderLeft: "2px solid #6366f155",
                                                                  borderRight: "2px solid #6366f155" } });
                  }
                  var dur = videoDuration;
                  var cuts = cutSegments.map(function(c) {
                    return { start: parseTs(c.start) / dur * 100, end: parseTs(c.end) / dur * 100 };
                  }).sort(function(a, b) { return a.start - b.start; });
                  var blocks = [];
                  var prev = 0;
                  cuts.forEach(function(c, i) {
                    if (c.start > prev) {
                      blocks.push(React.createElement("div", { key: "k" + i, style: { position: "absolute", left: prev + "%", width: (c.start - prev) + "%", top: 0, bottom: 0, background: "#6366f122", borderRight: "2px solid #6366f155" } }));
                    }
                    blocks.push(React.createElement("div", { key: "c" + i, style: { position: "absolute", left: c.start + "%", width: (c.end - c.start) + "%", top: 0, bottom: 0, background: "#ef444422", borderLeft: "2px solid #ef4444", borderRight: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center" } },
                      React.createElement("span", { style: { fontSize: 9, color: "#ef4444", fontWeight: 700 } }, "✂ " + (i + 1))
                    ));
                    prev = c.end;
                  });
                  if (prev < 100) {
                    blocks.push(React.createElement("div", { key: "klast", style: { position: "absolute", left: prev + "%", width: (100 - prev) + "%", top: 0, bottom: 0, background: "#6366f122", borderLeft: "2px solid #6366f155" } }));
                  }
                  return blocks;
                })()
              ),
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569", marginTop: 4 } },
                React.createElement("span", null, "0:00"),
                React.createElement("span", null, videoDuration ? formatDur(videoDuration) : "--:--")
              )
            ),

            // Cut rows
            cutSegments.map(function(seg, i) {
              var cutDur = parseTs(seg.end) - parseTs(seg.start);
              return React.createElement("div", { key: seg.id,
                style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                         background: "#0f172a", border: "1px solid #1e293b",
                         borderRadius: 8, marginBottom: 6 } },
                React.createElement("div", { style: { width: 20, height: 20, borderRadius: "50%",
                                                       background: "#ef444422", border: "1px solid #ef444444",
                                                       color: "#ef4444", fontSize: 10, fontWeight: 700,
                                                       display: "flex", alignItems: "center", justifyContent: "center",
                                                       flexShrink: 0 } }, i + 1),
                React.createElement("span", { style: { fontSize: 12, color: "#64748b" } }, "Remove from"),
                React.createElement("input", {
                  value: seg.start,
                  onChange: function(e) { updateCutSegment(seg.id, "start", e.target.value); },
                  placeholder: "00:00",
                  style: { background: "#0d1117", border: "1px solid #374151", borderRadius: 6,
                           padding: "5px 8px", color: "#e2e8f0", fontSize: 12,
                           fontFamily: "monospace", width: 72, outline: "none", textAlign: "center" }
                }),
                React.createElement("span", { style: { fontSize: 12, color: "#64748b" } }, "to"),
                React.createElement("input", {
                  value: seg.end,
                  onChange: function(e) { updateCutSegment(seg.id, "end", e.target.value); },
                  placeholder: "00:30",
                  style: { background: "#0d1117", border: "1px solid #374151", borderRadius: 6,
                           padding: "5px 8px", color: "#e2e8f0", fontSize: 12,
                           fontFamily: "monospace", width: 72, outline: "none", textAlign: "center" }
                }),
                React.createElement("button", {
                  onClick: function() {
                    updateCutSegment(seg.id, "end", "99:99");
                  },
                  style: { padding: "4px 8px", background: "#0f172a",
                           border: "1px solid #374151", borderRadius: 6,
                           color: "#475569", fontSize: 11, cursor: "pointer" }
                }, "→ End"),
                cutDur > 0 && React.createElement("span", { style: { fontSize: 11, color: "#ef4444",
                                                                       background: "#ef444411",
                                                                       borderRadius: 4, padding: "2px 7px",
                                                                       fontWeight: 600 } }, "-" + formatDur(cutDur)),
                React.createElement("button", {
                  onClick: function() { removeCutSegment(seg.id); },
                  style: { padding: "4px 8px", background: "#7f1d1d22", border: "1px solid #7f1d1d",
                           borderRadius: 6, color: "#ef4444", fontSize: 11, cursor: "pointer" }
                }, "× Remove")
              );
            }),

            // Add cut button
            React.createElement("button", {
              onClick: addCutSegment,
              style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                       padding: "9px 16px", background: "transparent",
                       border: "1px dashed #374151", borderRadius: 8,
                       color: "#475569", fontSize: 12, cursor: "pointer", width: "100%",
                       marginBottom: 12 }
            }, "✂️ + Add another cut"),

            // Summary row
            (function() {
              var totalCut = cutSegments.reduce(function(sum, seg) {
                return sum + Math.max(0, parseTs(seg.end) - parseTs(seg.start));
              }, 0);
              var finalDur = Math.max(0, (videoDuration || 0) - totalCut);
              return React.createElement("div", { style: { background: "#0f172a", border: "1px solid #1e293b",
                                                             borderRadius: 8, padding: "12px 16px",
                                                             display: "flex", gap: 16, alignItems: "center",
                                                             justifyContent: "center" } },
                React.createElement("div", { style: { textAlign: "center" } },
                  React.createElement("div", { style: { fontSize: 18, fontWeight: 700, color: "#e2e8f0" } },
                    videoDuration ? formatDur(videoDuration) : "--:--"),
                  React.createElement("div", { style: { fontSize: 10, color: "#475569", marginTop: 2 } }, "Original")
                ),
                React.createElement("span", { style: { color: "#475569", fontSize: 16 } }, "→"),
                React.createElement("div", { style: { textAlign: "center" } },
                  React.createElement("div", { style: { fontSize: 18, fontWeight: 700, color: "#ef4444" } },
                    totalCut > 0 ? "-" + formatDur(totalCut) : "0:00"),
                  React.createElement("div", { style: { fontSize: 10, color: "#475569", marginTop: 2 } }, "Removed")
                ),
                React.createElement("span", { style: { color: "#475569", fontSize: 16 } }, "="),
                React.createElement("div", { style: { textAlign: "center" } },
                  React.createElement("div", { style: { fontSize: 18, fontWeight: 700, color: "#10b981" } },
                    finalDur > 0 ? formatDur(finalDur) : "--:--"),
                  React.createElement("div", { style: { fontSize: 10, color: "#475569", marginTop: 2 } }, "Final")
                )
              );
            })()
          )
        ),

        // ── Voice & Audio card (Addendum 7) ──
        !job && React.createElement("div", { style: card },
          // Header + toggle
          React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: voiceEnabled ? 20 : 0 } },
            React.createElement("div", null,
              React.createElement("p", { style: Object.assign({}, lbl, { marginBottom: 2 }) }, "🎵 Voice & Audio"),
              React.createElement("p", { style: { margin: 0, fontSize: 12, color: "#475569" } },
                voiceEnabled ? "Remove voice, add music, or replace with AI voice" : "Toggle on to modify audio"
              )
            ),
            React.createElement("div", {
              onClick: function() { setVoiceEnabled(!voiceEnabled); },
              style: { width: 44, height: 24, borderRadius: 12, cursor: "pointer",
                       background: voiceEnabled ? "#6366f1" : "#374151",
                       position: "relative", transition: "background 0.2s", flexShrink: 0 }
            },
              React.createElement("div", { style: { position: "absolute", top: 3,
                       left: voiceEnabled ? 23 : 3,
                       width: 18, height: 18, borderRadius: "50%",
                       background: "#fff", transition: "left 0.2s" } })
            )
          ),

          voiceEnabled && React.createElement("div", null,

            // Mode picker: 3 option cards
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 } },
              [
                { id: "remove", icon: "🔇", label: "Remove Voice", desc: "Strip vocals, keep background" },
                { id: "music", icon: "🎵", label: "Add Music", desc: "Mix royalty-free music track" },
                { id: "ai", icon: "🤖", label: "AI Voice", desc: "Replace with ElevenLabs TTS" },
              ].map(function(opt) {
                var sel = voiceMode === opt.id;
                return React.createElement("div", {
                  key: opt.id,
                  onClick: function() { setVoiceMode(opt.id); },
                  style: { cursor: "pointer", borderRadius: 10, padding: "12px 10px",
                           background: sel ? "#6366f115" : "#0f172a",
                           border: sel ? "2px solid #6366f1" : "2px solid #1e293b",
                           textAlign: "center" }
                },
                  React.createElement("div", { style: { fontSize: 22, marginBottom: 6 } }, opt.icon),
                  React.createElement("p", { style: { margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: sel ? "#a5b4fc" : "#e2e8f0" } }, opt.label),
                  React.createElement("p", { style: { margin: 0, fontSize: 10, color: "#475569", lineHeight: 1.4 } }, opt.desc)
                );
              })
            ),

            // Remove Voice: just an info note
            voiceMode === "remove" && React.createElement("div", { style: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "12px 14px", color: "#94a3b8", fontSize: 13 } },
              "ℹ️ Vocals will be stripped using center-channel cancellation. Background sounds and music are kept."
            ),

            // Add Music: category pills + volume sliders
            voiceMode === "music" && React.createElement("div", null,
              React.createElement("p", { style: lbl }, "Music Category"),
              React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 } },
                MUSIC_CATEGORIES.map(function(cat) {
                  var sel = musicCat === cat.id;
                  return React.createElement("button", {
                    key: cat.id,
                    onClick: function() { setMusicCat(cat.id); },
                    style: Object.assign({}, btn(sel ? "#6366f133" : "#0f172a"), {
                      border: sel ? "1px solid #6366f1" : "1px solid #374151",
                      fontSize: 12, color: sel ? "#a5b4fc" : "#64748b"
                    })
                  }, cat.label);
                })
              ),
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
                React.createElement("div", null,
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
                    React.createElement("p", { style: lbl }, "Original audio"),
                    React.createElement("span", { style: { fontSize: 12, color: "#6366f1", fontWeight: 700 } }, origVol + "%")
                  ),
                  React.createElement("input", { type: "range", min: 0, max: 100, value: origVol,
                    onChange: function(e) { setOrigVol(+e.target.value); }, style: slider })
                ),
                React.createElement("div", null,
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
                    React.createElement("p", { style: lbl }, "Music volume"),
                    React.createElement("span", { style: { fontSize: 12, color: "#6366f1", fontWeight: 700 } }, musicVol + "%")
                  ),
                  React.createElement("input", { type: "range", min: 0, max: 100, value: musicVol,
                    onChange: function(e) { setMusicVol(+e.target.value); }, style: slider })
                )
              )
            ),

            // AI Voice: voice picker + ElevenLabs warning
            voiceMode === "ai" && React.createElement("div", null,
              React.createElement("p", { style: lbl }, "AI Voice"),
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 } },
                AI_VOICES.map(function(v) {
                  var sel = aiVoiceId === v.id;
                  return React.createElement("div", {
                    key: v.id,
                    onClick: function() { setAiVoiceId(v.id); },
                    style: { cursor: "pointer", borderRadius: 8, padding: "10px 12px",
                             background: sel ? v.color + "22" : "#0f172a",
                             border: sel ? "2px solid " + v.color : "2px solid #1e293b",
                             display: "flex", alignItems: "center", gap: 10 }
                  },
                    React.createElement("span", { style: { fontSize: 20 } }, v.icon),
                    React.createElement("div", null,
                      React.createElement("p", { style: { margin: 0, fontSize: 12, fontWeight: 700, color: sel ? v.color : "#e2e8f0" } }, v.name),
                      React.createElement("p", { style: { margin: 0, fontSize: 10, color: "#64748b" } }, v.style)
                    )
                  );
                })
              ),
              !eKey && React.createElement("div", { style: { background: "#78350f33", border: "1px solid #f59e0b55", borderRadius: 8, padding: "10px 14px", color: "#fcd34d", fontSize: 12 } },
                "⚠️ Requires ElevenLabs API key. ",
                React.createElement("button", { onClick: function() { setSettings(true); }, style: { background: "none", border: "none", color: "#fbbf24", cursor: "pointer", textDecoration: "underline", fontSize: 12, padding: 0 } }, "Add in Settings →")
              )
            ),

            // Fingerprint avoidance options
            React.createElement("div", { style: { marginTop: 16, padding: "12px 14px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 } },
              React.createElement("p", { style: Object.assign({}, lbl, { marginBottom: 10 }) }, "Fingerprint Avoidance"),
              [
                { state: pitchShift, setter: setPitchShift, label: "Pitch shift audio (+2 semitones)", desc: "Breaks audio fingerprinting. Imperceptible to listeners." },
                { state: speedAdj, setter: setSpeedAdj, label: "Speed adjust (1.02×)", desc: "Breaks video fingerprinting. 2% faster than original." },
              ].map(function(opt, i) {
                return React.createElement("div", { key: i,
                  onClick: function() { opt.setter(!opt.state); },
                  style: { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                           marginBottom: i === 0 ? 10 : 0 }
                },
                  React.createElement("div", { style: {
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    background: opt.state ? "#6366f1" : "transparent",
                    border: opt.state ? "2px solid #6366f1" : "2px solid #374151",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  } },
                    opt.state && React.createElement("span", { style: { fontSize: 10, color: "#fff", lineHeight: 1 } }, "✓")
                  ),
                  React.createElement("div", null,
                    React.createElement("p", { style: { margin: 0, fontSize: 12, color: opt.state ? "#e2e8f0" : "#94a3b8", fontWeight: opt.state ? 600 : 400 } }, opt.label),
                    React.createElement("p", { style: { margin: 0, fontSize: 11, color: "#475569" } }, opt.desc)
                  )
                );
              })
            )
          )
        ),

        // ── Watermark removal — 3-step flow ──
        !job && React.createElement("div", { style: card },
            // Header row: title + toggle
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: wmEnabled ? 20 : 0 } },
              React.createElement("div", null,
                React.createElement("p", { style: Object.assign({}, lbl, { marginBottom: 2 }) }, "🎯 Remove Watermarks / Logos"),
                React.createElement("p", { style: { margin: 0, fontSize: 12, color: "#475569" } }, "Frame capture + draw regions · multi-logo support")
              ),
              React.createElement("div", {
                onClick: function() { setWmEnabled(!wmEnabled); if (wmEnabled) { setWmStep(1); setWmFrame(null); setWmRegions([]); } },
                style: { width: 44, height: 24, borderRadius: 12, cursor: "pointer", background: wmEnabled ? "#6366f1" : "#374151", position: "relative", transition: "background 0.2s", flexShrink: 0 }
              },
                React.createElement("div", { style: { position: "absolute", top: 3, left: wmEnabled ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" } })
              )
            ),

            wmEnabled && React.createElement("div", null,

              // Step indicator
              React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } },
                ["1 Capture", "2 Mark", "3 Confirm"].map(function(label, i) {
                  var active = wmStep === i + 1;
                  return React.createElement("div", { key: i, style: { flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: active ? "#6366f122" : "#0f172a", color: active ? "#a5b4fc" : "#475569", border: active ? "1px solid #6366f1" : "1px solid #1e293b" } }, label);
                })
              ),

              // ── STEP 1: Capture frame ──
              wmStep === 1 && React.createElement("div", null,
                React.createElement("p", { style: { margin: "0 0 8px", fontSize: 13, color: "#94a3b8" } }, "Enter a timestamp where the watermark is visible, then capture."),
                React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } },
                  React.createElement("input", { value: wmTs, onChange: function(e) { setWmTs(e.target.value); }, placeholder: "00:00:05", style: Object.assign({}, inp, { flex: 1, marginBottom: 0 }) }),
                  React.createElement("button", {
                    onClick: captureFrame,
                    disabled: wmCapturing,
                    style: Object.assign({}, btn("#6366f1"), { color: "#fff", fontWeight: 700, opacity: wmCapturing ? 0.6 : 1 })
                  }, wmCapturing ? "⏳ Loading..." : "📸 Capture")
                ),
                React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 } },
                  [["2s", "2"], ["10s", "10"], ["1min", "60"], ["5min", "300"], ["10min", "600"]].map(function(p) {
                    return React.createElement("button", { key: p[0], onClick: function() { setWmTs(p[1]); }, style: Object.assign({}, btn("#0f172a"), { fontSize: 11, padding: "4px 10px" }) }, p[0]);
                  })
                ),
                React.createElement("div", { style: { background: "#0f172a", borderRadius: 10, height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 13 } },
                  "🎬 Enter timestamp and click Capture · Logos appear at 2–5s"
                )
              ),

              // ── STEP 2: Mark regions ──
              wmStep === 2 && wmFrame && React.createElement("div", null,
                React.createElement("p", { style: { margin: "0 0 8px", fontSize: 13, color: "#94a3b8" } }, "Click and drag to draw a box over each logo. Draw as many as needed."),
                // Frame + canvas overlay
                React.createElement("div", { style: { position: "relative", marginBottom: 12, borderRadius: 8, overflow: "hidden", cursor: "crosshair" } },
                  React.createElement("img", { src: API + wmFrame.frame_url, style: { width: "100%", display: "block" }, draggable: false }),
                  React.createElement("canvas", { ref: canvasRef, style: { position: "absolute", inset: 0, width: "100%", height: "100%" } })
                ),
                // Region list
                wmRegions.length > 0 && React.createElement("div", { style: { marginBottom: 12 } },
                  React.createElement("p", { style: lbl }, "Marked regions"),
                  wmRegions.map(function(r, i) {
                    return React.createElement("div", { key: r.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#0f172a", borderRadius: 8, marginBottom: 6 } },
                      React.createElement("span", { style: { background: "#ef4444", color: "#fff", borderRadius: 4, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 } }, i + 1),
                      React.createElement("span", { style: { fontSize: 12, color: "#94a3b8", flex: 1 } }, "x:" + Math.round(r.x) + " y:" + Math.round(r.y) + " · " + Math.round(r.w) + "×" + Math.round(r.h) + "px"),
                      React.createElement("select", {
                        value: r.method,
                        onChange: function(e) { var v = e.target.value; setWmRegions(function(prev) { return prev.map(function(x, j) { return j === i ? Object.assign({}, x, {method: v}) : x; }); }); },
                        style: { background: "#1e293b", border: "1px solid #374151", borderRadius: 6, color: "#e2e8f0", fontSize: 12, padding: "2px 4px" }
                      },
                        React.createElement("option", { value: "blur" }, "🌀 Blur"),
                        React.createElement("option", { value: "black" }, "⬛ Black"),
                        React.createElement("option", { value: "color" }, "🎨 Color")
                      ),
                      r.method === "color" && React.createElement("input", { type: "color", value: r.color || "#000000", onChange: function(e) { var v = e.target.value; setWmRegions(function(prev) { return prev.map(function(x, j) { return j === i ? Object.assign({}, x, {color: v}) : x; }); }); }, style: { width: 28, height: 28, padding: 2, border: "1px solid #374151", borderRadius: 4, background: "none", cursor: "pointer" } }),
                      React.createElement("button", {
                        onClick: function() { setWmRegions(function(prev) { return prev.filter(function(_, j) { return j !== i; }); }); },
                        style: Object.assign({}, btn("#7f1d1d33"), { color: "#ef4444", fontSize: 12, padding: "4px 8px", border: "1px solid #7f1d1d" })
                      }, "× Remove")
                    );
                  })
                ),
                React.createElement("div", { style: { display: "flex", gap: 8 } },
                  React.createElement("button", { onClick: function() { setWmStep(1); }, style: btn("#1e293b") }, "← Recapture"),
                  React.createElement("button", {
                    onClick: function() { setWmStep(3); },
                    disabled: wmRegions.length === 0,
                    style: Object.assign({}, btn("#6366f1"), { color: "#fff", fontWeight: 700, flex: 1, opacity: wmRegions.length === 0 ? 0.5 : 1 })
                  }, wmRegions.length === 0 ? "Draw at least one region →" : "Confirm " + wmRegions.length + " region" + (wmRegions.length > 1 ? "s" : "") + " →")
                )
              ),

              // ── STEP 3: Confirm ──
              wmStep === 3 && React.createElement("div", null,
                React.createElement("div", { style: { background: "#0a2e0a", border: "1px solid #10b981", borderRadius: 8, padding: "10px 14px", color: "#6ee7b7", fontSize: 13, marginBottom: 12 } },
                  "✓ " + wmRegions.length + " watermark region" + (wmRegions.length > 1 ? "s" : "") + " will be removed from every output clip."
                ),
                wmFrame && React.createElement("div", { style: { position: "relative", marginBottom: 12, borderRadius: 8, overflow: "hidden" } },
                  React.createElement("img", { src: API + wmFrame.frame_url, style: { width: "100%", display: "block" } }),
                  wmRegions.map(function(r, i) {
                    var fw = wmFrame.frame_width, fh = wmFrame.frame_height;
                    return React.createElement("div", { key: r.id, style: { position: "absolute", left: (r.x / fw * 100) + "%", top: (r.y / fh * 100) + "%", width: (r.w / fw * 100) + "%", height: (r.h / fh * 100) + "%", border: "2px solid #ef4444", background: "rgba(239,68,68,0.2)" } },
                      React.createElement("span", { style: { position: "absolute", top: 0, left: 0, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, padding: "0 4px" } }, i + 1)
                    );
                  })
                ),
                wmRegions.map(function(r, i) {
                  return React.createElement("p", { key: r.id, style: { margin: "0 0 4px", fontSize: 13, color: "#94a3b8" } },
                    "Region " + (i + 1) + " — " + (r.method === "blur" ? "Blur" : r.method === "black" ? "Black box" : "Color " + r.color)
                  );
                }),
                React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
                  React.createElement("button", { onClick: function() { setWmStep(2); }, style: btn("#1e293b") }, "← Edit regions"),
                  React.createElement("p", { style: { margin: 0, flex: 1, fontSize: 12, color: "#475569", alignSelf: "center" } }, "Regions apply to all clips. Click Process → when ready.")
                )
              )
            )
        ),

        // ── Template layout section — toggle card ──
        !job && React.createElement("div", null,

            // Toggle header card
            React.createElement("div", { style: Object.assign({}, card, { marginBottom: tmplEnabled ? 0 : 16 }) },
              React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                React.createElement("div", null,
                  React.createElement("p", { style: Object.assign({}, lbl, { marginBottom: 2 }) }, "🎬 Template Settings"),
                  React.createElement("p", { style: { margin: 0, fontSize: 12, color: "#475569" } },
                    tmplEnabled
                      ? "Choose layout, background clip and split ratio"
                      : "Toggle on to configure template options"
                  )
                ),
                React.createElement("div", {
                  onClick: function() { setTmplEnabled(!tmplEnabled); },
                  style: { width: 44, height: 24, borderRadius: 12, cursor: "pointer", background: tmplEnabled ? "#6366f1" : "#374151", position: "relative", transition: "background 0.2s", flexShrink: 0 }
                },
                  React.createElement("div", { style: { position: "absolute", top: 3, left: tmplEnabled ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" } })
                )
              )
            ),

            tmplEnabled && React.createElement("div", null,

            // Section A: Template layout picker
            React.createElement("div", { style: card },
              React.createElement("p", { style: lbl }, "Template Layout"),
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 } },
                TEMPLATE_DEFS.map(function(t) {
                  var selected = tmpl === t.id;
                  return React.createElement("div", {
                    key: t.id,
                    onClick: function() { setTmpl(t.id); },
                    style: {
                      cursor: "pointer",
                      borderRadius: 10,
                      padding: 8,
                      background: selected ? "#6366f111" : "#0f172a",
                      border: selected ? "2px solid #6366f1" : "2px solid #1e293b",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    }
                  },
                    // Phone preview
                    React.createElement("div", { style: {
                      width: 52, height: 92,
                      borderRadius: 8,
                      border: "2px solid " + (selected ? "#6366f1" : "#374151"),
                      overflow: "hidden",
                      background: "#0a0b14",
                    } },
                      t.preview(splitRatio / 100)
                    ),
                    React.createElement("p", { style: { margin: 0, fontSize: 10, fontWeight: 600, color: selected ? "#a5b4fc" : "#94a3b8", textAlign: "center", lineHeight: 1.3 } }, t.name),
                    React.createElement("p", { style: { margin: 0, fontSize: 9, color: "#475569", textAlign: "center", lineHeight: 1.3 } }, t.description)
                  );
                })
              )
            ),


            // Section B: Background clip picker (only if layout needs bg)
            currentTmplDef.needsBg && React.createElement("div", { style: card },
              React.createElement("p", { style: lbl }, "Background Clip"),

              // Category pills
              React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } },
                BG_CATEGORIES.map(function(cat) {
                  return React.createElement("button", {
                    key: cat,
                    onClick: function() { setBgCat(cat); },
                    style: Object.assign({}, btn(bgCat === cat ? "#6366f133" : "#0f172a"), {
                      border: bgCat === cat ? "1px solid #6366f1" : "1px solid #374151",
                      textTransform: "capitalize", fontSize: 12,
                    })
                  }, cat);
                })
              ),

              // Clip grid
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 } },
                bgClips.map(function(clip) {
                  var selected = bgClip === clip.id;
                  return React.createElement("div", {
                    key: clip.id,
                    onClick: function() { setBgClip(clip.id); },
                    style: {
                      cursor: "pointer", borderRadius: 8, overflow: "hidden",
                      border: selected ? "2px solid #6366f1" : "2px solid #1e293b",
                      background: "#0f172a",
                    }
                  },
                    // Thumbnail placeholder
                    React.createElement("div", { style: { height: 72, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center" } },
                      React.createElement("span", { style: { fontSize: 24 } }, "🎬")
                    ),
                    React.createElement("div", { style: { padding: "6px 8px" } },
                      React.createElement("p", { style: { margin: 0, fontSize: 11, fontWeight: 600, color: selected ? "#a5b4fc" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, clip.name),
                      clip.duration > 0 && React.createElement("p", { style: { margin: 0, fontSize: 10, color: "#64748b" } }, clip.duration + "s")
                    )
                  );
                }),

                // Upload card
                React.createElement("div", {
                  onClick: function() { fileInputRef.current && fileInputRef.current.click(); },
                  style: {
                    cursor: "pointer", borderRadius: 8, overflow: "hidden",
                    border: "2px dashed #374151",
                    background: "#0f172a",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    minHeight: 110, gap: 4,
                    opacity: uploading ? 0.5 : 1,
                  }
                },
                  React.createElement("span", { style: { fontSize: 24 } }, uploading ? "⏳" : "📁"),
                  React.createElement("p", { style: { margin: 0, fontSize: 10, color: "#64748b" } }, uploading ? "Uploading..." : "Upload your own")
                ),
                React.createElement("input", { ref: fileInputRef, type: "file", accept: ".mp4,.mov,.webm", style: { display: "none" }, onChange: handleUpload })
              ),

              bgClips.length === 0 && React.createElement("p", { style: { color: "#64748b", fontSize: 13, marginTop: 12 } },
                "No clips in this category yet. Upload one or run ",
                React.createElement("code", { style: { background: "#1e293b", padding: "2px 6px", borderRadius: 4, fontSize: 12 } }, "python scripts/download_starter_clips.py"),
                " to download free starter clips."
              ),

              bgClip && React.createElement("p", { style: { color: "#10b981", fontSize: 12, marginTop: 12 } }, "✓ Selected: " + bgClip),
              !bgClip && React.createElement("p", { style: { color: "#f59e0b", fontSize: 12, marginTop: 12 } }, "⚠️ No background selected — will use a black bar instead")
            ),

            // Section C: Settings
            React.createElement("div", { style: card },
              React.createElement("p", { style: lbl }, "Settings"),
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: outFmt === "landscape" ? "1fr 1fr" : "1fr 1fr 1fr", gap: 16 } },

                // Split ratio — spans full width in landscape
                React.createElement("div", { style: outFmt === "landscape" ? { gridColumn: "1 / -1" } : {} },
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("p", { style: lbl }, "Split Ratio"),
                    React.createElement("span", { style: { fontSize: 12, color: "#6366f1", fontWeight: 700 } }, splitRatio + " / " + (100 - splitRatio))
                  ),
                  React.createElement("input", { type: "range", min: 40, max: 75, value: splitRatio, onChange: function(e) { setSplitRatio(+e.target.value); }, style: slider })
                ),

                // Clips + Max length only for portrait
                outFmt !== "landscape" && React.createElement("div", null,
                  React.createElement("p", { style: lbl }, "Clips: " + num),
                  React.createElement("input", { type: "range", min: 1, max: 10, value: num, onChange: function(e) { setNum(+e.target.value); }, style: slider })
                ),

                outFmt !== "landscape" && React.createElement("div", null,
                  React.createElement("p", { style: lbl }, "Max Length: " + maxD + "s"),
                  React.createElement("input", { type: "range", min: 15, max: 180, step: 15, value: maxD, onChange: function(e) { setMaxD(+e.target.value); }, style: slider })
                ),

                // Landscape processing warning (replaces clip count + max length)
                outFmt === "landscape" && React.createElement("div", null,
                  React.createElement("p", { style: lbl }, "Processing Time"),
                  React.createElement("div", { style: { background: "#1c1917", border: "1px solid #78350f", borderRadius: 8, padding: "10px 14px", color: "#fcd34d", fontSize: 12 } },
                    "⏳ Long videos take 5–15 mins to process. Keep this tab open."
                  )
                )
              ),

              // Live preview phone
              React.createElement("div", { style: { marginTop: 20, display: "flex", alignItems: "flex-start", gap: 20 } },
                React.createElement("div", null,
                  React.createElement("p", { style: lbl }, "Live Preview"),
                  React.createElement("div", { style: {
                    width: 70, height: 124,
                    borderRadius: 10,
                    border: "2px solid #374151",
                    overflow: "hidden",
                    background: "#0a0b14",
                  } },
                    currentTmplDef.preview(splitRatio / 100)
                  )
                ),
                React.createElement("div", { style: { paddingTop: 20 } },
                  React.createElement("p", { style: { margin: "0 0 4px", fontWeight: 600, color: "#e2e8f0" } }, currentTmplDef.name),
                  React.createElement("p", { style: { margin: "0 0 4px", fontSize: 13, color: "#64748b" } }, currentTmplDef.description),
                  currentTmplDef.id !== "caption_bar" && React.createElement("p", { style: { margin: 0, fontSize: 13, color: "#94a3b8" } }, "Top: " + splitRatio + "% your video · Bottom: " + (100 - splitRatio) + "% background"),
                  bgClip
                    ? React.createElement("p", { style: { margin: "4px 0 0", fontSize: 12, color: "#10b981" } }, "✓ BG: " + bgClip)
                    : currentTmplDef.needsBg && React.createElement("p", { style: { margin: "4px 0 0", fontSize: 12, color: "#f59e0b" } }, "⚠️ No background clip selected")
                )
              )
            )
            ) // end tmplEnabled
        ),

        // Non-template clip settings (when template section is off and portrait mode)
        !job && !tmplEnabled && outFmt !== "landscape" && React.createElement("div", { style: card },
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 } },
              React.createElement("div", null,
                React.createElement("p", { style: lbl }, "Clips: " + num),
                React.createElement("input", { type: "range", min: 1, max: 10, value: num, onChange: function(e) { setNum(+e.target.value); }, style: slider })
              ),
              React.createElement("div", null,
                React.createElement("p", { style: lbl }, "Min: " + minD + "s"),
                React.createElement("input", { type: "range", min: 5, max: 30, step: 5, value: minD, onChange: function(e) { setMinD(+e.target.value); }, style: slider })
              ),
              React.createElement("div", null,
                React.createElement("p", { style: lbl }, "Max: " + maxD + "s"),
                React.createElement("input", { type: "range", min: 30, max: 300, step: 15, value: maxD, onChange: function(e) { setMaxD(+e.target.value); }, style: slider })
              )
            )
        ),

        // Job in progress
        job && job.status !== "done" && job.status !== "error" && React.createElement("div", { style: card },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
            React.createElement("div", { style: { width: 10, height: 10, borderRadius: "50%", background: colors[job.status] || "#6366f1" } }),
            React.createElement("span", { style: { fontSize: 15, fontWeight: 600 } }, job.message)
          ),
          React.createElement("div", { style: { background: "#1e293b", borderRadius: 8, height: 8, overflow: "hidden" } },
            React.createElement("div", { style: { height: "100%", width: job.progress + "%", background: colors[job.status] || "#6366f1", borderRadius: 8, transition: "width 0.5s" } })
          ),
          React.createElement("p", { style: { color: "#64748b", fontSize: 13, marginTop: 12 } }, "☕ Takes 2-5 minutes. Don't close this tab.")
        ),

        // Error
        job && job.status === "error" && React.createElement("div", { style: card },
          React.createElement("p", { style: { color: "#ef4444", fontSize: 18, fontWeight: 700, textAlign: "center", margin: "0 0 8px" } }, "❌ Failed"),
          React.createElement("p", { style: { color: "#94a3b8", fontSize: 14, textAlign: "center", margin: "0 0 20px" } }, job.error),
          React.createElement("button", { onClick: reset, style: Object.assign({}, btn("#1e293b"), { width: "100%" }) }, "Try Again")
        ),

        // Done
        job && job.status === "done" && React.createElement("div", { style: card },
          // Landscape / full-video mode: single player
          job.outputs && job.outputs[0] && job.outputs[0].output_mode === "full_video"
            ? React.createElement("div", null,
                React.createElement("p", { style: { color: "#10b981", fontSize: 18, fontWeight: 700, margin: "0 0 16px" } }, "✅ Full video ready!"),
                React.createElement("div", { style: { background: "#0f172a", borderRadius: 12, overflow: "hidden", marginBottom: 16 } },
                  React.createElement("video", { src: API + job.outputs[0].path, controls: true, style: { width: "100%", maxHeight: 500 } }),
                  React.createElement("div", { style: { padding: 16 } },
                    React.createElement("p", { style: { fontWeight: 700, margin: "0 0 4px" } }, job.outputs[0].title),
                    React.createElement("p", { style: { color: "#64748b", fontSize: 12, margin: "0 0 12px" } },
                      "⏱️ " + job.outputs[0].duration + "s · " +
                      (job.outputs[0].output_format === "landscape" ? "1920×1080 landscape" : "1080×1920 portrait")
                    ),
                    React.createElement("a", { href: API + job.outputs[0].path, download: true, style: Object.assign({}, btn("#6366f1"), { display: "block", textAlign: "center", color: "#fff", textDecoration: "none", fontWeight: 700 }) }, "⬇️ Download full video"),

                    // Keyword tabs for full video (index 0)
                    React.createElement("div", { style: { marginTop: 16 } },
                      React.createElement("div", { style: { display: "flex", borderBottom: "1px solid #1e293b", margin: "8px 0 0" } },
                        ["📝 Caption", "🏷️ Keywords", "📤 Export"].map(function(tab, ti) {
                          var tabKey = ["caption", "keywords", "export"][ti];
                          var isActive = (clipKeywords[0] ? clipKeywords[0].activeTab : "keywords") === tabKey;
                          return React.createElement("div", {
                            key: tab,
                            onClick: function() {
                              setClipKeywords(function(prev) {
                                var u = Object.assign({}, prev);
                                u[0] = Object.assign({}, u[0] || {}, { activeTab: tabKey });
                                return u;
                              });
                            },
                            style: {
                              padding: "8px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                              color: isActive ? "#a78bfa" : "#475569",
                              borderBottom: isActive ? "2px solid #6366f1" : "2px solid transparent"
                            }
                          }, tab);
                        })
                      ),
                      (function() {
                        var kw = clipKeywords[0] || {};
                        var activeTab = kw.activeTab || "keywords";
                        var clip = job.outputs[0];

                        if (activeTab === "caption") {
                          return React.createElement("div", { style: { padding: "10px 0" } },
                            React.createElement("p", {
                              contentEditable: true,
                              suppressContentEditableWarning: true,
                              style: { fontSize: 12, color: "#94a3b8", lineHeight: 1.5,
                                       background: "#0d1117", border: "1px solid #1e293b",
                                       borderRadius: 6, padding: "8px 10px", outline: "none", minHeight: 60 }
                            }, clip.caption),
                            React.createElement("button", {
                              onClick: function() { navigator.clipboard.writeText(clip.caption || ""); },
                              style: { marginTop: 6, padding: "5px 12px", background: "#6366f133",
                                       border: "1px solid #6366f155", borderRadius: 6,
                                       color: "#a78bfa", fontSize: 11, cursor: "pointer" }
                            }, "📋 Copy caption")
                          );
                        }

                        if (activeTab === "keywords") {
                          var primary = (kw.primary != null ? kw.primary : null) || clip.primary_keywords || [];
                          var secondary = (kw.secondary != null ? kw.secondary : null) || clip.secondary_keywords || [];
                          var hashtags = (kw.hashtags != null ? kw.hashtags : null) || clip.hashtags || [];

                          function renderFVTags(tags, color, bg, border, group) {
                            return React.createElement("div", { style: { marginBottom: 10 } },
                              React.createElement("p", { style: { fontSize: 10, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 } },
                                group === "primary" ? "Primary keywords" : group === "secondary" ? "Secondary keywords" : "Hashtags"
                              ),
                              React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 5 } },
                                tags.map(function(tag, ti) {
                                  return React.createElement("span", {
                                    key: ti,
                                    style: { display: "inline-flex", alignItems: "center", gap: 3,
                                             padding: "4px 9px", borderRadius: 20, fontSize: 11,
                                             background: bg, border: "1px solid " + border, color: color }
                                  },
                                    tag,
                                    React.createElement("span", {
                                      onClick: function() {
                                        setClipKeywords(function(prev) {
                                          var u = Object.assign({}, prev);
                                          var c = Object.assign({}, u[0] || {});
                                          c[group] = (c[group] || tags).filter(function(_, idx) { return idx !== ti; });
                                          u[0] = c;
                                          return u;
                                        });
                                      },
                                      style: { cursor: "pointer", opacity: .5, fontSize: 10 }
                                    }, "×")
                                  );
                                })
                              )
                            );
                          }

                          return React.createElement("div", { style: { padding: "10px 0" } },
                            renderFVTags(primary, "#a78bfa", "#6366f122", "#6366f144", "primary"),
                            renderFVTags(secondary, "#94a3b8", "#1e293b", "#334155", "secondary"),
                            renderFVTags(hashtags, "#38bdf8", "#0284c722", "#0284c744", "hashtags"),
                            React.createElement("button", {
                              onClick: function() {
                                var all = [].concat(kw.primary || primary, kw.secondary || secondary).join(", ");
                                navigator.clipboard.writeText(all);
                              },
                              style: { padding: "6px 12px", background: "#6366f133", border: "1px solid #6366f155",
                                       borderRadius: 6, color: "#a78bfa", fontSize: 11, cursor: "pointer", marginTop: 4 }
                            }, "📋 Copy YouTube tags")
                          );
                        }

                        if (activeTab === "export") {
                          var ytTags = kw.youtube_tags != null ? kw.youtube_tags : (clip.youtube_tags || "");
                          var tiktok = kw.tiktok_description != null ? kw.tiktok_description : (clip.tiktok_description || clip.caption || "");
                          return React.createElement("div", { style: { padding: "10px 0" } },
                            React.createElement("p", { style: { fontSize: 10, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 } }, "YouTube tags"),
                            React.createElement("div", {
                              style: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 6,
                                       padding: "8px 10px", fontSize: 11, color: "#64748b",
                                       fontFamily: "monospace", wordBreak: "break-all", marginBottom: 4 }
                            }, ytTags),
                            React.createElement("p", {
                              style: { fontSize: 10, color: ytTags.length > 450 ? "#f59e0b" : "#475569", marginBottom: 8 }
                            }, ytTags.length + " / 500 chars"),
                            React.createElement("button", {
                              onClick: function() { navigator.clipboard.writeText(ytTags); },
                              style: { padding: "5px 12px", background: "#6366f133", border: "1px solid #6366f155",
                                       borderRadius: 6, color: "#a78bfa", fontSize: 11, cursor: "pointer", marginBottom: 12 }
                            }, "📋 Copy YouTube tags"),
                            React.createElement("p", { style: { fontSize: 10, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 } }, "TikTok / Shorts"),
                            React.createElement("div", {
                              style: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 6,
                                       padding: "8px 10px", fontSize: 11, color: "#64748b", marginBottom: 6 }
                            }, tiktok),
                            React.createElement("button", {
                              onClick: function() { navigator.clipboard.writeText(tiktok); },
                              style: { padding: "5px 12px", background: "#6366f133", border: "1px solid #6366f155",
                                       borderRadius: 6, color: "#a78bfa", fontSize: 11, cursor: "pointer" }
                            }, "📋 Copy TikTok description")
                          );
                        }

                        return null;
                      })()
                    )
                  )
                )
              )
            // Shorts mode: existing clip grid
            : React.createElement("div", null,
                React.createElement("p", { style: { color: "#10b981", fontSize: 18, fontWeight: 700, margin: "0 0 20px" } }, "✅ " + (job.outputs ? job.outputs.length : 0) + " clips ready!"),
                job.outputs && job.outputs.map(function(clip, i) {
                  var tmplDef = clip.template_id ? TEMPLATE_DEFS.find(function(t) { return t.id === clip.template_id; }) : null;
                  var kw = clipKeywords[i] || { primary: [], secondary: [], hashtags: [], youtube_tags: "", tiktok_description: "", activeTab: "keywords", keywordStyle: "seo", regenerating: false, addingTo: null, addingValue: "" };
                  var activeTab = kw.activeTab || "keywords";

                  function setKw(updater) {
                    setClipKeywords(function(prev) {
                      var u = Object.assign({}, prev);
                      u[i] = typeof updater === "function" ? updater(u[i] || kw) : updater;
                      return u;
                    });
                  }

                  function tagPill(kword, group, ki, bg, border, color) {
                    return React.createElement("span", { key: ki, style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20, fontSize: 12, background: bg, border: "1px solid " + border, color: color, margin: "0 4px 4px 0" } },
                      kword,
                      React.createElement("span", { onClick: function() { removeKeyword(i, group, ki); }, style: { cursor: "pointer", opacity: 0.6, fontSize: 11, marginLeft: 2 } }, "×")
                    );
                  }

                  function addPill(group) {
                    if (kw.addingTo === group) {
                      return React.createElement("input", { key: "addinput-" + group, autoFocus: true, value: kw.addingValue || "", onChange: function(e) { var v = e.target.value; setKw(function(prev) { return Object.assign({}, prev, { addingValue: v }); }); }, onKeyDown: function(e) { if (e.key === "Enter") { addKeyword(i, group, kw.addingValue || ""); } if (e.key === "Escape") { setKw(function(prev) { return Object.assign({}, prev, { addingTo: null, addingValue: "" }); }); } }, style: { background: "#1e293b", border: "1px solid #374151", borderRadius: 12, padding: "4px 10px", color: "#e2e8f0", fontSize: 12, width: 120, outline: "none" } });
                    }
                    return React.createElement("span", { key: "addpill-" + group, onClick: function() { setKw(function(prev) { return Object.assign({}, prev, { addingTo: group, addingValue: "" }); }); }, style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20, fontSize: 12, background: "transparent", border: "1px dashed #374151", color: "#475569", cursor: "pointer", margin: "0 4px 4px 0" } }, "+ Add");
                  }

                  return React.createElement("div", { key: i, style: S.clipCard },
                    React.createElement("video", { src: API + clip.path, controls: true, style: { width: "100%", maxHeight: 400 } }),
                    React.createElement("div", { style: S.clipMeta },

                      React.createElement("p", { style: S.clipTitle }, clip.title),
                      React.createElement("p", { style: S.clipDuration }, "⏱️ " + clip.duration + "s"),

                      // TAB BAR
                      React.createElement("div", { style: { display: "flex", borderBottom: "1px solid #1e293b", margin: "8px 0 0" } },
                        ["📝 Caption", "🏷️ Keywords", "📤 Export"].map(function(tab, ti) {
                          var tabKey = ["caption", "keywords", "export"][ti];
                          var isActive = (clipKeywords[i] ? clipKeywords[i].activeTab : "keywords") === tabKey;
                          return React.createElement("div", {
                            key: tab,
                            onClick: function() {
                              setClipKeywords(function(prev) {
                                var u = Object.assign({}, prev);
                                u[i] = Object.assign({}, u[i] || {}, { activeTab: tabKey });
                                return u;
                              });
                            },
                            style: {
                              padding: "8px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                              color: isActive ? "#a78bfa" : "#475569",
                              borderBottom: isActive ? "2px solid #6366f1" : "2px solid transparent"
                            }
                          }, tab);
                        })
                      ),

                      // TAB CONTENT (IIFE)
                      (function() {
                        var kw = clipKeywords[i] || {};
                        var activeTab = kw.activeTab || "keywords";

                        if (activeTab === "caption") {
                          var captionRef = { current: null };
                          return React.createElement("div", { style: { padding: "10px 0" } },
                            React.createElement("p", {
                              ref: function(el) { captionRef.current = el; },
                              contentEditable: true,
                              suppressContentEditableWarning: true,
                              style: { fontSize: 13, color: "#cbd5e1", lineHeight: 1.6,
                                       background: "#0d1117", border: "1px solid #1e293b",
                                       borderRadius: 8, padding: "12px 14px", outline: "none",
                                       minHeight: 72, marginBottom: 10 }
                            }, clip.caption),
                            React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8 } },
                              React.createElement("button", {
                                onClick: function() {
                                  if (captionRef.current) captionRef.current.focus();
                                },
                                style: { padding: "6px 14px", background: "#1e293b",
                                         border: "1px solid #334155", borderRadius: 6,
                                         color: "#94a3b8", fontSize: 12, cursor: "pointer" }
                              }, "✏️ Edit"),
                              React.createElement("button", {
                                onClick: function() {
                                  var text = captionRef.current ? captionRef.current.innerText : clip.caption;
                                  navigator.clipboard.writeText(text);
                                },
                                style: { padding: "6px 14px", background: "#6366f1",
                                         border: "none", borderRadius: 6,
                                         color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }
                              }, "📋 Copy caption")
                            )
                          );
                        }

                        if (activeTab === "keywords") {
                          var primary = (kw.primary != null ? kw.primary : null) || clip.primary_keywords || [];
                          var secondary = (kw.secondary != null ? kw.secondary : null) || clip.secondary_keywords || [];
                          var hashtags = (kw.hashtags != null ? kw.hashtags : null) || clip.hashtags || [];

                          var STYLE_OPTIONS = [
                            { value: "seo", label: "SEO focused", icon: "🎯" },
                            { value: "viral", label: "Viral / trending", icon: "🔥" },
                            { value: "news", label: "News style", icon: "📰" },
                            { value: "sport", label: "Sport niche", icon: "⚽" },
                          ];
                          var currentStyle = kw.keywordStyle || "seo";
                          var currentStyleOpt = STYLE_OPTIONS.find(function(o) { return o.value === currentStyle; }) || STYLE_OPTIONS[0];

                          function renderKwTags(tags, color, bg, border, group, badge) {
                            var labelMap = { primary: "Primary keywords", secondary: "Secondary keywords", hashtags: "Hashtags" };
                            return React.createElement("div", { style: { marginBottom: 12 } },
                              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } },
                                React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".08em" } }, labelMap[group]),
                                React.createElement("span", { style: { fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "#1e293b", color: "#64748b" } }, badge)
                              ),
                              React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 5 } },
                                tags.map(function(tag, ti) {
                                  var tiCapture = ti;
                                  return React.createElement("span", {
                                    key: tiCapture,
                                    style: { display: "inline-flex", alignItems: "center", gap: 3,
                                             padding: "4px 10px", borderRadius: 20, fontSize: 12,
                                             background: bg, border: "1px solid " + border, color: color }
                                  },
                                    tag,
                                    React.createElement("span", {
                                      onClick: function() { removeKeyword(i, group, tiCapture); },
                                      style: { cursor: "pointer", opacity: .5, fontSize: 11, marginLeft: 2 }
                                    }, "×")
                                  );
                                }),
                                addPill(group)
                              )
                            );
                          }

                          return React.createElement("div", { style: { padding: "10px 0" } },
                            // Style dropdown + Regenerate button
                            React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } },
                              React.createElement("div", { style: { position: "relative", flex: 1 } },
                                React.createElement("select", {
                                  value: currentStyle,
                                  onChange: function(e) {
                                    var v = e.target.value;
                                    setKw(function(prev) { return Object.assign({}, prev, { keywordStyle: v }); });
                                  },
                                  style: { width: "100%", padding: "8px 12px", background: "#0d1117",
                                           border: "1px solid #1e293b", borderRadius: 8,
                                           color: "#e2e8f0", fontSize: 13, cursor: "pointer",
                                           appearance: "none", outline: "none" }
                                },
                                  STYLE_OPTIONS.map(function(opt) {
                                    return React.createElement("option", { key: opt.value, value: opt.value },
                                      opt.icon + " " + opt.label);
                                  })
                                ),
                                React.createElement("span", {
                                  style: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                                           color: "#475569", pointerEvents: "none", fontSize: 12 }
                                }, "▾")
                              ),
                              React.createElement("button", {
                                onClick: function() { regenerateKeywords(i); },
                                disabled: kw.regenerating,
                                style: { padding: "8px 14px", background: "#1e293b",
                                         border: "1px solid #334155", borderRadius: 8,
                                         color: kw.regenerating ? "#475569" : "#e2e8f0",
                                         fontSize: 12, cursor: kw.regenerating ? "not-allowed" : "pointer",
                                         whiteSpace: "nowrap", fontWeight: 500 }
                              }, kw.regenerating ? "..." : "✨ Regenerate keywords")
                            ),
                            renderKwTags(primary, "#a78bfa", "#6366f122", "#6366f144", "primary", "high search volume"),
                            renderKwTags(secondary, "#94a3b8", "#1e293b", "#334155", "secondary", "related terms"),
                            renderKwTags(hashtags, "#38bdf8", "#0284c722", "#0284c744", "hashtags", "TikTok / Shorts"),
                            React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 } },
                              React.createElement("button", {
                                onClick: function() {
                                  navigator.clipboard.writeText((kw.hashtags || hashtags).join(" "));
                                },
                                style: { padding: "6px 14px", background: "#1e293b",
                                         border: "1px solid #334155", borderRadius: 6,
                                         color: "#94a3b8", fontSize: 12, cursor: "pointer" }
                              }, "📋 Copy hashtags"),
                              React.createElement("button", {
                                onClick: function() {
                                  var all = [].concat(kw.primary || primary, kw.secondary || secondary).join(", ");
                                  navigator.clipboard.writeText(all);
                                },
                                style: { padding: "6px 14px", background: "#6366f1",
                                         border: "none", borderRadius: 6,
                                         color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }
                              }, "📋 Copy all YouTube tags")
                            )
                          );
                        }

                        if (activeTab === "export") {
                          var ytTags = kw.youtube_tags != null ? kw.youtube_tags : (clip.youtube_tags || "");
                          var tiktok = kw.tiktok_description != null ? kw.tiktok_description : (clip.tiktok_description || clip.caption || "");
                          return React.createElement("div", { style: { padding: "10px 0" } },
                            React.createElement("p", { style: { fontSize: 10, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 } }, "YouTube tags"),
                            React.createElement("div", {
                              style: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 6,
                                       padding: "8px 10px", fontSize: 11, color: "#64748b",
                                       fontFamily: "monospace", wordBreak: "break-all", marginBottom: 4 }
                            }, ytTags),
                            React.createElement("p", {
                              style: { fontSize: 10, color: ytTags.length > 450 ? "#f59e0b" : "#475569", marginBottom: 8 }
                            }, ytTags.length + " / 500 chars"),
                            React.createElement("button", {
                              onClick: function() { navigator.clipboard.writeText(ytTags); },
                              style: { padding: "5px 12px", background: "#6366f133", border: "1px solid #6366f155",
                                       borderRadius: 6, color: "#a78bfa", fontSize: 11, cursor: "pointer", marginBottom: 12 }
                            }, "📋 Copy YouTube tags"),
                            React.createElement("p", { style: { fontSize: 10, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 } }, "TikTok / Shorts"),
                            React.createElement("div", {
                              style: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 6,
                                       padding: "8px 10px", fontSize: 11, color: "#64748b", marginBottom: 6 }
                            }, tiktok),
                            React.createElement("button", {
                              onClick: function() { navigator.clipboard.writeText(tiktok); },
                              style: { padding: "5px 12px", background: "#6366f133", border: "1px solid #6366f155",
                                       borderRadius: 6, color: "#a78bfa", fontSize: 11, cursor: "pointer" }
                            }, "📋 Copy TikTok description")
                          );
                        }

                        return null;
                      })(),

                      // Download button at bottom
                      React.createElement("a", {
                        href: API + clip.path, download: true, style: S.downloadBtn
                      }, "⬇️ Download")
                    )
                  );
                })
              ),
          React.createElement("button", { onClick: reset, style: Object.assign({}, btn("#1e293b"), { width: "100%", marginTop: 8 }) }, "Process Another Video")
        )
      )
    )
  );
}

// --- Styles ---
var card = { background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: "28px 32px", marginBottom: 20 };
var lbl = { fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8, marginTop: 0, textTransform: "uppercase", letterSpacing: "0.05em" };
var inp = { width: "100%", background: "#0f172a", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box" };
var slider = { width: "100%", accentColor: "#6366f1", display: "block" };
function btn(bg) { return { background: bg, border: "1px solid #374151", borderRadius: 8, padding: "8px 16px", color: "#94a3b8", cursor: "pointer", fontSize: 13 }; }
var S = {
  clipCard: { background: "#0f172a", borderRadius: 12, overflow: "hidden", marginBottom: 16 },
  clipMeta: { padding: 16 },
  clipTitle: { fontWeight: 700, margin: "0 0 4px", fontSize: 14, color: "#e2e8f0" },
  clipDuration: { color: "#64748b", fontSize: 12, margin: "0 0 0" },
  downloadBtn: { display: "block", textAlign: "center", background: "#6366f1", border: "none", borderRadius: 8, padding: "9px 16px", color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 13, marginTop: 14, cursor: "pointer" },
};

// --- Export wrapped in error boundary ---
export default function App() {
  return React.createElement(ErrorBoundary, null, React.createElement(ClipForge));
}
