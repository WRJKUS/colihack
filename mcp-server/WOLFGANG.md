# Wolfgang — MCP Server + Knowledge Base

You own the MCP server: 6 tools the AI agent uses to look up clients, determine VAT rates, and send PEPPOL invoices via e-invoice.be.

---

## Setup

```bash
git clone https://github.com/bsselm/colihack
cd colihack/mcp-server

npm install

cp .env.example .env
# Fill in .env with credentials from Bassel:
#   EINVOICE_API_KEY
#   SENDER_PEPPOL_SCHEME=0208
#   SENDER_PEPPOL_ID
#   SELLER_NAME
#   SELLER_VAT
#   MCP_AUTH_SECRET

npm run dev
# Server on http://localhost:3001
# You should see: "MCP server running on port 3001 — 6 clients loaded"
```

---

## Your 6 tools

| Tool | File | What it does |
|------|------|-------------|
| `lookup_client` | `src/tools/lookup-client.js` | Checks `data/clients.json` first, then live PEPPOL network |
| `get_vat_rate` | `src/tools/get-vat-rate.js` | Returns correct Belgian VAT rate (6/12/21%) with reasoning |
| `create_invoice` | `src/tools/create-invoice.js` | Creates invoice via e-invoice.be (seller info from env) |
| `validate_invoice` | `src/tools/validate-invoice.js` | PEPPOL compliance check |
| `send_invoice` | `src/tools/send-invoice.js` | Sends via PEPPOL — **approval-gated** ⚠️ |
| `book_entries` | `src/tools/book-entries.js` | Double-entry ledger entries |

---

## Knowledge base

`data/clients.json` — 7 pre-seeded Belgian companies with PEPPOL IDs, default rates, and notes. The `lookup_client` tool searches this first (instant, reliable for demo) then falls back to the live PEPPOL network.

`data/vat-rules.json` — Belgian VAT rules used by `get_vat_rate`.

`data/seller.example.json` — template for your company details. Copy to `data/seller.json` (gitignored) and fill in:
```bash
cp data/seller.example.json data/seller.json
# Edit seller.json with the sandbox company details Bassel sends you
```
If `seller.json` doesn't exist, the tool reads seller info from `.env` vars instead.

---

## Test locally

```bash
# Health — shows how many clients loaded
curl http://localhost:3001/health

# List all 6 tools
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_AUTH_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Look up a client (from local DB)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_AUTH_SECRET" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lookup_client","arguments":{"query":"Martens"}}}'

# Get VAT rate for plumbing
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_AUTH_SECRET" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_vat_rate","arguments":{"service_description":"boiler repair and plumbing work"}}}'

# Create a test invoice (use a real PEPPOL ID from clients.json)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_AUTH_SECRET" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"tools/call",
    "params":{"name":"create_invoice","arguments":{
      "buyer_name":"Martens Sanitair BVBA",
      "buyer_peppol_id":"0208:0742394851",
      "lines":[
        {"description":"Labour — boiler repair","quantity":3,"unit_price":65,"vat_rate":21},
        {"description":"Parts — pump and thermostat","quantity":1,"unit_price":87,"vat_rate":21}
      ]
    }}
  }'
```

---

## Expose locally so Ingram Cloud can reach you

No Vercel needed — just expose your local server with ngrok:

```bash
# Install ngrok if you don't have it: https://ngrok.com/download
# OR use the one-liner with npx:
npx ngrok http 3001
```

You'll see output like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3001
```

**Send Bassel that HTTPS URL** (e.g. `https://abc123.ngrok-free.app`). He needs it to register the MCP server in Ingram Cloud. Keep ngrok running the whole time.

---

## Adding more clients to the knowledge base

Edit `data/clients.json` and add entries in this format:
```json
{
  "name": "Full Company Name NV",
  "aliases": ["Short name", "Common nickname"],
  "vat_number": "BE0XXXXXXXXX",
  "peppol_id": "0208:XXXXXXXXX",
  "address": "Street 1, City",
  "contact_email": "ap@company.be",
  "default_hourly_rate": 65,
  "payment_terms_days": 30,
  "notes": "Any useful context for the agent"
}
```

Commit and push — restart `npm run dev` to reload.

---

## Important: `send_invoice` is approval-gated

The tool has `"destructiveHint": true`. Ingram Cloud will pause the agent run before executing it and wait for the user to click "Approve & Send" in the UI. Do not remove this — it's the "accountant just signs" demo moment the judges are scoring highest.
