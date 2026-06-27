import { useRef, useState } from "react";
import { runAgent, resolveApproval, transcribe, AgentEvent, RunIds } from "./lib/agent";
import { getDocument, ublDownloadUrl, triggerDownload } from "./lib/doc";
import { downloadInvoicePDF } from "./lib/pdf";
import Manage from "./Manage";
import Invoices from "./Invoices";

// Encode captured Float32 audio chunks as a 16-bit PCM WAV Blob (Whisper-friendly).
function encodeWAV(chunks: Float32Array[], sampleRate: number): Blob {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const samples = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { samples.set(c, off); off += c.length; }
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); wr(8, "WAVE");
  wr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wr(36, "data"); view.setUint32(40, samples.length * 2, true);
  let p = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true); p += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

type Step = "input" | "processing" | "approval" | "done";

const TOOL_LABEL: Record<string, string> = {
  wolf_lookup_client: "Looking up client",
  wolf_get_vat_rate: "Determining VAT rate",
  wolf_lookup_service: "Pricing work item",
  wolf_validate_invoice: "Validating (PEPPOL/EN16931)",
  wolf_create_invoice: "Creating invoice",
  wolf_send_invoice: "Sending via PEPPOL",
  wolf_book_entries: "Booking ledger entries"
};
const label = (t: string) => TOOL_LABEL[t] ?? t;

