// Cloudflare Worker entry. Three jobs:
//   1. MCP server for Ingram (POST /mcp, GET /health).
//   2. Token-safe Ingram proxy for the browser (POST /api/run, /api/approve)
//      + speech-to-text (POST /api/transcribe via Workers AI Whisper).
//   3. Writable CRUD store (Phase 1.5) for customers / services / seller, backed
//      by Cloudflare KV. The bundled JSON files are the seed; once edited, KV is
//      the source of truth that the MCP lookup tools read from.
import { handleMcp } from "./core.js";
import clients from "../data/clients.json" with { type: "json" };
import vatRules from "../data/vat-rules.json" with { type: "json" };
import services from "../data/services.json" with { type: "json" };

const INGRAM = "https://api.cloud.ingram.tech";
const IC_VERSION = "2026-05-01";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const sseHeaders = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...cors };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
const ingramHeaders = (env) => ({ Authorization: `Bearer ${env.INGRAM_TOKEN}`, "IC-Api-Version": IC_VERSION, "Content-Type": "application/json" });
const addrStr = (a) => !a ? "" : (typeof a === "string" ? a : [a.street, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", "));

// --- Store (KV with bundled-seed fallback) ---
const custId = (c) => c.id ?? ("cus_" + String(c.peppol_id || c.name || "").replace(/[^a-zA-Z0-9]/g, ""));
const svcId = (s) => s.id ?? ("svc_" + String(s.code || s.label || "").replace(/[^a-zA-Z0-9]/g, ""));

async function loadCollection(env, key, seed, idFn) {
  const kv = env.STORE ? await env.STORE.get(key, "json") : null;
  return (kv ?? seed).map((x) => ({ ...x, id: x.id ?? idFn(x) }));
}
async function loadSeller(env) {
  const kv = env.STORE ? await env.STORE.get("seller", "json") : null;
  if (kv) return kv;
  const scheme = env.SENDER_PEPPOL_SCHEME || "0208";
  return {
    name: env.SELLER_NAME, vat_number: env.SELLER_VAT, peppol_scheme: scheme,
    peppol_id: env.SENDER_PEPPOL_ID ? `${scheme}:${env.SENDER_PEPPOL_ID}` : "",
    address: env.SELLER_ADDRESS || "", contact_email: env.SELLER_EMAIL || "",
    iban: env.SELLER_IBAN || "", default_payment_terms_days: 30
  };
}

async function handleCollection(request, env, key, seed, idPrefix, idFn) {
  const list = await loadCollection(env, key, seed, idFn);
  if (request.method === "GET") return json(list);
  if (!env.STORE) return json({ error: "store (KV) not configured" }, 500);

  if (request.method === "POST") {
    const item = await request.json();
    item.id = `${idPrefix}${crypto.randomUUID()}`;
    list.push(item);
    await env.STORE.put(key, JSON.stringify(list));
    return json(item, 201);
  }
  if (request.method === "PUT") {
    const item = await request.json();
    if (!item.id) return json({ error: "id required" }, 400);
    const i = list.findIndex((x) => x.id === item.id);
    if (i < 0) return json({ error: "not found" }, 404);
    list[i] = item;
    await env.STORE.put(key, JSON.stringify(list));
    return json(item);
  }
  if (request.method === "DELETE") {
    let id = new URL(request.url).searchParams.get("id");
    if (!id) { try { id = (await request.json()).id; } catch { /* */ } }
    const next = list.filter((x) => x.id !== id);
    await env.STORE.put(key, JSON.stringify(next));
    return json({ deleted: id, count: next.length });
  }
  return json({ error: "method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    globalThis.process = globalThis.process ?? {};
    globalThis.process.env = { ...(globalThis.process.env ?? {}), ...env };

    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (request.method === "GET" && pathname === "/health") {
      const cs = await loadCollection(env, "customers", clients, custId);
      const sv = await loadCollection(env, "services", services, svcId);
      return json({ ok: true, clients: cs.length, services: sv.length });
    }

    // --- MCP (called by Ingram) — tools + seller read from the live store ---
    if (request.method === "POST" && pathname === "/mcp") {
      if (request.headers.get("authorization") !== `Bearer ${env.MCP_AUTH_SECRET}`) {
        return json({ error: "Unauthorized" }, 401);
      }
      let body;
      try { body = await request.json(); }
      catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

      // Inject the (possibly edited) seller so create_invoice uses it.
      const seller = await loadSeller(env);
      Object.assign(process.env, {
        SELLER_NAME: seller.name, SELLER_VAT: seller.vat_number,
        SENDER_PEPPOL_SCHEME: (seller.peppol_id || "").split(":")[0] || seller.peppol_scheme || "0208",
        SENDER_PEPPOL_ID: (seller.peppol_id || "").split(":")[1] || "",
        SELLER_ADDRESS: addrStr(seller.address), SELLER_EMAIL: seller.contact_email || "", SELLER_IBAN: seller.iban || ""
      });

      const liveData = {
        clients: await loadCollection(env, "customers", clients, custId),
        vatRules,
        services: await loadCollection(env, "services", services, svcId)
      };
      const response = await handleMcp(body, { data: liveData, prefix: env.TOOL_PREFIX ?? "wolf_" });
      return json(response);
    }

    // --- CRUD store (Phase 1.5) — open for the demo UI (no MCP secret in browser) ---
    if (pathname === "/api/customers") return handleCollection(request, env, "customers", clients, "cus_", custId);
    if (pathname === "/api/services") return handleCollection(request, env, "services", services, "svc_", svcId);
    if (pathname === "/api/seller") {
      if (request.method === "GET") return json(await loadSeller(env));
      if (request.method === "PUT") {
        if (!env.STORE) return json({ error: "store (KV) not configured" }, 500);
        const s = await request.json();
        await env.STORE.put("seller", JSON.stringify(s));
        return json(s);
      }
      return json({ error: "method not allowed" }, 405);
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

    // --- Frontend proxy: start a run (creates/reuses a smith, streams SSE) ---
    if (request.method === "POST" && pathname === "/api/run") {
      if (!env.INGRAM_TOKEN || !env.AGENT_ID) return json({ error: "Proxy not configured (INGRAM_TOKEN/AGENT_ID)" }, 500);
      let body; try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
      const message = body?.message;
      if (!message) return json({ error: "message required" }, 400);
      const threadId = body?.thread_id || `voice_${Date.now()}`;

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
      return new Response(runRes.body, { headers: sseHeaders });
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
