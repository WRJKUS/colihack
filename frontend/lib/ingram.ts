const BASE_URL = (import.meta as { env: Record<string, string> }).env?.DEV
  ? "/api/ingram"
  : "https://api.cloud.ingram.tech/v1";
const API_KEY = (import.meta as { env: Record<string, string> }).env?.VITE_INGRAM_TOKEN ?? "";

const headers = () => ({
  Authorization: `Bearer ${API_KEY}`,
  "IC-Api-Version": "2026-05-01",
  "Content-Type": "application/json",
});

export async function createSmith(externalId: string, displayName: string, agentId: string) {
  const res = await fetch(`${BASE_URL}/smiths`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      external_id: externalId,
      display_name: displayName,
      agent_id: agentId,
      model: "claude-sonnet-4-6",
      auto_memory: true,
    }),
  });
  return res.json();
}

export async function runInvoiceAgent(smithId: string, transcript: string, threadId: string) {
  return fetch(`${BASE_URL}/smiths/${smithId}/runs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      input: [{ role: "user", content: transcript }],
      thread_id: threadId,
      stream: true,
    }),
  });
}

export interface StreamCallbacks {
  onDelta?: (text: string) => void;
  onToolExecuting?: (toolName: string) => void;
  onToolCompleted?: (toolName: string, result: unknown) => void;
  onApprovalRequired?: (approvalId: string) => void;
  onCompleted?: () => void;
  onError?: (err: string) => void;
}

export async function streamRun(response: Response, callbacks: StreamCallbacks) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEventType = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        switch (currentEventType) {
          case "message.delta":
            callbacks.onDelta?.(data.delta ?? "");
            break;
          case "tool.executing":
            callbacks.onToolExecuting?.(data.tool ?? "");
            break;
          case "tool.completed":
            callbacks.onToolCompleted?.(data.tool ?? "", data.result);
            break;
          case "approval.required":
            callbacks.onApprovalRequired?.(data.approval_id);
            break;
          case "run.completed":
            callbacks.onCompleted?.();
            break;
          case "run.failed":
            callbacks.onError?.(data.error ?? "Run failed");
            break;
        }
        currentEventType = "";
      } catch {}
    }
  }
}

export async function approveToolCall(approvalId: string) {
  const res = await fetch(`${BASE_URL}/approvals/${approvalId}/submit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ decision: "approve" }),
  });
  return res.json();
}