export default function App() {
  const [view, setView] = useState<"invoice" | "invoices" | "manage">("invoice");
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const audioRef = useRef<any>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [agentText, setAgentText] = useState("");
  const [ids, setIds] = useState<RunIds>({ smith_id: "", run_id: "" });
  const [approvalArgs, setApprovalArgs] = useState<any>(null);
  const [documentId, setDocumentId] = useState("");
  const [docBusy, setDocBusy] = useState(false);
  const [error, setError] = useState("");
  const idsRef = useRef<RunIds>({ smith_id: "", run_id: "" });

  const handleEvent = (ev: AgentEvent) => {
    switch (ev.type) {
      case "run.started":
        idsRef.current = { ...idsRef.current, smith_id: ev.smith_id, run_id: ev.run_id };
        setIds(idsRef.current);
        break;
      case "tool.executing":
        setSteps((s) => [...s, ev.tool]);
        break;
      case "message.delta":
        setAgentText((t) => t + (ev.delta ?? ""));
        break;
      case "approval.required":
        idsRef.current = { ...idsRef.current, approval_id: ev.approval_id };
        setIds(idsRef.current);
        setApprovalArgs(ev.args);
        if (ev.args?.document_id) setDocumentId(ev.args.document_id);
        setStep("approval");
        break;
      case "run.failed":
        setError(ev.error || "Run failed");
        break;
    }
  };

  // Record mic audio with the Web Audio API (works on Chromium/Firefox, unlike
  // the Google Web Speech API) and transcribe server-side via Workers AI Whisper.
  const startRec = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (e: any) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(processor);
      processor.connect(ctx.destination);
      audioRef.current = { stream, ctx, source, processor, chunks };
      setRecording(true);
    } catch (e: any) {
      setError("Microphone access failed: " + (e?.message ?? String(e)) + " — or just type below.");
    }
  };

  const stopRec = async () => {
    const a = audioRef.current;
    if (!a) return;
    a.processor.disconnect();
    a.source.disconnect();
    a.stream.getTracks().forEach((t: any) => t.stop());
    const rate = a.ctx.sampleRate;
    await a.ctx.close();
    audioRef.current = null;
    setRecording(false);

    const wav = encodeWAV(a.chunks, rate);
    if (wav.size < 2000) { setError("No audio captured — try again, or type below."); return; }
    setTranscribing(true);
    try {
      const text = await transcribe(wav);
      if (text) setTranscript(text);
      else setError("Transcription came back empty — speak a bit longer, or type below.");
    } catch (e: any) {
      setError("Transcription failed: " + (e?.message ?? String(e)) + " — type below instead.");
    }
    setTranscribing(false);
  };

  const toggleMic = () => { if (transcribing) return; recording ? stopRec() : startRec(); };

  const process = async () => {
    if (!transcript.trim()) return;
    setError(""); setSteps([]); setAgentText("");
    idsRef.current = { smith_id: "", run_id: "" };
    setIds(idsRef.current); setApprovalArgs(null);
    setStep("processing");
    try {
      await runAgent(transcript, handleEvent);
      setStep((s) => (s === "approval" ? s : "done"));
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStep("input");
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    setStep("processing");
    try {
      await resolveApproval(idsRef.current, decision, handleEvent);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setStep("done");
  };

  const downloadPdf = async () => {
    if (!documentId) return;
    setDocBusy(true);
    try {
      const doc = await getDocument(documentId);
      downloadInvoicePDF(doc);
    } catch (e: any) {
      setError("Could not build PDF: " + (e?.message ?? String(e)));
    }
    setDocBusy(false);
  };
  const downloadUbl = () => { if (documentId) triggerDownload(ublDownloadUrl(documentId)); };

  const Downloads = () => documentId ? (
    <div className="downloads">
      <button className="ghost sm" onClick={downloadPdf} disabled={docBusy}>{docBusy ? "Building…" : "⬇ Download PDF"}</button>
      <button className="ghost sm" onClick={downloadUbl}>⬇ Download UBL (XML)</button>
    </div>
  ) : null;

  const reset = () => {
    setStep("input"); setTranscript(""); setSteps([]); setAgentText("");
    setApprovalArgs(null); setDocumentId(""); setError("");
    idsRef.current = { smith_id: "", run_id: "" };
    setIds(idsRef.current);
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">🎙️ Voice Invoice</span>
        <span className="sub">Belgian field-worker invoicing · PEPPOL</span>
        <nav className="nav">
          <button className={view === "invoice" ? "on" : ""} onClick={() => setView("invoice")}>New invoice</button>
          <button className={view === "invoices" ? "on" : ""} onClick={() => setView("invoices")}>Invoices</button>
          <button className={view === "manage" ? "on" : ""} onClick={() => setView("manage")}>Manage data</button>
        </nav>
      </header>

      {view === "invoices" && <main className="main"><Invoices /></main>}
      {view === "manage" && <main className="main"><Manage /></main>}

      {view === "invoice" && (
      <main className="main">
        {error && <div className="error">⚠️ {error}</div>}

        {/* Panel 1: input */}
        {step === "input" && (
          <section className="card">
            <div className="mic-row">
              <button className={`mic ${recording ? "rec" : ""}`} onClick={toggleMic} disabled={transcribing}>
                {transcribing ? "…" : recording ? "■" : "🎤"}
              </button>
              <div>
                <p className="hint">
                  {transcribing ? "Transcribing…" : recording ? "Listening — tap to stop" : "Tap to speak your job description"}
                </p>
                <p className="micnote">Server-side Whisper (works on Chromium) · or just type below</p>
              </div>
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="e.g. Invoice Proximus for 1 hour of work plus the drive, for fixing their toilet."
            />
            <button className="primary" disabled={!transcript.trim()} onClick={process}>
              Process invoice →
            </button>
          </section>
        )}

        {/* Progress + live agent text (shown while processing / approval / done) */}
        {step !== "input" && (
          <section className="card">
            <h3>Agent</h3>
            <ol className="steps">
              {steps.map((t, i) => (
                <li key={i}>
                  <span className="check">{i < steps.length - 1 || step !== "processing" ? "✓" : "…"}</span>
                  {label(t)}
                </li>
              ))}
              {step === "processing" && steps.length === 0 && <li><span className="check">…</span>Thinking…</li>}
            </ol>
            {agentText && <div className="agent-msg">{agentText}</div>}
          </section>
        )}

        {/* Panel 3: approval */}
        {step === "approval" && approvalArgs && (
          <section className="card approval">
            <h3>⚠️ Ready to send via PEPPOL</h3>
            <dl>
              <div><dt>Document</dt><dd>{approvalArgs.document_id}</dd></div>
              <div><dt>Recipient PEPPOL</dt><dd>{approvalArgs.receiver_peppol_id}</dd></div>
              {approvalArgs.email && <div><dt>Email</dt><dd>{approvalArgs.email}</dd></div>}
            </dl>
            <p className="warn">Approving sends the invoice to the client’s PEPPOL inbox — this is real.</p>
            <Downloads />
            <div className="btn-row">
              <button className="success" onClick={() => decide("approve")}>Approve &amp; Send</button>
              <button className="ghost" onClick={() => decide("reject")}>Reject</button>
            </div>
          </section>
        )}

        {/* Panel 4: done */}
        {step === "done" && (
          <section className="card done">
            <h3>✅ Done</h3>
            <p className="muted">The agent’s final response (including bookkeeping) is shown above.</p>
            <Downloads />
            <button className="primary" onClick={reset}>New invoice</button>
          </section>
        )}
      </main>
      )}
    </div>
  );
}
