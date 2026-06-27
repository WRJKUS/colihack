const BASE_URL = "https://api.cloud.ingram.tech/v1";
const API_KEY = process.env.NEXT_PUBLIC_INGRAM_TOKEN ?? "";

const headers = () => ({
  Authorization: `Bearer ${API_KEY}`,
  "IC-Api-Version": "2026-05-01",
  "Content-Type": "application/json"
});

// Call once per user on page load — safe to call repeatedly (upsert)
export async function createSmith(externalId: string, displayName: string, agentId: string) {
  const res = await fetch(`${BASE_URL}/smiths`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      external_id: externalId,
      display_name: displayName,
      agent_id: agentId,
      model: "claude-sonnet-4-6",
      auto_memory: true
    })
  });
  return res.json();
}

// Send transcript to agent — returns raw Response for SSE streaming
export async function runInvoiceAgent(smithId: string, transcript: string, threadId: string) {
  return fetch(`${BASE_URL}/smiths/${smithId}/runs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      input: [{ role: "user", content: transcript }],
      thread_id: threadId,
      stream: true
    })
  });
}

export interface StreamCallbacks {
  onDelta?: (text: string) => void;
  onApprovalRequired?: (approvalId: string) => void;
  onCompleted?: () => void;
  onError?: (err: string) => void;
}

// Consume SSE stream from runInvoiceAgent response
export async function streamRun(response: Response, callbacks: StreamCallbacks) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "message.delta") {
          callbacks.onDelta?.(event.delta ?? "");
        } else if (event.type === "approval.required") {
          callbacks.onApprovalRequired?.(event.approval_id);
        } else if (event.type === "run.completed") {
          callbacks.onCompleted?.();
        } else if (event.type === "run.failed") {
          callbacks.onError?.(event.error ?? "Run failed");
        }
      } catch {}
    }
  }
}

// Approve the send_invoice tool call — one click = invoice sent
export async function approveToolCall(approvalId: string) {
  const res = await fetch(`${BASE_URL}/approvals/${approvalId}/submit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ decision: "approve" })
  });
  return res.json();
}
