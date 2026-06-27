# End-to-End Test Checklist

Run this before the pitch to confirm everything works.

## Prerequisites
- [ ] MCP server deployed to Vercel (Wolfgang)
- [ ] MCP server registered in Ingram Cloud (Bassel)
- [ ] Lovable app deployed (Daniel)
- [ ] Chrome browser (Web Speech API required)

## Test Script

1. Open the Lovable app URL in Chrome
2. Click the mic button, say:
   > "Repaired the boiler at Martens Sanitair, 3 hours at 65 euro, parts 87 euro"
3. Click "Process"

### Expected flow (watch the panels update in real time)

| Step | Expected result |
|------|----------------|
| Transcript | Text appears in transcript box as you speak |
| PEPPOL lookup | "Found: Martens Sanitair · 0208:XXXXXXXXXX" |
| Invoice preview | Client, 2 line items, VAT 21%, total €278.07 |
| Validation badge | Green "PEPPOL Valid ✓" |
| Approval modal | "Send €278.07 to Martens Sanitair via PEPPOL?" |
| After approve | "Invoice sent ✓" + timestamp |
| T-accounts | Debit 400 €278.07 / Credit 700 €229.81 / Credit 451 €48.26 |

## Verify in dashboards

- **e-invoice.be sandbox** → outbox → invoice appears with correct UBL
- **Ingram Cloud console** → Observe → Runs → see full tool call chain:
  `lookup_peppol_participant` → `create_invoice` → `validate_invoice` → `send_invoice` (approval) → `book_entries`

## If something breaks

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| No transcript | Not on Chrome | Switch to Chrome |
| Agent returns error | MCP server unreachable | Check Wolfgang's Vercel URL + logs |
| PEPPOL lookup fails | Wrong API key | Check EINVOICE_API_KEY in Vercel env |
| Approval modal never shows | `send_invoice` not in approval_policy | Check Ingram Cloud MCP config |
| Invoice not in outbox | Wrong SENDER_PEPPOL_ID | Check env var matches sandbox company |
