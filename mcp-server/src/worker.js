// Cloudflare Worker entry. Two jobs:
//   1. MCP server for Ingram (POST /mcp, GET /health) — same logic as the Node
//      server, adapted to the Workers fetch handler (no ports, no filesystem).
//   2. Token-safe Ingram proxy for the browser frontend (POST /api/run,
//      POST /api/approve). The Ingram admin token lives only here as a secret;
//      it never reaches the browser. SSE from Ingram is streamed straight through.
import { handleMcp } from "./core.js";
import clients from "../data/clients.json" with { type: "json" };
import vatRules from "../data/vat-rules.json" with { type: "json" };
import services from "../data/services.json" with { type: "json" };

const data = { clients, vatRules, services };
const INGRAM = "https://api.cloud.ingram.tech";
const IC_VERSION = "2026-05-01";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const sseHeaders = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...cors };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });

function ingramHeaders(env) {
  return { Authorization: `Bearer ${env.INGRAM_TOKEN}`, "IC-Api-Version": IC_VERSION, "Content-Type": "application/json" };
}

export default {
  async fetch(request, env) {
    // Mirror Worker bindings onto process.env for the tool modules.
    globalThis.process = globalThis.process ?? {};
    globalThis.process.env = { ...(globalThis.process.env ?? {}), ...env };

    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (request.method === "GET" && pathname === "/health") {
      return json({ ok: true, clients: clients.length, services: services.length });
    }

    // --- MCP (called by Ingram, static-secret auth) ---
    if (request.method === "POST" && pathname === "/mcp") {
      if (request.headers.get("authorization") !== `Bearer ${env.MCP_AUTH_SECRET}`) {
        return json({ error: "Unauthorized" }, 401);
      }
      let body;
      try { body = await request.json(); }
      catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
      const response = await handleMcp(body, { data, prefix: env.TOOL_PREFIX ?? "wolf_" });
      return json(response);
    }

    // --- Frontend proxy: start a run (creates/reuses a smith, streams SSE) ---
    if (request.method === "POST" && pathname === "/api/run") {
      if (!env.INGRAM_TOKEN || !env.AGENT_ID) return json({ error: "Proxy not configured (INGRAM_TOKEN/AGENT_ID)" }, 500);
      let body; try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
      const message = body?.message;
      if (!message) return json({ error: "message required" }, 400);
      const threadId = body?.thread_id || `voice_${Date.now()}`;

      // Upsert a smith bound to our agent (stable external_id reuses it).
      const sRes = await fetch(`${INGRAM}/v1/smiths`, {
        method: "POST", headers: ingramHeaders(env),
        body: JSON.stringify({ external_id: "voice_invoice_wolf", display_name: "Voice Invoice", agent_id: env.AGENT_ID, model: "claude-sonnet-4-6", auto_memory: true })
      });
      if (!sRes.ok) return json({ error: "smith create failed", detail: await sRes.text() }, 502);
      const smith = await sRes.json();

      const runRes = await fetch(`${INGRAM}/v1/smiths/${smith.id}/runs`, {
        method: "POST", headers: ingramHeaders(env),
        body: JSON.stringify({ input: [{ role: "user", content: message }], thread_id: threadId, stream: true })
      });
      if (!runRes.ok) return json({ error: "run failed", detail: await runRes.text() }, 502);
      // Stream Ingram's SSE straight to the browser. run.started carries smith_id + run_id.
      return new Response(runRes.body, { headers: sseHeaders });
    }

    // --- Speech-to-text via Workers AI (Whisper). Body = raw audio bytes. ---
    if (request.method === "POST" && pathname === "/api/transcribe") {
      if (!env.AI) return json({ error: "AI binding not configured" }, 500);
      try {
        const buf = await request.arrayBuffer();
        if (!buf || buf.byteLength === 0) return json({ error: "empty audio" }, 400);
        const res = await env.AI.run("@cf/openai/whisper", { audio: [...new Uint8Array(buf)] });
        return json({ text: (res?.text ?? "").trim() });
      } catch (e) {
        return json({ error: "transcription failed", detail: String(e?.message ?? e) }, 502);
      }
    }

    // --- Frontend proxy: resolve an approval (resumes the run, streams SSE) ---
    if (request.method === "POST" && pathname === "/api/approve") {
      if (!env.INGRAM_TOKEN) return json({ error: "Proxy not configured" }, 500);
      let body; try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
      const { smith_id, run_id, approval_id, decision } = body ?? {};
      if (!smith_id || !run_id || !approval_id) return json({ error: "smith_id, run_id, approval_id required" }, 400);

      const res = await fetch(`${INGRAM}/v1/smiths/${smith_id}/runs/${run_id}/submit`, {
        method: "POST", headers: ingramHeaders(env),
        body: JSON.stringify({ kind: "approval_decision", approval_id, decision: decision || "approve", actor: env.APPROVAL_ACTOR || "voice-invoice-demo", stream: true })
      });
      if (!res.ok) return json({ error: "submit failed", detail: await res.text() }, 502);
      return new Response(res.body, { headers: sseHeaders });
    }

    return json({ error: "Not found" }, 404);
  }
};
