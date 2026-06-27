import express from "express";
import { lookupPeppolParticipant } from "./tools/lookup-peppol.js";
import { createInvoice } from "./tools/create-invoice.js";
import { validateInvoice } from "./tools/validate-invoice.js";
import { sendInvoice } from "./tools/send-invoice.js";
import { bookEntries } from "./tools/book-entries.js";

const app = express();
app.use(express.json());

// Verify Ingram Cloud static auth token
function authMiddleware(req, res, next) {
  const expected = `Bearer ${process.env.MCP_AUTH_SECRET}`;
  if (req.headers.authorization !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const TOOLS = [
  {
    name: "lookup_peppol_participant",
    description: "Search for a company's PEPPOL ID by name and country",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Company name to search for" },
        country_code: { type: "string", description: "ISO country code, default BE", default: "BE" }
      },
      required: ["query"]
    }
  },
  {
    name: "create_invoice",
    description: "Create a PEPPOL-compliant invoice via e-invoice.be",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        seller_name: { type: "string" },
        seller_vat: { type: "string" },
        buyer_name: { type: "string" },
        buyer_peppol_id: { type: "string" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              vat_rate: { type: "number" }
            }
          }
        },
        invoice_number: { type: "string" }
      },
      required: ["seller_name", "seller_vat", "buyer_name", "buyer_peppol_id", "lines"]
    }
  },
  {
    name: "validate_invoice",
    description: "Validate a created invoice for PEPPOL compliance",
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
    description: "Send a validated invoice via PEPPOL network",
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        receiver_peppol_id: { type: "string" },
        email: { type: "string", description: "Optional fallback email" }
      },
      required: ["document_id", "receiver_peppol_id"]
    }
  },
  {
    name: "book_entries",
    description: "Generate double-entry bookkeeping entries for an invoice",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        total_excl_vat: { type: "number" },
        vat_amount: { type: "number" },
        total_incl_vat: { type: "number" },
        buyer_name: { type: "string" }
      },
      required: ["total_excl_vat", "vat_amount", "total_incl_vat", "buyer_name"]
    }
  }
];

async function dispatch(name, args) {
  switch (name) {
    case "lookup_peppol_participant": return lookupPeppolParticipant(args);
    case "create_invoice":           return createInvoice(args);
    case "validate_invoice":         return validateInvoice(args);
    case "send_invoice":             return sendInvoice(args);
    case "book_entries":             return bookEntries(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP JSON-RPC 2.0 endpoint — Ingram Cloud calls POST /mcp
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

app.get("/health", (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MCP server running on port ${PORT}`));
