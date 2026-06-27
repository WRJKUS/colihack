// Register Wolfgang's prefixed MCP server (einvoice-wolf) as a tenant MCP and
// verify tool discovery. Separate from the shared "einvoice" MCP so the
// wolf_-prefixed tools don't collide.
//
// Required env:
//   INGRAM_TOKEN     Ingram tenant-admin token (the 544-char value)
//   MCP_PUBLIC_URL   public base URL of the deployed server (NO /mcp suffix)
//   MCP_AUTH_SECRET  the shared secret the DEPLOYED server checks on /mcp
//                    (must equal the host's MCP_AUTH_SECRET env var)
//
// Run:
//   INGRAM_TOKEN=... MCP_PUBLIC_URL=https://xxx.onrender.com MCP_AUTH_SECRET=... \
//     node agent/register-mcp-wolf.mjs

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://api.cloud.ingram.tech";
const VERSION = "2026-05-01";

const { INGRAM_TOKEN, MCP_PUBLIC_URL, MCP_AUTH_SECRET } = process.env;
const missing = Object.entries({ INGRAM_TOKEN, MCP_PUBLIC_URL, MCP_AUTH_SECRET })
  .filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error("Missing env:", missing.join(", ")); process.exit(1); }

const headers = { Authorization: `Bearer ${INGRAM_TOKEN}`, "IC-Api-Version": VERSION, "Content-Type": "application/json" };
const cfg = JSON.parse(readFileSync(join(__dirname, "mcp-config.wolf.json"), "utf8"));
const mcpUrl = `${MCP_PUBLIC_URL.replace(/\/$/, "")}/mcp`;

console.log(`Registering '${cfg.name}' -> ${mcpUrl}`);
const put = await fetch(`${API}/v1/tenant/mcp/${cfg.name}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({
    url: mcpUrl,
    auth: { kind: "static", secret: MCP_AUTH_SECRET },
    tool_allowlist: cfg.tool_allowlist,
    approval_policy: cfg.approval_policy
  })
});
if (!put.ok) { console.error("PUT failed:", put.status, (await put.text()).slice(0, 400)); process.exit(1); }
console.log("registered ✓");

const got = await (await fetch(`${API}/v1/tenant/mcp/${cfg.name}`, { headers })).json();
const tools = (got.tools ?? got.discovered_tools ?? []).map(t => t.name ?? t);
console.log("status:", got.status, "| discovery_error:", got.discovery_error);
console.log("discovered tools:", tools.length ? tools.join(", ") : "(none yet — check the URL is reachable)");
const expected = cfg.tool_allowlist;
const miss = expected.filter(t => !tools.includes(t));
if (tools.length && miss.length) console.log("⚠ missing:", miss.join(", "));
else if (tools.length) console.log("all 7 wolf_ tools discovered ✓");
