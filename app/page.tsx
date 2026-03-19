"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Status = "idle" | "listening" | "processing" | "speaking" | "error";
type LogEntry = { type: "user" | "assistant"; text: string; time: string };

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const hasGreeted = useRef(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [lastResponse, setLastResponse] = useState<string>("");
  const recognitionRef = useRef<any>(null);

  function addLog(type: LogEntry["type"], text: string) {
    setLog((prev) => [...prev, { type, text, time: now() }]);
  }

  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    setStatus("speaking");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "tts", text }),
      });

      if (!res.ok) {
        setStatus("idle");
        onEnd?.();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => {
        setStatus("idle");
        URL.revokeObjectURL(url);
        onEnd?.();
      };
      audio.onerror = () => {
        setStatus("idle");
        URL.revokeObjectURL(url);
        onEnd?.();
      };
      audio.play().catch(() => {
        setStatus("idle");
        onEnd?.();
      });
    } catch {
      setStatus("idle");
      onEnd?.();
    }
  }, []);

  // ---- ADDED: resolve URL for browser opening ----
  function resolveUrl(command: string): string {
    const lower = command.toLowerCase();
    if (lower.includes("youtube")) return "https://youtube.com";
    if (lower.includes("google")) return "https://google.com";
    if (lower.includes("spotify")) return "https://spotify.com";
    if (lower.includes("instagram")) return "https://instagram.com";
    if (lower.includes("twitter") || lower.includes(" x ")) return "https://x.com";
    if (lower.includes("facebook")) return "https://facebook.com";
    if (lower.includes("reddit")) return "https://reddit.com";
    const searchMatch = lower.match(/(?:search for|google|look up)\s+(.+)/);
    if (searchMatch) return `https://www.google.com/search?q=${encodeURIComponent(searchMatch[1])}`;
    const openMatch = lower.match(/open\s+(.+)/);
    if (openMatch) return `https://www.google.com/search?q=${encodeURIComponent(openMatch[1])}`;
    return `https://www.google.com/search?q=${encodeURIComponent(command)}`;
  }

  // ---- ADDED: location fetching ----
  async function getLocation(originalCommand: string = "where am I") {
    setStatus("processing");
    setLastResponse("");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "location", latitude, longitude, query: originalCommand }),
          });
          const data = await res.json();
          addLog("assistant", data.message);
          setLastResponse(data.message);
          speak(data.message, () => setStatus("idle"));
        } catch {
          setStatus("idle");
        }
      },
      () => setStatus("idle")
    );
  }

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setStatus("error");
      return;
    }
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    setStatus("listening");

  recognition.onresult = async (e: any) => {
  const resultIndex = e.resultIndex;
  const command = e.results[resultIndex][0].transcript.toLowerCase().trim();

  addLog("user", command); // always log what the user said
  setStatus("processing");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, messages }),
    });

    const data = await res.json();
    setLastResponse(data.message);

    // Update conversation history if not location
    if (data.intent !== "location") {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: command },
        { role: "assistant", content: data.message },
      ]);
    }

    // Handle each intent explicitly
    switch (data.intent) {
      case "email":
        speak(data.message, () => setStatus("idle"));
        break;

      case "location":
        // location flow already handled in backend
        speak(data.message, () => setStatus("idle"));
        break;

      case "browser":
        const url = resolveUrl(command);
        window.open(url, "_blank");
        speak("Opening that for you now", () => setStatus("idle"));
        break;

      case "music":
        if (data.videoId) setVideoId(data.videoId);
        speak(data.message, () => setStatus("idle"));
        break;

      case "exit":
        speak(data.message, () => setStatus("idle"));
        break;

      case "chat":
        speak(data.message, () => setStatus("idle"));
        break;

      default:
        // fallback
        speak(data.message, () => setStatus("idle"));
        break;
    }
  } catch (err) {
    console.error("Error processing command:", err);
    setStatus("idle");
  }
};

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech") return;
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    };

    recognition.onend = () => {
      setStatus("idle");
    };

    recognition.start();
  }, [messages, speak, status]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (!hasGreeted.current) {
      hasGreeted.current = true;
      speak("Hi, I'm Aria. Press space or tap the mic to talk to me.");
    }
  }, [speak]);
  
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        if (status === "idle" || status === "error") startListening();
        else if (status === "listening") stopListening();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [status, startListening, stopListening]);
  
  const isActive = status === "listening";
  const isProcessing = status === "processing" || status === "speaking";

  return (
    <main className="main-container">
      <div className="bg-blobs">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
      </div>
      <style>{`
        .main-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background-color: var(--bg);
          padding: 2rem;
          font-family: 'Inter', sans-serif;
          position: relative;
          overflow: hidden;
        }

        .bg-blobs {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 0;
          pointer-events: none;
        }

        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.7;
          animation: float 25s infinite alternate;
        }

        .blob-1 { width: 500px; height: 500px; background: var(--color-2); top: -150px; left: -150px; }
        .blob-2 { width: 600px; height: 600px; background: var(--color-3); bottom: -200px; right: -150px; animation-delay: -5s; }
        .blob-3 { width: 400px; height: 400px; background: var(--color-4); top: 15%; right: 5%; animation-delay: -12s; }
        .blob-4 { width: 550px; height: 550px; background: var(--color-5); bottom: 15%; left: 5%; animation-delay: -18s; }

        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(50px, -70px) scale(1.1); }
          66% { transform: translate(-40px, 40px) scale(0.9); }
          100% { transform: translate(20px, -20px) scale(1.05); }
        }

        .content-wrap, .music-widget {
          position: relative;
          z-index: 1;
        }

        .content-wrap {
          width: 100%;
          max-width: 900px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4rem;
          animation: slideIn 1s ease-out;
        }

        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .status-pill {
          position: absolute;
          top: 2rem;
          right: 2rem;
          padding: 0.7rem 1.6rem;
          border-radius: 100px;
          font-size: 0.9375rem;
          font-weight: 600;
          background: var(--surface);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          color: var(--text-muted);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--shadow);
          z-index: 10;
        }

        .status-pill.active {
          background: var(--accent-soft);
          color: var(--accent);
          border-color: var(--accent);
          transform: scale(1.1);
        }

        .response-area {
          width: 100%;
          min-height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 3.5rem;
          background: var(--surface);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 48px;
          border: 1px solid var(--border);
          box-shadow: 0 20px 50px rgba(156, 191, 231, 0.3);
          transition: all 0.6s cubic-bezier(0.165, 0.84, 0.44, 1);
          animation: floatArea 6s ease-in-out infinite;
        }

        @keyframes floatArea {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .response-text {
          font-size: 2.25rem;
          line-height: 1.4;
          color: var(--text);
          font-weight: 600;
          font-family: 'Outfit', sans-serif;
          letter-spacing: -0.02em;
        }

        .mic-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
        }

        .mic-button {
          width: 128px;
          height: 128px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, var(--color-4), var(--color-5));
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 15px 35px -8px rgba(156, 191, 231, 0.6);
          outline: none;
        }

        .mic-button:hover:not(:disabled) {
          transform: translateY(-10px) scale(1.1);
          box-shadow: 0 25px 45px -12px rgba(156, 191, 231, 0.7);
        }

        .mic-button.active {
          background: linear-gradient(135deg, #ff8787, #ff6b6b);
          box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7);
          animation: pulse-red-large 2s infinite;
        }

        .mic-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @keyframes pulse-red-large {
          0% { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7); }
          70% { box-shadow: 0 0 0 35px rgba(255, 107, 107, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0); }
        }

        .hint {
          font-size: 1.125rem;
          color: var(--text-muted);
          font-weight: 500;
          letter-spacing: 0.5px;
          opacity: 0.8;
        }

        .conversation-log {
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-top: 2rem;
        }

        .log-bubble {
          max-width: 85%;
          padding: 1.2rem 1.6rem;
          border-radius: 24px;
          font-size: 1rem;
          font-weight: 500;
          line-height: 1.5;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--shadow);
          border: 1px solid var(--border);
          animation: fadeInUp 0.3s ease forwards;
          opacity: 0;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .log-bubble.user {
          align-self: flex-end;
          background: var(--color-4);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .log-bubble.assistant {
          align-self: flex-start;
          background: var(--surface);
          color: var(--text);
          border-bottom-left-radius: 4px;
        }

        .music-widget {
          position: fixed;
          bottom: 2.5rem;
          left: 2.5rem;
          padding: 1.25rem 1.75rem;
          background: var(--surface);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 1.25rem;
          box-shadow: 0 15px 35px rgba(0,0,0,0.1);
          z-index: 10;
          animation: fadeInUp 0.3s ease forwards;
        }

        .music-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #51cf66;
          animation: musicPulse 1.5s ease-in-out infinite;
        }

        @keyframes musicPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }

        .stop-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 1.2rem;
          line-height: 1;
          padding: 0 2px;
          transition: color 0.2s;
        }

        .stop-btn:hover { color: var(--text); }
      `}</style>

      <div className={`status-pill ${status !== "idle" ? "active" : ""}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>

      <div className="content-wrap">
        <div className="response-area">
          <div className="response-text">
            {status === "processing" ? "Thinking..." :
             lastResponse || "Hi! I'm Aria. How can I help you today?"}
          </div>
        </div>

        <div className="mic-section">
          <button
            className={`mic-button ${isActive ? "active" : ""}`}
            onClick={isActive ? stopListening : startListening}
            disabled={isProcessing}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {isActive ? (
                <rect x="6" y="6" width="12" height="12" rx="2" />
              ) : (
                <>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </>
              )}
            </svg>
          </button>
          <div className="hint">
            {status === "idle" ? "Tap the mic or press Space to start" : 
             status === "listening" ? "I'm listening..." :
             status === "processing" ? "Thinking..." :
             status === "speaking" ? "Speaking..." : "Try again"}
          </div>
        </div>

        {log.length > 0 && (
          <div className="conversation-log">
            {log.slice(-5).map((entry, i) => (
              <div key={i} className={`log-bubble ${entry.type}`}>
                {entry.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {videoId && (
        <div className="music-widget">
          <div className="music-dot" />
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>Now Playing</span>
          <button className="stop-btn" onClick={() => setVideoId(null)}>✕</button>
          <iframe
            width="0" height="0"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            allow="autoplay; encrypted-media"
            style={{ display: "none" }}
          />
        </div>
      )}
    </main>
  );
}
