import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { lookupClient } from "./tools/lookup-client.js";
import { createInvoice } from "./tools/create-invoice.js";
import { validateInvoice } from "./tools/validate-invoice.js";
import { sendInvoice } from "./tools/send-invoice.js";
import { bookEntries } from "./tools/book-entries.js";
import { getVatRate } from "./tools/get-vat-rate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load knowledge base at startup
const DATA_DIR = join(__dirname, "../data");
export const CLIENT_DB = JSON.parse(readFileSync(join(DATA_DIR, "clients.json"), "utf8"));
export const VAT_RULES = JSON.parse(readFileSync(join(DATA_DIR, "vat-rules.json"), "utf8"));

const app = express();
app.use(express.json());

function authMiddleware(req, res, next) {
  const expected = `Bearer ${process.env.MCP_AUTH_SECRET}`;
  if (req.headers.authorization !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const TOOLS = [
  {
    name: "lookup_client",
    description: "Find a client by name in the local database (PEPPOL ID, rate, address). Falls back to live PEPPOL network search if not found locally.",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Client name or alias to search for" },
        country_code: { type: "string", description: "ISO country code, default BE", default: "BE" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_vat_rate",
    description: "Determine the correct Belgian VAT rate for a service type. Returns the rate (6, 12, or 21) and the reasoning.",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        service_description: { type: "string", description: "Description of the service or goods being invoiced" },
        building_age_years: { type: "number", description: "Age of the building in years (required for renovation services)" },
        is_private_dwelling: { type: "boolean", description: "Whether the building is a private dwelling (required for renovation)" }
      },
      required: ["service_description"]
    }
  },
  {
    name: "create_invoice",
    description: "Create a PEPPOL-compliant invoice via e-invoice.be API",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        buyer_name: { type: "string" },
        buyer_peppol_id: { type: "string" },
        buyer_vat: { type: "string" },
        buyer_address: { type: "string" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              vat_rate: { type: "number" }
            },
            required: ["description", "quantity", "unit_price", "vat_rate"]
          }
        },
        payment_terms_days: { type: "number", description: "Days until payment due, default 30" },
        invoice_number: { type: "string" }
      },
      required: ["buyer_name", "buyer_peppol_id", "lines"]
    }
  },
  {
    name: "validate_invoice",
    description: "Validate a created invoice for PEPPOL compliance before sending",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        document_id: { type: "string" }
      },
      required: ["document_id"]
    }
  },
  {
    name: "send_invoice",
    description: "Send a validated invoice via the PEPPOL network. THIS ACTION IS IRREVERSIBLE — requires explicit user approval.",
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        receiver_peppol_id: { type: "string" },
        email: { type: "string", description: "Optional fallback email if receiver not on PEPPOL" }
      },
      required: ["document_id", "receiver_peppol_id"]
    }
  },
  {
    name: "book_entries",
    description: "Generate double-entry bookkeeping entries (debit/credit) for a sent invoice",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        total_excl_vat: { type: "number" },
        vat_amount: { type: "number" },
        total_incl_vat: { type: "number" },
        buyer_name: { type: "string" },
        invoice_number: { type: "string" }
      },
      required: ["total_excl_vat", "vat_amount", "total_incl_vat", "buyer_name"]
    }
  }
];

async function dispatch(name, args) {
  switch (name) {
    case "lookup_client":   return lookupClient(args, CLIENT_DB);
    case "get_vat_rate":    return getVatRate(args, VAT_RULES);
    case "create_invoice":  return createInvoice(args);
    case "validate_invoice": return validateInvoice(args);
    case "send_invoice":    return sendInvoice(args);
    case "book_entries":    return bookEntries(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP JSON-RPC 2.0 — Ingram Cloud calls POST /mcp
app.post("/mcp", authMiddleware, async (req, res) => {
  const { method, params, id } = req.body;

  if (method === "tools/list") {
    return res.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;
    try {
      const result = await dispatch(name, args);
      return res.json({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: JSON.stringify(result) }] }
      });
    } catch (err) {
      return res.json({
        jsonrpc: "2.0", id,
        error: { code: -32000, message: err.message }
      });
    }
  }

  res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

app.get("/health", (_, res) => res.json({ ok: true, clients: CLIENT_DB.length }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MCP server running on port ${PORT} — ${CLIENT_DB.length} clients loaded`));
