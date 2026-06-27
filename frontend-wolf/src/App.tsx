import { useRef, useState } from "react";
import { runAgent, resolveApproval, AgentEvent, RunIds } from "./lib/agent";

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
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [lang, setLang] = useState("nl-BE");
  const [recording, setRecording] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [agentText, setAgentText] = useState("");
  const [ids, setIds] = useState<RunIds>({ smith_id: "", run_id: "" });
  const [approvalArgs, setApprovalArgs] = useState<any>(null);
  const [error, setError] = useState("");
  const recRef = useRef<any>(null);
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
        setStep("approval");
        break;
      case "run.failed":
        setError(ev.error || "Run failed");
        break;
    }
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Speech recognition needs Chrome (Web Speech API)."); return; }
    if (recording) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setTranscript(t);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recRef.current = rec;
    rec.start();
    setRecording(true);
  };

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

  const reset = () => {
    setStep("input"); setTranscript(""); setSteps([]); setAgentText("");
    setApprovalArgs(null); setError("");
    idsRef.current = { smith_id: "", run_id: "" };
    setIds(idsRef.current);
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">🎙️ Voice Invoice</span>
        <span className="sub">Belgian field-worker invoicing · PEPPOL</span>
      </header>

      <main className="main">
        {error && <div className="error">⚠️ {error}</div>}

        {/* Panel 1: input */}
        {step === "input" && (
          <section className="card">
            <div className="mic-row">
              <button className={`mic ${recording ? "rec" : ""}`} onClick={toggleMic}>
                {recording ? "■" : "🎤"}
              </button>
              <div>
                <p className="hint">{recording ? "Listening…" : "Tap to speak your job description"}</p>
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="nl-BE">🇧🇪 Nederlands</option>
                  <option value="fr-BE">🇧🇪 Français</option>
                  <option value="en-GB">🇬🇧 English</option>
                </select>
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
            <button className="primary" onClick={reset}>New invoice</button>
          </section>
        )}
      </main>
    </div>
  );
}
