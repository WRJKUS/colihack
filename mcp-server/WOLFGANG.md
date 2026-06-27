# Wolfgang — MCP Server

You own the MCP server: a Node.js app exposing 5 tools the AI agent calls to create and send PEPPOL invoices via e-invoice.be. Your goal: deploy to Vercel and send Bassel the URL.

## Setup

```bash
git clone https://github.com/bsselm/colihack
cd colihack/mcp-server

npm install

cp .env.example .env
# Fill in .env with values Bassel sends you:
#   EINVOICE_API_KEY=...
#   SENDER_PEPPOL_SCHEME=0208
#   SENDER_PEPPOL_ID=...
#   MCP_AUTH_SECRET=...   ← Bassel generates this, same value both sides

npm run dev
# Server starts on http://localhost:3001
```

## Test locally

The server speaks MCP JSON-RPC 2.0 over `POST /mcp`. Test each tool:

```bash
# Health check (no auth needed)
curl http://localhost:3001/health

# PEPPOL participant lookup
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_AUTH_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# List tools
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_AUTH_SECRET" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lookup_peppol_participant","arguments":{"query":"Proximus","country_code":"BE"}}}'

# Create test invoice
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_AUTH_SECRET" \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{
      "name":"create_invoice",
      "arguments":{
        "seller_name":"Test Company",
        "seller_vat":"BE0123456789",
        "buyer_name":"Proximus",
        "buyer_peppol_id":"0208:0202239951",
        "lines":[
          {"description":"Labour","quantity":3,"unit_price":65,"vat_rate":21},
          {"description":"Parts","quantity":1,"unit_price":87,"vat_rate":21}
        ]
      }
    }
  }'
```

## Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from mcp-server folder
vercel

# Add env vars
vercel env add EINVOICE_API_KEY
vercel env add SENDER_PEPPOL_SCHEME
vercel env add SENDER_PEPPOL_ID
vercel env add MCP_AUTH_SECRET

# Production deploy
vercel --prod
```

**Send Bassel your Vercel URL** (e.g. `https://colihack-mcp-server.vercel.app`) so he can register it in Ingram Cloud.

## Your 5 tools

| Tool | File | What it does |
|------|------|-------------|
| `lookup_peppol_participant` | `src/tools/lookup-peppol.js` | Finds company PEPPOL ID by name |
| `create_invoice` | `src/tools/create-invoice.js` | Creates invoice via e-invoice.be |
| `validate_invoice` | `src/tools/validate-invoice.js` | PEPPOL compliance check |
| `send_invoice` | `src/tools/send-invoice.js` | Sends via PEPPOL — approval-gated! |
| `book_entries` | `src/tools/book-entries.js` | Generates double-entry ledger |

## Important: auth middleware

Ingram Cloud sends `Authorization: Bearer YOUR_MCP_AUTH_SECRET` on every request. The server checks this in `authMiddleware`. Make sure the `MCP_AUTH_SECRET` env var in Vercel exactly matches what Bassel used when registering the MCP server.

## Important: send_invoice is approval-gated

`send_invoice` has `destructiveHint: true` in the tool definition. This causes Ingram Cloud to pause before executing it and ask the user to approve. Do not remove this annotation — it's our "accountant just signs" demo moment.
