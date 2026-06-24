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
  var _url = s(""), url = _url[0], setUrl = _url[1];
  var _mode = s("shorts"), mode = _mode[0], setMode = _mode[1];
  var _tmpl = s("split_reaction"), tmpl = _tmpl[0], setTmpl = _tmpl[1];
  var _num = s(3), num = _num[0], setNum = _num[1];
  var _minD = s(10), minD = _minD[0], setMinD = _minD[1];
  var _maxD = s(180), maxD = _maxD[0], setMaxD = _maxD[1];
  var _prov = s(initProvider), prov = _prov[0], setProv = _prov[1];
  var _model = s(""), model = _model[0], setModel = _model[1];
  var _key = s(getLS("cf_key_" + initProvider, "")), apiKey = _key[0], setKey = _key[1];
  var _eKey = s(getLS("cf_ekey", "")), eKey = _eKey[0], setEKey = _eKey[1];
  var _settings = s(false), showSettings = _settings[0], setSettings = _settings[1];
  var _jobId = s(null), jobId = _jobId[0], setJobId = _jobId[1];
  var _job = s(null), job = _job[0], setJob = _job[1];
  var _err = s(""), err = _err[0], setErr = _err[1];
  var pollRef = useRef(null);

  var cp = PROVIDERS.find(function(p) { return p.id === prov; }) || PROVIDERS[0];

  useEffect(function() {
    setLS("cf_prov", prov);
    setKey(getLS("cf_key_" + prov, ""));
    setModel(cp.models[0]);
  }, [prov]);

  useEffect(function() { if (apiKey) setLS("cf_key_" + prov, apiKey); }, [apiKey]);
  useEffect(function() { if (eKey) setLS("cf_ekey", eKey); }, [eKey]);

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

      // Settings
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

      // Main
      React.createElement("main", { style: { maxWidth: 800, margin: "0 auto", padding: "40px 24px" } },

        // Hero
        React.createElement("div", { style: { textAlign: "center", marginBottom: 40 } },
          React.createElement("p", { style: { color: "#6366f1", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 } }, "YouTube → Shorts Pipeline"),
          React.createElement("h1", { style: { fontSize: 48, fontWeight: 800, lineHeight: 1.1, margin: "0 0 16px", color: "#f1f5f9" } }, "Paste a URL. Get Shorts."),
          React.createElement("p", { style: { color: "#64748b", fontSize: 16 } }, "AI downloads, transcribes, finds best moments, and cuts your Shorts.")
        ),

        // No job = show form
        !job && React.createElement("div", { style: card },

          // URL input
          React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 20 } },
            React.createElement("input", { placeholder: "https://youtube.com/watch?v=...", value: url, onChange: function(e) { setUrl(e.target.value); }, onKeyDown: function(e) { if (e.key === "Enter") submit(); }, style: Object.assign({}, inp, { flex: 1, marginBottom: 0 }) }),
            React.createElement("button", { onClick: submit, style: Object.assign({}, btn("#6366f1"), { color: "#fff", fontWeight: 700, padding: "12px 24px" }) }, "Process →")
          ),

          err && React.createElement("div", { style: { background: "#7f1d1d33", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 } }, "⚠️ " + err),

          !apiKey && prov !== "ollama" && React.createElement("div", { style: { background: "#78350f33", border: "1px solid #f59e0b55", borderRadius: 8, padding: "10px 14px", color: "#fcd34d", fontSize: 13, marginBottom: 16 } },
            "No " + cp.name + " key. ",
            React.createElement("button", { onClick: function() { setSettings(true); }, style: { background: "none", border: "none", color: "#fbbf24", cursor: "pointer", textDecoration: "underline", fontSize: 13, padding: 0 } }, "Open Settings →")
          ),

          // Mode
          React.createElement("p", { style: lbl }, "Mode"),
          React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 20 } },
            [["shorts", "⚡ Auto Shorts"], ["template", "🎬 Template"], ["voiceover", "🎙️ Voiceover"]].map(function(m) {
              return React.createElement("button", {
                key: m[0], onClick: function() { setMode(m[0]); },
                style: Object.assign({}, btn(mode === m[0] ? "#6366f133" : "#1e293b"), { border: mode === m[0] ? "1px solid #6366f1" : "1px solid #374151", flex: 1 })
              }, m[1]);
            })
          ),

          // Clip settings
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
          React.createElement("p", { style: { color: "#10b981", fontSize: 18, fontWeight: 700, margin: "0 0 20px" } }, "✅ " + (job.outputs ? job.outputs.length : 0) + " clips ready!"),
          job.outputs && job.outputs.map(function(clip, i) {
            return React.createElement("div", { key: i, style: { background: "#0f172a", borderRadius: 12, overflow: "hidden", marginBottom: 16 } },
              React.createElement("video", { src: API + clip.path, controls: true, style: { width: "100%", maxHeight: 400 } }),
              React.createElement("div", { style: { padding: 16 } },
                React.createElement("p", { style: { fontWeight: 700, margin: "0 0 4px" } }, clip.title),
                React.createElement("p", { style: { color: "#64748b", fontSize: 12, margin: "0 0 4px" } }, "⏱️ " + clip.duration + "s"),
                React.createElement("p", { style: { color: "#94a3b8", fontSize: 12, margin: "0 0 12px" } }, clip.caption),
                React.createElement("a", { href: API + clip.path, download: true, style: Object.assign({}, btn("#6366f1"), { display: "block", textAlign: "center", color: "#fff", textDecoration: "none", fontWeight: 700 }) }, "⬇️ Download")
              )
            );
          }),
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
