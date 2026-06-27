# Bassel — Agent Config + Coordination

You own the Ingram Cloud agent setup and the end-to-end integration.

## Your Tasks (in order)

### 1. Share credentials with teammates (do this NOW)
- DM Wolfgang: `EINVOICE_API_KEY` and `SENDER_PEPPOL_ID` (your sandbox PAI)
- DM Daniel: `INGRAM_TOKEN` (tenant-admin token from Ingram Cloud console)

### 2. Create the Ingram Cloud Agent

Go to [cloud.ingram.tech](https://cloud.ingram.tech) → Build → Agents → New Agent

- **Name:** Donna Invoice Agent
- **Model:** claude-sonnet-4-6
- **System prompt:** copy from `agent/system-prompt.md`
- **Save and publish**

### 3. Register the MCP Server (wait for Wolfgang to deploy first)

Once Wolfgang gives you his Vercel URL, run:

```bash
curl -X PUT https://api.cloud.ingram.tech/v1/tenant/mcp/einvoice \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://WOLFGANG_VERCEL_URL/mcp",
    "auth": { "kind": "static" },
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

### 4. Create a test Smith and run a test

```bash
# Create a smith
curl https://api.cloud.ingram.tech/v1/smiths \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "test_user_1",
    "display_name": "Test Field Worker",
    "model": "claude-sonnet-4-6"
  }'

# Copy the smith id (smt_...) and run a test
curl https://api.cloud.ingram.tech/v1/smiths/SMT_ID_HERE/runs \
  -H "Authorization: Bearer $INGRAM_TOKEN" \
  -H "IC-Api-Version: 2026-05-01" \
  -H "Content-Type: application/json" \
  -d '{
    "input": [{ "role": "user", "content": "I just finished a boiler repair for Proximus, 3 hours labour at 65 euro, parts cost 87 euro." }],
    "thread_id": "test_thread_1"
  }'
```

### 5. Simulate Donna webhook (for the demo narrative)

Create a file `agent/donna-webhook-example.json` showing what Donna would send us — we show this in the pitch to explain the integration.

### 6. Own the 5-minute pitch

Structure:
1. Problem (1 min): Belgian SMEs waste hours on invoicing admin
2. Demo (2.5 min): speak → PEPPOL invoice sent live
3. Compliance (45s): validated PEPPOL, correct VAT, auditable
4. Why Monday (45s): Donna already in 100+ orgs, our layer adds instant invoicing

## Key files
- `agent/system-prompt.md` — agent instructions
- `agent/mcp-config.json` — MCP registration config (update URL after Wolfgang deploys)
