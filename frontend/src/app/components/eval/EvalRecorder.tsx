import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");

const CLIPS: { group: string; text: string }[] = [
  { group: "A", text: "My farm uses an NFT system." },
  { group: "A", text: "I am raising tilapia and barramundi." },
  { group: "A", text: "The fish tank holds two thousand litres." },
  { group: "A", text: "I have one hundred tilapia fingerlings." },
  { group: "A", text: "The harvest cycle is six months." },
  { group: "A", text: "I also grow trout in a media bed system." },
  { group: "A", text: "The system type is deep water culture." },
  { group: "A", text: "I have fifty catfish and thirty trout." },
  { group: "A", text: "We use a raft system for the crops." },
  { group: "A", text: "The stocking density is five fish per cubic metre." },
  { group: "B", text: "The capital expenditure is five lakh rupees." },
  { group: "B", text: "Monthly revenue is fifty-five thousand rupees." },
  { group: "B", text: "I spent two lakh on infrastructure." },
  { group: "B", text: "The monthly operating cost is thirty thousand." },
  { group: "B", text: "My total investment was one crore rupees." },
  { group: "B", text: "I earn forty thousand from fish every month." },
  { group: "B", text: "The equipment cost one lakh fifty thousand." },
  { group: "B", text: "Annual profit is three lakh rupees." },
  { group: "B", text: "My farm area is one thousand square metres." },
  { group: "B", text: "I started with fifty thousand rupees initial stock." },
  { group: "C", text: "I grow lettuce, spinach, and basil in the aquaponic beds." },
  { group: "C", text: "The crop area is two hundred square metres." },
  { group: "C", text: "Monthly yield is about fifty kilograms of lettuce." },
  { group: "C", text: "My farm is located in Bengaluru, Karnataka." },
  { group: "C", text: "I also cultivate mint and okra." },
  { group: "C", text: "The growing area covers five hundred square feet." },
  { group: "C", text: "I sell tomatoes and capsicum to local markets." },
  { group: "C", text: "The farm is in Pune, Maharashtra." },
  { group: "C", text: "Crop revenue is fifteen thousand per month." },
  { group: "C", text: "I grow herbs like basil and mint near the fish tanks." },
  { group: "D", text: "Um, I have, uh, about twenty thousand litres capacity." },
  { group: "D", text: "You know, I raise till, I mean tilapia, in the main tank." },
  { group: "D", text: "My farm, basically, earns around two lakh, sort of, annually." },
  { group: "D", text: "I think it is, like, an NFT, an n f t, system." },
  { group: "D", text: "Uh, the harvest is, um, every six months or so." },
  { group: "D", text: "I have, you know, around five lakh in capital expenses." },
  { group: "D", text: "Actually I grow talapia, I mean tilapia, and some trout." },
  { group: "D", text: "My location is, uh, Bangalore, Bengaluru, in Karnataka." },
  { group: "D", text: "Um, the monthly revenue is, like, fifty five thousand rupees." },
  { group: "D", text: "I use, basically, a media bead, I mean media bed, system." },
];

type ClipState = "idle" | "recording" | "stopped" | "uploading" | "done" | "error";
type EvalStatus = { status: string; progress: number; total: number };

const GROUP_LABELS: Record<string, string> = {
  A: "Clean Speech",
  B: "Indian Numbers",
  C: "Crop & Location",
  D: "Fillers & Homophones",
};

