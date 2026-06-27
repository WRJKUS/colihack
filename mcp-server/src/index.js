// Node/Express entry (used on Fly and locally). Loads the knowledge base from
// disk and serves the MCP core over HTTP. The Cloudflare Worker entry is
// src/worker.js; both share src/core.js.
import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { handleMcp } from "./core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../data");

const data = {
  clients: JSON.parse(readFileSync(join(DATA_DIR, "clients.json"), "utf8")),
  vatRules: JSON.parse(readFileSync(join(DATA_DIR, "vat-rules.json"), "utf8")),
  services: JSON.parse(readFileSync(join(DATA_DIR, "services.json"), "utf8"))
};

const TOOL_PREFIX = process.env.TOOL_PREFIX ?? "";

const app = express();
app.use(express.json());

function authMiddleware(req, res, next) {
  const expected = `Bearer ${process.env.MCP_AUTH_SECRET}`;
  if (req.headers.authorization !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// MCP JSON-RPC 2.0 — Ingram Cloud calls POST /mcp
app.post("/mcp", authMiddleware, async (req, res) => {
  const response = await handleMcp(req.body, { data, prefix: TOOL_PREFIX });
  res.json(response);
});

app.get("/health", (_, res) => res.json({ ok: true, clients: data.clients.length, services: data.services.length }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MCP server running on port ${PORT} — ${data.clients.length} clients, ${data.services.length} services loaded`));
