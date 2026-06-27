// Phase 2 — Ingram Cloud setup: create the agent + register the MCP server.
//
// Endpoints below are confirmed against cloud.ingram.tech/docs (2026-05-01):
//   POST /v1/agents                      -> create agent (returns { id: "agt_…" })
//   PUT  /v1/tenant/mcp/{name}           -> register/upsert MCP server (tenant-scoped)
//   GET  /v1/tenant/mcp/{name}           -> read back discovered tools
//
// Required env:
//   INGRAM_TOKEN     tenant-admin token from the Ingram Cloud console
//   MCP_PUBLIC_URL   public base URL of the deployed MCP server (NO /mcp suffix)
//   MCP_AUTH_SECRET  the same shared secret the server checks (mcp-server/.env)
//
// Run:
//   INGRAM_TOKEN=... MCP_PUBLIC_URL=https://xxxx.trycloudflare.com MCP_AUTH_SECRET=... \
//     node agent/setup-ingram.mjs
//
// Idempotent: PUT upserts the MCP server; agent creation is skipped (logged) if
// the slug already exists.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API = "https://api.cloud.ingram.tech";
const VERSION = "2026-05-01";
const AGENT_SLUG = "voice-invoice";
const AGENT_MODEL = "claude-sonnet-4-6";

const { INGRAM_TOKEN, MCP_PUBLIC_URL, MCP_AUTH_SECRET } = process.env;
const missing = Object.entries({ INGRAM_TOKEN, MCP_PUBLIC_URL, MCP_AUTH_SECRET })
  .filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error("Missing env:", missing.join(", "));
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${INGRAM_TOKEN}`,
  "IC-Api-Version": VERSION,
  "Content-Type": "application/json"
};

const instructions = readFileSync(join(__dirname, "system-prompt.md"), "utf8");
const mcpConfig = JSON.parse(readFileSync(join(__dirname, "mcp-config.json"), "utf8"));
const mcpUrl = `${MCP_PUBLIC_URL.replace(/\/$/, "")}/mcp`;

async function step(label, fn) {
  process.stdout.write(`\n• ${label}\n`);
  try { return await fn(); }
  catch (e) { console.error("  ✗", e.message); throw e; }
}

// 1. Create the agent (skip gracefully if the slug already exists)
const agentId = await step(`Create agent '${AGENT_SLUG}'`, async () => {
  const res = await fetch(`${API}/v1/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug: AGENT_SLUG,
      name: "Voice Invoice Agent",
      instructions,
      model: AGENT_MODEL
    })
  });
  const body = await res.text();
  if (res.status === 409) {
    console.log("  already exists — reusing slug:", AGENT_SLUG);
    return null;
  }
  if (!res.ok) throw new Error(`POST /v1/agents -> ${res.status} ${body}`);
  const json = JSON.parse(body);
  console.log("  created:", json.id);
  return json.id;
});

// 2. Register the MCP server (upsert). static-auth secret must be re-sent each save.
await step(`Register MCP server '${mcpConfig.name}' -> ${mcpUrl}`, async () => {
  const res = await fetch(`${API}/v1/tenant/mcp/${mcpConfig.name}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      url: mcpUrl,
      auth: { kind: "static", secret: MCP_AUTH_SECRET },
      tool_allowlist: mcpConfig.tool_allowlist,
      approval_policy: mcpConfig.approval_policy
    })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`PUT /v1/tenant/mcp/${mcpConfig.name} -> ${res.status} ${body}`);
  console.log("  registered ✓");
});

// 3. Read back to confirm tool discovery
await step("Verify discovered tools", async () => {
  const res = await fetch(`${API}/v1/tenant/mcp/${mcpConfig.name}`, { headers });
  const body = await res.text();
  if (!res.ok) throw new Error(`GET /v1/tenant/mcp/${mcpConfig.name} -> ${res.status} ${body}`);
  const json = JSON.parse(body);
  const tools = (json.tools ?? json.discovered_tools ?? []).map(t => t.name ?? t);
  console.log("  tools:", tools.length ? tools.join(", ") : JSON.stringify(json).slice(0, 400));
  const expected = mcpConfig.tool_allowlist;
  const missingTools = expected.filter(t => !tools.includes(t));
  if (tools.length && missingTools.length) console.log("  ⚠ missing from discovery:", missingTools.join(", "));
});

console.log("\nDone.");
if (agentId) {
  console.log(`AGENT_ID=${agentId}   (give this to the frontend)`);
} else {
  console.log(`Agent slug '${AGENT_SLUG}' — fetch its agt_ id from the console if needed.`);
}
console.log("Approvals resolve via POST /v1/smiths/{smith_id}/runs/{run_id}/submit");
console.log('  body: { "kind":"approval_decision", "approval_id":"apr_…", "decision":"approve", "actor":"<email>" }');
