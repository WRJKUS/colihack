// Ingram Cloud client — point Vercel AI SDK at Ingram's OpenAI-compatible endpoint
export const ingramConfig = {
  baseURL: "https://api.cloud.ingram.tech/v1",
  apiKey: process.env.NEXT_PUBLIC_INGRAM_TOKEN ?? "",
  defaultHeaders: {
    "IC-Api-Version": "2026-05-01"
  }
};

export async function createSmith(externalId: string, displayName: string) {
  const res = await fetch(`${ingramConfig.baseURL}/smiths`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingramConfig.apiKey}`,
      "IC-Api-Version": "2026-05-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_id: externalId,
      display_name: displayName,
      model: "claude-sonnet-4-6"
    })
  });
  return res.json();
}

export async function runInvoiceAgent(smithId: string, transcript: string, threadId: string) {
  const res = await fetch(`${ingramConfig.baseURL}/smiths/${smithId}/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingramConfig.apiKey}`,
      "IC-Api-Version": "2026-05-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      input: [{ role: "user", content: transcript }],
      thread_id: threadId,
      stream: true
    })
  });
  return res; // SSE stream — consume with EventSource or ReadableStream
}

export async function approveToolCall(smithId: string, runId: string, approvalId: string) {
  const res = await fetch(`${ingramConfig.baseURL}/smiths/${smithId}/runs/${runId}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingramConfig.apiKey}`,
      "IC-Api-Version": "2026-05-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      kind: "approval_decision",
      approval_id: approvalId,
      decision: "approve"
    })
  });
  return res.json();
}
