// Runtime-agnostic MCP core: tool definitions, dispatch, and the JSON-RPC
// handler. No express, no fs, no app.listen here — so it runs unchanged in both
// the Node/Express server (src/index.js, Fly) and the Cloudflare Worker
// (src/worker.js). Data is injected by the caller; secrets are read from
// process.env by the tool modules (the Worker shims process.env from `env`).

import { lookupClient } from "./tools/lookup-client.js";
import { createInvoice } from "./tools/create-invoice.js";
import { validateInvoice } from "./tools/validate-invoice.js";
import { sendInvoice } from "./tools/send-invoice.js";
import { bookEntries } from "./tools/book-entries.js";
import { getVatRate } from "./tools/get-vat-rate.js";
import { lookupService } from "./tools/lookup-service.js";

export const TOOLS = [
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
    name: "lookup_service",
    description: "Map a free-text phrase ('1 hour of work', 'the drive', 'thermostat') to a catalog service/product with unit, unit price, and default VAT rate. Use this to turn spoken work items into priced invoice line items.",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Phrase describing the work item, part, or travel to price" },
        type: { type: "string", description: "Optional filter: 'labour', 'travel', or 'parts'", enum: ["labour", "travel", "parts"] }
      },
      required: ["query"]
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
        buyer_peppol_id: { type: "string", description: "Recipient PEPPOL ID as 'scheme:identifier' (e.g. '0208:0123456789'). The receiver is derived from this." },
        buyer_vat: { type: "string" },
        buyer_address: { type: "string" },
        buyer_email: { type: "string" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string", description: "UN/ECE unit code from lookup_service (HUR=hour, KMT=km, C62=each). Default C62." },
              unit_price: { type: "number" },
              vat_rate: { type: "number", description: "VAT percentage as a number (e.g. 21 or 6)" },
              product_code: { type: "string" }
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
    description: "Validate the invoice payload for PEPPOL/EN16931 compliance via POST /api/validate/json. Runs on the SAME fields as create_invoice and must be called BEFORE create_invoice to catch issues early.",
    annotations: {},
    inputSchema: {
      type: "object",
      properties: {
        buyer_name: { type: "string" },
        buyer_peppol_id: { type: "string" },
        buyer_vat: { type: "string" },
        buyer_address: { type: "string" },
        buyer_email: { type: "string" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unit_price: { type: "number" },
              vat_rate: { type: "number" },
              product_code: { type: "string" }
            },
            required: ["description", "quantity", "unit_price", "vat_rate"]
          }
        },
        payment_terms_days: { type: "number" },
        invoice_number: { type: "string" }
      },
      required: ["buyer_name", "buyer_peppol_id", "lines"]
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

export async function dispatch(name, args, data) {
  switch (name) {
    case "lookup_client":    return lookupClient(args, data.clients);
    case "get_vat_rate":     return getVatRate(args, data.vatRules);
    case "lookup_service":   return lookupService(args, data.services);
    case "create_invoice":   return createInvoice(args);
    case "validate_invoice": return validateInvoice(args);
    case "send_invoice":     return sendInvoice(args);
    case "book_entries":     return bookEntries(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// Handle one MCP JSON-RPC request body; returns the response object.
// `prefix` namespaces tool names (e.g. "wolf_") and is stripped before dispatch.
export async function handleMcp(body, { data, prefix = "" }) {
  const { method, params, id } = body ?? {};

  if (method === "tools/list") {
    const tools = prefix ? TOOLS.map(t => ({ ...t, name: prefix + t.name })) : TOOLS;
    return { jsonrpc: "2.0", id, result: { tools } };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params ?? {};
    const bareName = prefix && name?.startsWith(prefix) ? name.slice(prefix.length) : name;
    try {
      const result = await dispatch(bareName, args, data);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } };
    } catch (err) {
      return { jsonrpc: "2.0", id, error: { code: -32000, message: err.message } };
    }
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
}
