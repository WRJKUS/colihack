# Bassel — Agent Config + Coordination

You own: Ingram Cloud agent setup, MCP server registration, end-to-end testing, and the pitch.

---

## Step 1 — Generate MCP_AUTH_SECRET (do this NOW)

Run in any terminal:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Save the output. This is your `MCP_AUTH_SECRET`.

---

## Step 2 — Share credentials with teammates (do this NOW)

**DM Wolfgang:**
- `EINVOICE_API_KEY` — from your e-invoice.be sandbox account
- `SENDER_PEPPOL_ID` — your sandbox company's PEPPOL ID (numbers only, e.g. `0742394851`)
- `SENDER_PEPPOL_SCHEME` — `0208` (Belgian standard)
- `SELLER_NAME` — your sandbox company name
- `SELLER_VAT` — your sandbox company VAT number
- `MCP_AUTH_SECRET` — from step 1

**DM Daniel (after step 3):**
- `INGRAM_TOKEN` — your tenant-admin token from Ingram Cloud console
- `AGENT_ID` — the `agt_...` ID after you create the agent

---

## Step 3 — Create the Ingram Cloud Agent

Go to [cloud.ingram.tech](https://cloud.ingram.tech) → Build → Agents → New Agent

- **Name:** Voice Invoice Agent
- **Slug:** `voice-invoice`
- **Model:** `claude-sonnet-4-6`
- **System prompt:** paste full contents of `agent/system-prompt.md`
- Save and publish → copy the `agt_...` ID → DM to Daniel

Or via API:
```bash
curl https://api.cloud.ingram.tech/v1/agents \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "voice-invoice",
    "name": "Voice Invoice Agent",
    "model": "claude-sonnet-4-6",
    "instructions": "PASTE SYSTEM PROMPT HERE"
  }'
```

---

## Step 4 — Register MCP Server (wait for Wolfgang's ngrok URL)

Wolfgang runs `npm run dev` then `npx ngrok http 3001` and sends you a URL like `https://abc123.ngrok-free.app`.

Replace `NGROK_URL` and `MCP_AUTH_SECRET` (`667f7e47655dbac5805f2118570a1af6`):

```bash
curl -X PUT https://api.cloud.ingram.tech/v1/tenant/mcp/einvoice \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://NGROK_URL/mcp",
    "auth": { "kind": "static", "secret": "667f7e47655dbac5805f2118570a1af6" },
    "tool_allowlist": [
      "lookup_client",
      "get_vat_rate",
      "create_invoice",
      "validate_invoice",
      "send_invoice",
      "book_entries"
    ],
    "approval_policy": [
      { "match": "send_invoice", "require": "approval" }
    ]
  }'
```

Verify Ingram discovered all 6 tools:
```bash
curl https://api.cloud.ingram.tech/v1/tenant/mcp/einvoice \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01"
```

---

## Step 5 — Create test Smith and run end-to-end test

```bash
# Create a smith
curl https://api.cloud.ingram.tech/v1/smiths \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "test_bassel_1",
    "display_name": "Test Field Worker",
    "agent_id": "agt_YOUR_AGENT_ID",
    "model": "claude-sonnet-4-6",
    "auto_memory": true
  }'

# Run a test invoice (replace SMT_ID)
curl https://api.cloud.ingram.tech/v1/smiths/SMT_ID_HERE/runs \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "input": [{ "role": "user", "content": "Fixed the boiler at Martens Sanitair, 3 hours labour at 65 euro, parts 87 euro." }],
    "thread_id": "test_thread_1"
  }'
```

Check pending approvals (run will pause before sending):
```bash
curl "https://api.cloud.ingram.tech/v1/approvals?status=pending" \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01"
```

Approve the send:
```bash
curl -X POST https://api.cloud.ingram.tech/v1/approvals/APPROVAL_ID_HERE/submit \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{ "decision": "approve" }'
```

Verify in e-invoice.be sandbox → outbox → invoice should appear.

---

## Step 6 — Update clients.json if needed

Open `mcp-server/data/clients.json` and add your actual sandbox company as a test client so you can do a real send-to-self test. Wolfgang can pull and restart the server.

---

## Step 7 — Pitch (5 minutes)

**Problem (1 min):**
Belgian SMEs lose hours every week on invoicing admin. Field workers finish a job, then spend 20 minutes filling in forms, looking up VAT rates, finding PEPPOL IDs. This is the last thing standing between a completed job and getting paid.

**Demo (2.5 min):**
Speak one sentence → watch the agent find the client, determine the VAT rate, create and validate the PEPPOL invoice → approval modal → one tap → invoice in the client's inbox → bookkeeping entries appear. Live, real, via PEPPOL.

**Why it's compliant (45s):**
Every invoice is PEPPOL-validated UBL 2.1. Belgian VAT rules are baked in. The double-entry entries follow Belgian chart of accounts. An accountant can audit from voice to ledger.

**Why Monday (45s):**
Every Belgian tradesperson, cleaner, consultant, and caterer has this problem. Our product works in Dutch, French, and English. First-time setup takes 2 minutes. After that — one sentence per job.
