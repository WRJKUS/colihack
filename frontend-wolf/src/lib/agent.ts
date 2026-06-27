// Client for the token-safe Worker proxy. The browser never sees the Ingram
// token — it calls /api/run and /api/approve on the Worker, which forwards to
// Ingram with the secret. SSE is parsed from the `event:` line (the real Ingram
// format), NOT a `type` field inside `data`.

const BASE =
  (import.meta as any).env?.VITE_PROXY_BASE ||
  "https://einvoice-wolf.riegler31.workers.dev";

export type AgentEvent =
  | { type: "run.started"; run_id: string; smith_id: string; thread_id: string }
  | { type: "message.delta"; delta: string }
  | { type: "tool.executing"; tool: string }
  | { type: "tool.completed"; tool: string }
  | { type: "approval.required"; approval_id: string; tool: string; args: any; tool_call_id: string }
  | { type: "run.paused" }
  | { type: "run.completed"; stop_reason: string }
  | { type: "run.failed"; error?: string }
  | { type: string; [k: string]: any };

async function consume(res: Response, onEvent: (ev: AgentEvent) => void) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let cur: string | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event:")) { cur = line.slice(6).trim(); continue; }
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      let data: any;
      try { data = JSON.parse(payload); } catch { continue; }
      if (cur) onEvent({ type: cur, ...data });
    }
  }
}

// Send recorded audio (WAV) to the Worker's Whisper endpoint; returns transcript.
export async function transcribe(wav: Blob): Promise<string> {
  const res = await fetch(`${BASE}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: wav
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j.text || "";
}

export interface RunIds { smith_id: string; run_id: string; approval_id?: string; }

/** Start a run from a spoken/typed message; streams events until paused or done. */
export async function runAgent(message: string, onEvent: (ev: AgentEvent) => void) {
  const res = await fetch(`${BASE}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  await consume(res, onEvent);
}

/** Resolve the send approval. decision "approve" actually sends over PEPPOL. */
export async function resolveApproval(
  ids: RunIds,
  decision: "approve" | "reject",
  onEvent: (ev: AgentEvent) => void
) {
  const res = await fetch(`${BASE}/api/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      smith_id: ids.smith_id,
      run_id: ids.run_id,
      approval_id: ids.approval_id,
      decision
    })
  });
  await consume(res, onEvent);
}
