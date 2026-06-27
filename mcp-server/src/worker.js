// Cloudflare Worker entry. Same MCP behaviour as the Node server, adapted to the
// Workers fetch handler: no ports, no filesystem. Data is bundled via JSON
// imports; secrets/config come from the `env` binding, which we mirror onto
// process.env so the tool modules (which read process.env.*) work unchanged.
import { handleMcp } from "./core.js";
import clients from "../data/clients.json" with { type: "json" };
import vatRules from "../data/vat-rules.json" with { type: "json" };
import services from "../data/services.json" with { type: "json" };

const data = { clients, vatRules, services };

export default {
  async fetch(request, env) {
    // Mirror Worker bindings onto process.env for the tool modules.
    globalThis.process = globalThis.process ?? {};
    globalThis.process.env = { ...(globalThis.process.env ?? {}), ...env };

    const url = new URL(request.url);
    const prefix = env.TOOL_PREFIX ?? "wolf_";

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, clients: clients.length, services: services.length });
    }

    if (request.method === "POST" && url.pathname === "/mcp") {
      if (request.headers.get("authorization") !== `Bearer ${env.MCP_AUTH_SECRET}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      let body;
      try { body = await request.json(); }
      catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
      const response = await handleMcp(body, { data, prefix });
      return Response.json(response);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
};
