# Wolfgang — MCP Server (Tools → e-invoice.be)

You own the MCP server: a small Node.js app that exposes 5 tools the AI agent calls to create and send PEPPOL invoices. Your goal is to get this deployed to Vercel and give Bassel the URL.

## Setup (start here)

```bash
# Clone the repo
git clone https://github.com/bsselm/colihack
cd colihack/mcp-server

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in .env with the values Bassel sends you:
#   EINVOICE_API_KEY=...
#   SENDER_PEPPOL_SCHEME=0208
#   SENDER_PEPPOL_ID=...

# Run locally
npm run dev
# Server starts on http://localhost:3001
```

## Test locally before deploying

```bash
# Test the health endpoint
curl http://localhost:3001/health

# Test PEPPOL lookup
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "lookup_peppol_participant", "arguments": {"query": "Proximus", "country_code": "BE"}}'

# Test invoice creation
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "create_invoice",
    "arguments": {
      "seller_name": "Test Company",
      "seller_vat": "BE0123456789",
      "buyer_name": "Proximus",
      "buyer_peppol_id": "0208:0202239951",
      "lines": [
        {"description": "Labour", "quantity": 3, "unit_price": 65, "vat_rate": 21},
        {"description": "Parts", "quantity": 1, "unit_price": 87, "vat_rate": 21}
      ]
    }
  }'
```

## Deploy to Vercel

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Deploy from the mcp-server folder
cd colihack/mcp-server
vercel

# When prompted:
#   - Link to existing project? No
#   - Project name: colihack-mcp-server
#   - Directory: ./
#   - Override settings? No

# Add environment variables in Vercel dashboard or via CLI:
vercel env add EINVOICE_API_KEY
vercel env add SENDER_PEPPOL_SCHEME
vercel env add SENDER_PEPPOL_ID

# Redeploy with env vars
vercel --prod
```

**Give Bassel the Vercel URL** (e.g. `https://colihack-mcp-server.vercel.app`) so he can register it in Ingram Cloud.

## Your 5 tools

| Tool | File | What it does |
|------|------|--------------|
| `lookup_peppol_participant` | `src/tools/lookup-peppol.js` | Finds a company's PEPPOL ID by name |
| `create_invoice` | `src/tools/create-invoice.js` | Creates invoice via e-invoice.be API |
| `validate_invoice` | `src/tools/validate-invoice.js` | Validates PEPPOL compliance |
| `send_invoice` | `src/tools/send-invoice.js` | Sends via PEPPOL (approval-gated!) |
| `book_entries` | `src/tools/book-entries.js` | Generates double-entry ledger entries |

## Important: `send_invoice` is approval-gated

The agent will PAUSE before calling `send_invoice` and ask the user to approve. This is intentional — it's our "accountant just signs" moment for the judges. Do not remove the `destructiveHint: true` annotation in `src/index.js`.

## If the e-invoice.be API returns errors

Check the API docs at [docs.e-invoice.be](https://docs.e-invoice.be) and [api.e-invoice.be/docs](https://api.e-invoice.be/docs). The sandbox company credentials Bassel shares should work for all endpoints.
