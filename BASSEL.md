# Bassel — Agent Config + Coordination

You own the Ingram Cloud agent setup, MCP registration, and the pitch.

## Your Tasks (in order)

### 1. Share credentials with teammates (do this NOW)

Generate a random MCP secret (any 32-char string, e.g. `openssl rand -hex 16` in terminal).

- DM **Wolfgang**: `EINVOICE_API_KEY`, `SENDER_PEPPOL_ID`, `MCP_AUTH_SECRET`
- DM **Daniel**: `INGRAM_TOKEN`, `AGENT_ID` (get AGENT_ID after step 2)

---

### 2. Create the Ingram Cloud Agent

**Option A — Console (quickest):**
Go to [cloud.ingram.tech](https://cloud.ingram.tech) → Build → Agents → New Agent
- Name: `Donna Invoice Agent`
- Slug: `donna-invoice`
- Model: `claude-sonnet-4-6`
- System prompt: paste contents of `agent/system-prompt.md`
- Save and publish → copy the `agt_...` ID → DM to Daniel

**Option B — API:**
```bash
curl https://api.cloud.ingram.tech/v1/agents \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "donna-invoice",
    "name": "Donna Invoice Agent",
    "model": "claude-sonnet-4-6",
    "instructions": "'$(cat agent/system-prompt.md)'"
  }'
```

---

### 3. Register MCP Server (wait for Wolfgang's Vercel URL)

Replace `WOLFGANG_URL` and `YOUR_MCP_AUTH_SECRET` below:

```bash
curl -X PUT https://api.cloud.ingram.tech/v1/tenant/mcp/einvoice \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://WOLFGANG_URL/mcp",
    "auth": { "kind": "static", "secret": "YOUR_MCP_AUTH_SECRET" },
    "tool_allowlist": [
      "lookup_peppol_participant",
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

Verify Ingram discovered the tools:
```bash
curl https://api.cloud.ingram.tech/v1/tenant/mcp/einvoice \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01"
```

---

### 4. Create a test Smith and run end-to-end test

```bash
# Create smith
curl https://api.cloud.ingram.tech/v1/smiths \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "test_bassel_1",
    "display_name": "Bassel Test",
    "agent_id": "agt_YOUR_AGENT_ID",
    "model": "claude-sonnet-4-6",
    "auto_memory": true
  }'

# Copy smt_... ID, then run a test invoice
curl https://api.cloud.ingram.tech/v1/smiths/SMT_ID_HERE/runs \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "input": [{ "role": "user", "content": "I just fixed the boiler at Martens Sanitair, 3 hours labour at 65 euro, parts 87 euro." }],
    "thread_id": "test_thread_1"
  }'
```

Check pending approvals (after the run pauses for send_invoice):
```bash
curl https://api.cloud.ingram.tech/v1/approvals?status=pending \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01"
```

Approve it:
```bash
curl -X POST https://api.cloud.ingram.tech/v1/approvals/APPROVAL_ID_HERE/submit \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{ "decision": "approve" }'
```

---

### 5. Own the 5-minute pitch

Structure:
1. **Problem (1 min):** Field workers in Belgium spend 30% of admin time on invoicing. Donna solves the capture — but the invoice still gets created manually.
2. **Demo (2.5 min):** Show `agent/donna-webhook-example.json` → "This is what Donna sends us" → then live demo: speak → PEPPOL invoice sent in 30 seconds.
3. **Compliance (45s):** PEPPOL-validated, correct Belgian VAT, full audit trail from voice to ledger. Accountant just signs.
4. **Why Monday (45s):** Donna is live in 100+ organisations. Our layer adds instant invoicing with zero new behaviour for the field worker.

---

## Key files
- `agent/system-prompt.md` — agent instructions
- `agent/mcp-config.json` — MCP registration reference (fill in URL + secret)
- `agent/donna-webhook-example.json` — pitch demo artifact
- `SETUP.md` — end-to-end test checklist before the pitch
