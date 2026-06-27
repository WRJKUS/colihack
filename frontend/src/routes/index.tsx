import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pencil, Plus, Check, Send, FileText, Loader2 } from "lucide-react";
import { createSmith, runInvoiceAgent, streamRun, approveToolCall } from "../../lib/ingram";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voice Invoice — Speak. Send. Done." },
      {
        name: "description",
        content:
          "Voice Invoice turns spoken job descriptions into PEPPOL e-invoices for Belgian field workers.",
      },
      { property: "og:title", content: "Voice Invoice" },
      {
        property: "og:description",
        content: "Speak a job, send a PEPPOL e-invoice.",
      },
    ],
  }),
  component: Index,
});

type Status = "Sent" | "Pending" | "Draft";
type Lang = "NL" | "FR" | "EN";
type Step = { label: string; done: boolean; running: boolean };

type LineItem = {
  description: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
};

type Invoice = {
  number: string;
  date: string;
  dueDate: string;
  seller: string;
  buyer: string;
  peppol: string;
  lines: LineItem[];
};

type RecentInvoice = {
  id: string;
  client: string;
  date: string;
  total: number;
  status: Status;
};

const EUR = (n: number) =>
  new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
  }).format(n);

const PLACEHOLDER: Record<Lang, string> = {
  NL: "bv. Boiler hersteld bij Martens Sanitair, 3 uur arbeid aan €65, onderdelen €87",
  FR: "ex. Chaudière réparée chez Martens Sanitair, 3 heures à 65€, pièces 87€",
  EN: "e.g. Fixed the boiler at Martens Sanitair, 3 hours labour at €65, parts €87",
};

const INITIAL_RECENT: RecentInvoice[] = [
  { id: "INV-2026-0041", client: "Martens Sanitair", date: "24 Jun", total: 412.5, status: "Sent" },
  { id: "INV-2026-0040", client: "De Vries Bouw", date: "22 Jun", total: 1284.0, status: "Sent" },
  { id: "INV-2026-0039", client: "Café Den Hoek", date: "20 Jun", total: 196.35, status: "Pending" },
  { id: "INV-2026-0038", client: "Janssens Elektriciteit", date: "18 Jun", total: 540.0, status: "Draft" },
  { id: "INV-2026-0037", client: "Bakkerij Vermeulen", date: "15 Jun", total: 327.8, status: "Sent" },
];

const statusDot: Record<Status, string> = {
  Sent: "bg-[#16A34A]",
  Pending: "bg-[#D97706]",
  Draft: "bg-slate-400",
};

const statusBadge: Record<Status, string> = {
  Sent: "bg-[#16A34A]/10 text-[#16A34A]",
  Pending: "bg-[#D97706]/10 text-[#D97706]",
  Draft: "bg-slate-200 text-slate-600",
};

