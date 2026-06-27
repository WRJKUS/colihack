import express from "express";
import { lookupPeppolParticipant } from "./tools/lookup-peppol.js";
import { createInvoice } from "./tools/create-invoice.js";
import { validateInvoice } from "./tools/validate-invoice.js";
import { sendInvoice } from "./tools/send-invoice.js";
import { bookEntries } from "./tools/book-entries.js";

const app = express();
app.use(express.json());

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

// MCP tool list endpoint
app.get("/mcp/tools/list", (req, res) => {
  res.json({ tools: TOOLS });
});

// MCP tool call endpoint
app.post("/mcp/tools/call", async (req, res) => {
  const { name, arguments: args } = req.body;
  try {
    let result;
    switch (name) {
      case "lookup_peppol_participant": result = await lookupPeppolParticipant(args); break;
      case "create_invoice":           result = await createInvoice(args); break;
      case "validate_invoice":         result = await validateInvoice(args); break;
      case "send_invoice":             result = await sendInvoice(args); break;
      case "book_entries":             result = await bookEntries(args); break;
      default: return res.status(404).json({ error: `Unknown tool: ${name}` });
    }
    res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MCP server running on port ${PORT}`));
