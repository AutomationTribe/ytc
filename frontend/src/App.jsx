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
    if (mode !== "template") return;
    fetch(API + "/api/backgrounds/" + bgCat)
      .then(function(r) { return r.json(); })
      .then(function(d) { setBgClips(d.clips || []); setBgClip(""); })
      .catch(function() { setBgClips([]); });
  }, [bgCat, mode]);

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

  function captureFrame() {
    if (!url.trim() && !jobId) { setErr("Enter a YouTube URL first"); return; }
    setWmCapturing(true);
    fetch(API + "/api/preview-frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtube_url: url || null, job_id: jobId || null, timestamp: wmTs }),
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
    if (!url.trim()) { setErr("Enter a YouTube URL"); return; }
    if (!apiKey && prov !== "ollama") { setErr("Add API key in Settings"); return; }

    setJob({ status: "queued", progress: 0, message: "Submitting..." });
    fetch(API + "/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtube_url: url, mode: mode, template_id: tmpl,
        num_shorts: num, min_duration: minD, max_duration: maxD,
        voice_style: "deep", provider: prov,
        model: model || cp.models[0],
        api_key: apiKey || null, elevenlabs_api_key: eKey || null,
        bg_clip_id: bgClip || null,
        bg_category: bgCat,
        split_ratio: splitRatio / 100,
        template_output_mode: tmplMode,
        output_format: outFmt,
        watermark_enabled: wmEnabled && wmRegions.length > 0,
        watermark_regions: wmRegions.map(function(r) {
          return { x: r.x, y: r.y, w: r.w, h: r.h, method: r.method, color: r.color };
        }),
        watermark_frame_width: wmFrame ? wmFrame.frame_width : 960,
        watermark_frame_height: wmFrame ? wmFrame.frame_height : 540,
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.job_id) setJobId(d.job_id);
      else { setErr(d.detail || "Server error"); setJob(null); }
    })
    .catch(function(e) { setErr(e.message); setJob(null); });
  }

  function reset() { setJob(null); setJobId(null); setUrl(""); setErr(""); clearInterval(pollRef.current); }

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

  var colors = { queued: "#6366f1", downloading: "#f59e0b", transcribing: "#3b82f6", analyzing: "#8b5cf6", processing: "#ec4899", done: "#10b981", error: "#ef4444" };

  return (
    React.createElement("div", { style: { minHeight: "100vh", background: "#0a0b14", color: "#e2e8f0", fontFamily: "system-ui,sans-serif" } },

      // Header
      React.createElement("header", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid #1e293b" } },
        React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: "#a78bfa" } }, "⚡ ClipForge"),
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
          // URL + submit
          React.createElement("div", { style: Object.assign({}, card, { marginBottom: 16 }) },
            React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 20 } },
              React.createElement("input", { placeholder: "https://youtube.com/watch?v=...", value: url, onChange: function(e) { setUrl(e.target.value); }, onKeyDown: function(e) { if (e.key === "Enter") submit(); }, style: Object.assign({}, inp, { flex: 1, marginBottom: 0 }) }),
              React.createElement("button", { onClick: submit, style: Object.assign({}, btn("#6366f1"), { color: "#fff", fontWeight: 700, padding: "12px 24px" }) }, "Process →")
            ),

            err && React.createElement("div", { style: { background: "#7f1d1d33", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 } }, "⚠️ " + err),

            (mode === "template" || mode === "voiceover") && outFmt === "landscape" && React.createElement("div", { style: { background: "#1c1917", border: "1px solid #78350f", borderRadius: 8, padding: "10px 14px", color: "#fcd34d", fontSize: 13, marginBottom: 16 } },
              "⏳ Full video processing takes 5-15 minutes depending on length."
            ),

            !apiKey && prov !== "ollama" && React.createElement("div", { style: { background: "#78350f33", border: "1px solid #f59e0b55", borderRadius: 8, padding: "10px 14px", color: "#fcd34d", fontSize: 13, marginBottom: 16 } },
              "No " + cp.name + " key. ",
              React.createElement("button", { onClick: function() { setSettings(true); }, style: { background: "none", border: "none", color: "#fbbf24", cursor: "pointer", textDecoration: "underline", fontSize: 13, padding: 0 } }, "Open Settings →")
            ),

            // Mode selector
            React.createElement("p", { style: lbl }, "Mode"),
            React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 0 } },
              [["shorts", "⚡ Auto Shorts"], ["template", "🎬 Template"], ["voiceover", "🎙️ Voiceover"]].map(function(m) {
                return React.createElement("button", {
                  key: m[0], onClick: function() { setMode(m[0]); },
                  style: Object.assign({}, btn(mode === m[0] ? "#6366f133" : "#1e293b"), { border: mode === m[0] ? "1px solid #6366f1" : "1px solid #374151", flex: 1 })
                }, m[1]);
              })
            )
          ),

          // ── Output Format Selector (template + voiceover) ──
          (mode === "template" || mode === "voiceover") && React.createElement("div", { style: card },
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
          ),

          // Template mode panels
          mode === "template" && React.createElement("div", null,

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
          ),

          // Non-template clip settings
          mode !== "template" && React.createElement("div", { style: card },
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

          // ── Watermark removal — 3-step flow ──
          React.createElement("div", { style: card },
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
                    React.createElement("a", { href: API + job.outputs[0].path, download: true, style: Object.assign({}, btn("#6366f1"), { display: "block", textAlign: "center", color: "#fff", textDecoration: "none", fontWeight: 700 }) }, "⬇️ Download full video")
                  )
                )
              )
            // Shorts mode: existing clip grid
            : React.createElement("div", null,
                React.createElement("p", { style: { color: "#10b981", fontSize: 18, fontWeight: 700, margin: "0 0 20px" } }, "✅ " + (job.outputs ? job.outputs.length : 0) + " clips ready!"),
                job.outputs && job.outputs.map(function(clip, i) {
                  var tmplDef = clip.template_id ? TEMPLATE_DEFS.find(function(t) { return t.id === clip.template_id; }) : null;
                  return React.createElement("div", { key: i, style: { background: "#0f172a", borderRadius: 12, overflow: "hidden", marginBottom: 16 } },
                    React.createElement("video", { src: API + clip.path, controls: true, style: { width: "100%", maxHeight: 400 } }),
                    React.createElement("div", { style: { padding: 16 } },
                      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
                        React.createElement("p", { style: { fontWeight: 700, margin: 0 } }, clip.title),
                        tmplDef && React.createElement("span", { style: { fontSize: 11, background: "#6366f122", color: "#a5b4fc", padding: "2px 8px", borderRadius: 8, border: "1px solid #6366f144" } }, tmplDef.name)
                      ),
                      React.createElement("p", { style: { color: "#64748b", fontSize: 12, margin: "0 0 4px" } }, "⏱️ " + clip.duration + "s"),
                      React.createElement("p", { style: { color: "#94a3b8", fontSize: 12, margin: "0 0 12px" } }, clip.caption),
                      React.createElement("a", { href: API + clip.path, download: true, style: Object.assign({}, btn("#6366f1"), { display: "block", textAlign: "center", color: "#fff", textDecoration: "none", fontWeight: 700 }) }, "⬇️ Download")
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

// --- Export wrapped in error boundary ---
export default function App() {
  return React.createElement(ErrorBoundary, null, React.createElement(ClipForge));
}