// minimal Web Speech API type
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function Index() {
  const [lang, setLang] = useState<Lang>("NL");
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [stage, setStage] = useState<1 | 2 | 3 | 4>(1);
  const [steps, setSteps] = useState<Step[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [recent, setRecent] = useState<RecentInvoice[]>(INITIAL_RECENT);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const smithIdRef = useRef<string>("");
  const threadIdRef = useRef<string>("");
  const approvalIdRef = useRef<string>("");

  // Initialise Ingram smith on mount
  useEffect(() => {
    const agentId = import.meta.env.VITE_AGENT_ID as string;
    if (!agentId) return;
    createSmith("voice_invoice_demo", "Field Worker", agentId)
      .then((s: { id: string }) => { smithIdRef.current = s.id; })
      .catch(console.error);
  }, []);

  // --- recording (Web Speech API) ---
  const toggleRecord = () => {
    if (recording) {
      recogRef.current?.stop();
      setRecording(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      // Fallback demo: type out the placeholder
      setRecording(true);
      const demo = PLACEHOLDER[lang].replace(/^(bv\.|ex\.|e\.g\.) /, "");
      let i = 0;
      setTranscript("");
      const id = window.setInterval(() => {
        i += 2;
        setTranscript(demo.slice(0, i));
        if (i >= demo.length) {
          window.clearInterval(id);
          setRecording(false);
        }
      }, 30);
      return;
    }
    const rec = new Ctor();
    rec.lang = lang === "NL" ? "nl-BE" : lang === "FR" ? "fr-BE" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let text = "";
      for (let i = 0; i < ev.results.length; i++) {
        text += ev.results[i][0].transcript;
      }
      setTranscript(text);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recogRef.current = rec;
    rec.start();
    setRecording(true);
  };

  useEffect(() => () => recogRef.current?.stop(), []);

  // --- process: run the real Ingram agent ---
  const runAgent = async () => {
    setStage(2);
    setSteps([{ label: "Connecting to agent…", done: false, running: true }]);

    const smithId = smithIdRef.current;
    if (!smithId) {
      setSteps([{ label: "Agent not ready — check VITE_AGENT_ID", done: false, running: false }]);
      return;
    }

    threadIdRef.current = `thread_${Date.now()}`;
    let agentText = "";

    try {
      const response = await runInvoiceAgent(smithId, transcript, threadIdRef.current);

      await streamRun(response, {
        onDelta: (text) => {
          agentText += text;
          // Parse tool progress hints out of streaming text for step display
          const stepHints = [
            { key: "lookup_client", label: "Looking up client…" },
            { key: "get_vat_rate", label: "Determining VAT rate…" },
            { key: "create_invoice", label: "Creating invoice…" },
            { key: "validate_invoice", label: "Validating PEPPOL compliance…" },
          ];
          const matched = stepHints.find(h => agentText.toLowerCase().includes(h.key));
          if (matched) {
            setSteps(prev => {
              const already = prev.some(s => s.label === matched.label);
              if (already) return prev;
              return [...prev.map(s => ({ ...s, done: true, running: false })),
                { label: matched.label, done: false, running: true }];
            });
          }
        },
        onToolExecuting: (toolName) => {
          const labels: Record<string, string> = {
            lookup_client: "Client lookup…",
            get_vat_rate: "VAT rate check…",
            create_invoice: "Creating invoice…",
            validate_invoice: "Validating PEPPOL…",
            send_invoice: "Sending via PEPPOL…",
            book_entries: "Booking ledger entries…",
          };
          const label = labels[toolName] ?? `Running ${toolName}…`;
          setSteps(prev => [
            ...prev.map(s => ({ ...s, done: true, running: false })),
            { label, done: false, running: true },
          ]);
        },
        onToolCompleted: (toolName, result) => {
          // When create_invoice completes, populate the invoice preview
          if (toolName === "create_invoice" && result) {
            try {
              const data = typeof result === "string" ? JSON.parse(result) : result;
              if (data.document_id) {
                setInvoice({
                  number: data.invoice_number ?? `INV-${Date.now()}`,
                  date: data.issue_date ?? new Date().toLocaleDateString("nl-BE"),
                  dueDate: data.due_date ?? new Date(Date.now() + 30 * 86400000).toLocaleDateString("nl-BE"),
                  seller: import.meta.env.VITE_SELLER_NAME ?? "Your Company",
                  buyer: data.buyer ?? "Client",
                  peppol: "—",
                  lines: (data.lines ?? []).map((l: { description: string; quantity: number; unit_price: number; vat_rate: number }) => ({
                    description: l.description,
                    qty: l.quantity,
                    unitPrice: l.unit_price,
                    vatRate: l.vat_rate,
                  })),
                });
              }
            } catch {}
          }
          setSteps(prev => prev.map(s => s.running ? { ...s, done: true, running: false } : s));
        },
        onApprovalRequired: (approvalId) => {
          approvalIdRef.current = approvalId;
          setSteps(prev => prev.map(s => ({ ...s, done: true, running: false })));
          setStage(3);
        },
        onCompleted: () => {
          setSteps(prev => prev.map(s => ({ ...s, done: true, running: false })));
        },
        onError: (err) => {
          console.error("Agent error:", err);
          setSteps(prev => [...prev.map(s => ({ ...s, running: false })),
            { label: `Error: ${err}`, done: false, running: false }]);
        },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const totals = useMemo(() => {
    if (!invoice) return { excl: 0, vat: 0, incl: 0 };
    let excl = 0;
    let vat = 0;
    for (const l of invoice.lines) {
      const lt = l.qty * l.unitPrice;
      excl += lt;
      vat += (lt * l.vatRate) / 100;
    }
    return { excl, vat, incl: excl + vat };
  }, [invoice]);

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setInvoice((inv) =>
      inv ? { ...inv, lines: inv.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) } : inv,
    );
  };

  const send = async () => {
    if (!invoice) return;
    try {
      await approveToolCall(approvalIdRef.current);
    } catch (err) {
      console.error("Approval failed:", err);
    }
    const ts = new Date().toLocaleString("nl-BE");
    setSentAt(ts);
    setRecent((r) => [
      {
        id: invoice.number,
        client: invoice.buyer,
        date: new Date().toLocaleDateString("nl-BE", { day: "2-digit", month: "short" }),
        total: totals.incl,
        status: "Sent",
      },
      ...r,
    ]);
    setStage(4);
  };

  const reset = () => {
    setStage(1);
    setTranscript("");
    setSteps([]);
    setInvoice(null);
    setSentAt(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-800 text-[14px]" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 border-r border-slate-200 bg-white p-5 hidden md:flex md:flex-col">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#2563EB] flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-semibold text-slate-900 text-[15px]">Voice Invoice</h1>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2 px-1">
            Recent invoices
          </div>
          <div className="space-y-2 overflow-y-auto pr-1 -mr-1">
            {recent.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-slate-200 p-3 hover:border-slate-300 hover:shadow-sm transition cursor-pointer bg-white"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${statusDot[r.status]} shrink-0`} />
                    <span className="font-medium text-slate-900 truncate">{r.client}</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadge[r.status]}`}>
                    {r.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{r.date}</span>
                  <span className="font-medium text-slate-700">{EUR(r.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-6 md:p-10 overflow-x-hidden">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Panel 1 */}
            <Panel active={stage === 1} step={1} title="Voice input">
              <div className="flex flex-col items-center text-center py-4">
                <button
                  onClick={toggleRecord}
                  className={`relative w-28 h-28 rounded-full flex items-center justify-center transition shadow-sm ${
                    recording ? "bg-red-500 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  }`}
                  aria-label={recording ? "Stop recording" : "Start recording"}
                >
                  {recording && (
                    <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
                  )}
                  <Mic className="w-10 h-10 relative" />
                </button>
                <p className="mt-4 text-slate-600">
                  {recording ? "Listening…" : "Speak your job description"}
                </p>
                <div className="mt-3 flex items-center gap-1 text-xs">
                  {(["NL", "FR", "EN"] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`px-2 py-1 rounded transition ${
                        lang === l ? "bg-[#2563EB] text-white" : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {l === "NL" && "🇧🇪 "}
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={PLACEHOLDER[lang]}
                rows={4}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#2563EB]"
              />
              <div className="mt-4 flex justify-end">
                <button
                  disabled={!transcript.trim()}
                  onClick={runAgent}
                  className="bg-[#2563EB] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#1d4ed8] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition"
                >
                  Process
                </button>
              </div>
            </Panel>

            {/* Panel 2 */}
            {stage >= 2 && (
              <Panel active={stage === 2} step={2} title="Invoice preview">
                <ol className="space-y-2 mb-5">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-3 text-slate-700">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          s.done ? "bg-[#16A34A] text-white" : s.running ? "bg-slate-200" : "bg-slate-100"
                        }`}
                      >
                        {s.done ? (
                          <Check className="w-3 h-3" />
                        ) : s.running ? (
                          <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                        ) : null}
                      </span>
                      <span className={s.done || s.running ? "" : "text-slate-400"}>{s.label}</span>
                    </li>
                  ))}
                </ol>
                {invoice && (
                  <div className="rounded-lg border border-slate-200 p-5 bg-white">
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <div className="text-xs text-slate-500">Invoice</div>
                        <Editable
                          value={invoice.number}
                          onChange={(v) => setInvoice((inv) => (inv ? { ...inv, number: v } : inv))}
                          className="font-semibold text-slate-900 text-base"
                        />
                        <Editable
                          value={invoice.date}
                          onChange={(v) => setInvoice((inv) => (inv ? { ...inv, date: v } : inv))}
                          className="text-xs text-slate-500"
                        />
                      </div>
                      <FileText className="w-5 h-5 text-slate-300" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs mb-5">
                      <div>
                        <div className="text-slate-400 uppercase tracking-wider mb-1">From</div>
                        <Editable
                          value={invoice.seller}
                          onChange={(v) => setInvoice((inv) => (inv ? { ...inv, seller: v } : inv))}
                          className="font-medium text-slate-800"
                        />
                      </div>
                      <div>
                        <div className="text-slate-400 uppercase tracking-wider mb-1">To</div>
                        <Editable
                          value={invoice.buyer}
                          onChange={(v) => setInvoice((inv) => (inv ? { ...inv, buyer: v } : inv))}
                          className="font-medium text-slate-800"
                        />
                        <div className="text-slate-500 mt-0.5">{invoice.peppol}</div>
                      </div>
                    </div>
                    <table className="w-full text-xs mb-4">
                      <thead>
                        <tr className="text-left text-slate-400 uppercase tracking-wider border-b border-slate-200">
                          <th className="py-2 font-medium">Description</th>
                          <th className="py-2 font-medium text-right w-12">Qty</th>
                          <th className="py-2 font-medium text-right w-20">Unit</th>
                          <th className="py-2 font-medium text-right w-12">VAT</th>
                          <th className="py-2 font-medium text-right w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.lines.map((l, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-2">
                              <Editable value={l.description} onChange={(v) => updateLine(i, { description: v })} />
                            </td>
                            <td className="py-2 text-right">
                              <EditableNum value={l.qty} onChange={(v) => updateLine(i, { qty: v })} />
                            </td>
                            <td className="py-2 text-right">
                              <EditableNum value={l.unitPrice} onChange={(v) => updateLine(i, { unitPrice: v })} />
                            </td>
                            <td className="py-2 text-right text-slate-500">{l.vatRate}%</td>
                            <td className="py-2 text-right font-medium text-slate-800">
                              {EUR(l.qty * l.unitPrice)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex flex-col items-end text-xs space-y-1">
                      <div className="flex justify-between w-48">
                        <span className="text-slate-500">Excl. VAT</span>
                        <span>{EUR(totals.excl)}</span>
                      </div>
                      <div className="flex justify-between w-48">
                        <span className="text-slate-500">VAT (21%)</span>
                        <span>{EUR(totals.vat)}</span>
                      </div>
                      <div className="flex justify-between w-48 pt-1 border-t border-slate-200 font-semibold text-slate-900 text-sm">
                        <span>Total</span>
                        <span>{EUR(totals.incl)}</span>
                      </div>
                    </div>
                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Payment due: {invoice.dueDate}</span>
                      <button
                        onClick={reset}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
                      >
                        <Pencil className="w-3 h-3" /> Edit transcript
                      </button>
                    </div>
                  </div>
                )}
                {invoice && stage === 2 && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => setStage(3)}
                      className="bg-[#2563EB] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#1d4ed8] transition"
                    >
                      Continue
                    </button>
                  </div>
                )}
              </Panel>
            )}

            {/* Panel 3 */}
            {stage >= 3 && invoice && (
              <Panel active={stage === 3} step={3} title="Approval">
                <div className="rounded-lg bg-[#FEF3C7] border border-[#F59E0B]/30 p-5">
                  <div className="font-semibold text-[#92400E] text-base mb-1">
                    Ready to send via PEPPOL
                  </div>
                  <div className="text-sm text-[#92400E]/80 mb-4">
                    {invoice.buyer} · {EUR(totals.incl)} · {invoice.peppol}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={send}
                      disabled={stage !== 3}
                      className="inline-flex items-center gap-2 bg-[#16A34A] hover:bg-[#15803D] text-white px-5 py-3 rounded-lg font-semibold transition disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" /> Approve & Send
                    </button>
                    <button
                      onClick={() => setStage(2)}
                      disabled={stage !== 3}
                      className="text-slate-600 hover:text-slate-800 text-sm px-3 py-2"
                    >
                      Edit invoice
                    </button>
                  </div>
                  <p className="text-xs text-[#92400E]/70 mt-4">
                    This action sends the invoice directly to the client's PEPPOL inbox.
                  </p>
                </div>
              </Panel>
            )}

            {/* Panel 4 */}
            {stage === 4 && invoice && (
              <Panel active step={4} title="Sent & booked">
                <div className="rounded-lg bg-[#DCFCE7] border border-[#16A34A]/30 p-4 flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-full bg-[#16A34A] flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-[#166534]">Invoice sent via PEPPOL</div>
                    <div className="text-xs text-[#166534]/80">{sentAt}</div>
                  </div>
                </div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium mb-2">
                  Double-entry bookkeeping
                </div>
                <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Account</th>
                      <th className="text-left py-2 px-3 font-medium">Type</th>
                      <th className="text-right py-2 px-3 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2 px-3">400 Accounts Receivable</td>
                      <td className="py-2 px-3 text-slate-500">Debit</td>
                      <td className="py-2 px-3 text-right font-medium">{EUR(totals.incl)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">700 Revenue</td>
                      <td className="py-2 px-3 text-slate-500">Credit</td>
                      <td className="py-2 px-3 text-right font-medium">{EUR(totals.excl)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">451 VAT Payable</td>
                      <td className="py-2 px-3 text-slate-500">Credit</td>
                      <td className="py-2 px-3 text-right font-medium">{EUR(totals.vat)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={reset}
                    className="inline-flex items-center gap-2 bg-[#2563EB] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#1d4ed8] transition"
                  >
                    <Plus className="w-4 h-4" /> New invoice
                  </button>
                </div>
              </Panel>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Panel({
  active,
  step,
  title,
  children,
}: {
  active: boolean;
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`bg-white rounded-xl border p-6 transition ${
        active ? "border-slate-200 shadow-sm" : "border-slate-200/70 opacity-90"
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium flex items-center justify-center">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Editable({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#2563EB] focus:outline-none px-0.5 -mx-0.5 w-full ${className}`}
    />
  );
}

function EditableNum({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#2563EB] focus:outline-none w-16 text-right px-0.5"
    />
  );
}