export function EvalRecorder() {
  const [participantId, setParticipantId] = useState("");
  const [started, setStarted] = useState(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [clipState, setClipState] = useState<ClipState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [evalStatus, setEvalStatus] = useState<EvalStatus | null>(null);
  const [polling, setPolling] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentClip = CLIPS[clipIndex];
  const isFinished = clipIndex >= CLIPS.length;

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/eval/status`);
        const data: EvalStatus = await res.json();
        setEvalStatus(data);
        if (data.status === "complete" || data.status === "error") {
          setPolling(false);
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    setBlob(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(b);
        setClipState("stopped");
      };
      mr.start();
      mediaRef.current = mr;
      setClipState("recording");
    } catch {
      setErrorMsg("Microphone access denied. Please allow microphone and refresh.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  const reRecord = useCallback(() => {
    setBlob(null);
    setClipState("idle");
  }, []);

  const uploadAndAdvance = useCallback(async () => {
    if (!blob || !currentClip) return;
    setClipState("uploading");
    try {
      const form = new FormData();
      const padded = String(clipIndex + 1).padStart(2, "0");
      form.append("audio", blob, `clip_${padded}.webm`);
      form.append("participant_id", participantId);
      form.append("clip_id", String(clipIndex + 1));
      form.append("ground_truth", currentClip.text);
      form.append("group", currentClip.group);

      const res = await fetch(`${API_BASE}/eval/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      setClipState("done");
      setTimeout(() => {
        setClipIndex((i) => i + 1);
        setClipState("idle");
        setBlob(null);
      }, 600);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
      setClipState("error");
    }
  }, [blob, currentClip, clipIndex, participantId]);

  const runEvaluation = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/eval/run`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed to start: ${res.status}`);
      setEvalStatus({ status: "running", progress: 0, total: 0 });
      setPolling(true);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Could not start evaluation");
    }
  }, []);

  if (!started) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.title}>AquaponicAI — Audio Recording</h1>
          <p style={s.subtitle}>
            You will record <strong>40 sentences</strong>, one at a time. Read each sentence
            exactly as shown. You can re-record any clip before moving on.
          </p>
          <input
            style={s.input}
            placeholder="Enter your name (e.g. priya_01)"
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value.trim())}
          />
          <button
            style={{ ...s.btn, ...s.btnPrimary, opacity: participantId ? 1 : 0.4 }}
            disabled={!participantId}
            onClick={() => setStarted(true)}
          >
            Start Recording
          </button>
        </div>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.title}>All done! Thank you, {participantId}</h1>
          <p style={s.subtitle}>All 40 clips have been saved.</p>
          {!evalStatus && (
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={runEvaluation}>
              Run Evaluation
            </button>
          )}
          {evalStatus?.status === "running" && (
            <p style={s.subtitle}>
              Running evaluation… {evalStatus.progress}/{evalStatus.total} clips processed
            </p>
          )}
          {evalStatus?.status === "complete" && (
            <>
              <p style={{ ...s.subtitle, color: "#22c55e" }}>Evaluation complete!</p>
              <a
                href={`${API_BASE}/eval/results/csv`}
                download="results.csv"
                style={{ ...s.btn, ...s.btnPrimary, textDecoration: "none", display: "inline-block" }}
              >
                Download results.csv
              </a>
            </>
          )}
          {evalStatus?.status === "error" && (
            <p style={{ ...s.subtitle, color: "#ef4444" }}>
              Evaluation failed. Check backend logs.
            </p>
          )}
          {errorMsg && <p style={s.error}>{errorMsg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.progressLabel}>
          Clip {clipIndex + 1} of {CLIPS.length} &nbsp;·&nbsp;
          Group {currentClip.group}: {GROUP_LABELS[currentClip.group]}
        </div>
        <div style={s.progressBar}>
          <div
            style={{
              ...s.progressFill,
              width: `${(clipIndex / CLIPS.length) * 100}%`,
            }}
          />
        </div>
        <p style={s.sentence}>{currentClip.text}</p>
        <div style={s.controls}>
          {clipState === "idle" && (
            <button style={{ ...s.btn, ...s.btnRed }} onClick={startRecording}>
              Record
            </button>
          )}
          {clipState === "recording" && (
            <button style={{ ...s.btn, ...s.btnStop }} onClick={stopRecording}>
              Stop
            </button>
          )}
          {(clipState === "stopped" || clipState === "error") && (
            <>
              <button style={{ ...s.btn, ...s.btnGray }} onClick={reRecord}>
                Re-record
              </button>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={uploadAndAdvance}>
                Next
              </button>
            </>
          )}
          {clipState === "uploading" && <p style={s.subtitle}>Uploading…</p>}
          {clipState === "done" && (
            <p style={{ ...s.subtitle, color: "#22c55e" }}>Saved</p>
          )}
        </div>
        {clipState === "recording" && (
          <p style={{ ...s.subtitle, color: "#ef4444" }}>Recording…</p>
        )}
        {errorMsg && <p style={s.error}>{errorMsg}</p>}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1e293b",
    borderRadius: 16,
    padding: "2.5rem",
    maxWidth: 600,
    width: "90%",
    boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
  },
  title: { color: "#f1f5f9", fontSize: "1.5rem", marginBottom: "0.75rem" },
  subtitle: { color: "#94a3b8", marginBottom: "1.5rem" },
  sentence: {
    color: "#f8fafc",
    fontSize: "1.6rem",
    fontWeight: 600,
    lineHeight: 1.5,
    marginBottom: "2rem",
    textAlign: "center",
  },
  progressLabel: { color: "#64748b", fontSize: "0.85rem", marginBottom: "0.5rem" },
  progressBar: { height: 6, background: "#334155", borderRadius: 3, marginBottom: "2rem" },
  progressFill: { height: "100%", background: "#3b82f6", borderRadius: 3, transition: "width 0.3s" },
  controls: { display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "1rem" },
  btn: {
    padding: "0.75rem 1.5rem",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
  },
  btnPrimary: { background: "#3b82f6", color: "#fff" },
  btnRed: { background: "#ef4444", color: "#fff" },
  btnStop: { background: "#f97316", color: "#fff" },
  btnGray: { background: "#475569", color: "#fff" },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f1f5f9",
    fontSize: "1rem",
    marginBottom: "1.5rem",
    boxSizing: "border-box",
  },
  error: { color: "#ef4444", marginTop: "0.5rem", textAlign: "center" },
};
