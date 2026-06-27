// Corrected Ingram client for the Lovable frontend.
//
// CHANGES vs the original (which did not work):
//  - The Ingram admin token is NO LONGER in the browser. All calls go through
//    the Worker proxy (/api/run, /api/approve), which holds the token as a
//    server-side secret. Set VITE_PROXY_BASE to the Worker URL.
//  - SSE is parsed from the `event:` line — the real Ingram format. The previous
//    code read `event.type` from the `data` JSON, which never exists, so no
//    events ever matched.
//  - Approvals resolve via the proxy → POST /v1/smiths/{smith_id}/runs/{run_id}/submit
//    with { kind:"approval_decision", approval_id, decision, actor }. The old
//    POST /v1/approvals/{id}/submit endpoint does not exist.
//  - Smith creation happens server-side in the proxy; the browser no longer
//    creates smiths or holds an agent id.

const PROXY_BASE =
  (import.meta as any).env?.VITE_PROXY_BASE ||
  "https://einvoice-wolf.riegler31.workers.dev";

export interface RunIds {
  smith_id: string;
  run_id: string;
  approval_id?: string;
}

export interface StreamCallbacks {
  onStarted?: (ids: { smith_id: string; run_id: string; thread_id: string }) => void;
  onTool?: (tool: string, phase: "executing" | "completed") => void;
  onDelta?: (text: string) => void;
  onApprovalRequired?: (info: RunIds & { tool: string; args: any }) => void;
  onCompleted?: (stopReason: string) => void;
  onError?: (err: string) => void;
}

// Start a run from the spoken/typed message. Returns the streaming Response.
export async function runInvoiceAgent(message: string, threadId?: string) {
  return fetch(`${PROXY_BASE}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId })
  });
}

// Resolve a send approval. decision "approve" actually sends over PEPPOL.
export async function approveToolCall(ids: RunIds, decision: "approve" | "reject" = "approve") {
  return fetch(`${PROXY_BASE}/api/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      smith_id: ids.smith_id,
      run_id: ids.run_id,
      approval_id: ids.approval_id,
      decision
    })
  });
}

// Consume an Ingram SSE stream. The event NAME is on the `event:` line; the
// `data:` line is JSON like { v, run_id, delta | tool | stop_reason | ... }.
export async function streamRun(response: Response, cb: StreamCallbacks) {
  if (!response.ok) {
    cb.onError?.(`${response.status} ${await response.text().catch(() => "")}`);
    return;
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | null = null;
  let smithId = "";
  let runId = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event:")) { event = line.slice(6).trim(); continue; }
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      let data: any;
      try { data = JSON.parse(payload); } catch { continue; }

      switch (event) {
        case "run.started":
          smithId = data.smith_id; runId = data.run_id;
          cb.onStarted?.({ smith_id: smithId, run_id: runId, thread_id: data.thread_id });
          break;
        case "tool.executing":
          cb.onTool?.(data.tool, "executing");
          break;
        case "tool.completed":
          cb.onTool?.(data.tool, "completed");
          break;
        case "message.delta":
          cb.onDelta?.(data.delta ?? "");
          break;
        case "approval.required":
          cb.onApprovalRequired?.({
            smith_id: data.smith_id ?? smithId, run_id: data.run_id ?? runId,
            approval_id: data.approval_id, tool: data.tool, args: data.args
          });
          break;
        case "run.completed":
          cb.onCompleted?.(data.stop_reason);
          break;
        case "run.failed":
          cb.onError?.(data.error ?? "Run failed");
          break;
      }
    }
  }
}
