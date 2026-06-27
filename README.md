# Agentic Voice Invoicing — Hackathon Build

**Team:** Bassel, Daniel, Wolfgang  
**Event:** Agentic Commerce II Hackathon — 27 June 2026, Brussels  
**Track:** Agentic E-Invoicing  

---

## What We're Building

A standalone voice-first invoicing agent for Belgian SME field workers and service providers.

The field worker speaks one sentence describing a completed job. The agent handles everything else:
- Identifies the client from the knowledge base
- Determines the correct Belgian VAT rate
- Creates a PEPPOL-compliant UBL invoice
- Validates it for compliance
- Asks for one-tap approval
- Sends it via the PEPPOL network
- Books the double-entry ledger entries

**Zero forms. Zero manual data entry. The accountant just signs.**

---

## Why This Wins

The product replicates the best parts of voice-first field assistant tools (instant capture, client memory, proactive context) but applies them natively to the Belgian e-invoicing problem. It's not an integration — it's a purpose-built agentic invoicing product.

| What field workers hate | What we do |
|------------------------|-----------|
| Filling in invoice forms after a long day | Speak one sentence, done |
| Looking up VAT rates | Agent applies the correct rate automatically |
| Finding client PEPPOL IDs | Local knowledge base + live PEPPOL lookup |
| Remembering to send invoices | Agent sends immediately on approval |
| Manual bookkeeping entries | Generated automatically after send |

---

## Architecture

```
Field worker speaks
        ↓
Browser mic (Web Speech API, nl-BE / fr-BE)
        ↓
Ingram Cloud Agent (Claude Sonnet 4.6)
  ├── Per-smith memory (client rates, preferences across sessions)
  ├── Tool: lookup_client       → local DB + PEPPOL network fallback
  ├── Tool: get_vat_rate        → Belgian VAT rules knowledge base
  ├── Tool: create_invoice      → e-invoice.be API
  ├── Tool: validate_invoice    → PEPPOL compliance check
  ├── Tool: send_invoice        → PEPPOL network (approval-gated ⚠️)
  └── Tool: book_entries        → double-entry ledger
        ↓
e-invoice.be (our sandbox company + PAI)
        ↓
PEPPOL Network → client's inbox
```

---

## Knowledge Base

The agent has two layers of client intelligence:

**1. Local database** (`mcp-server/data/clients.json`)  
Pre-seeded with demo companies: Proximus, Martens Sanitair, Dubois FM, Collibra, Belfius, Van den Berg. Contains PEPPOL IDs, default rates, payment terms, and notes. Lookup is instant and reliable for the demo.

**2. Live PEPPOL network**  
If a client isn't in the local DB, the agent falls back to searching the live PEPPOL participant registry via e-invoice.be.

**3. Smith memory** (Ingram Cloud `auto_memory`)  
After every invoice, the agent remembers client details and rates per user. Grows over time without any manual DB updates.

**Belgian VAT rules** (`mcp-server/data/vat-rules.json`)  
The `get_vat_rate` tool applies the correct rate based on service type and building context:
- 21% standard (most services)
- 12% catering food component
- 6% renovation of private dwelling > 10 years (labour only)
- 0% intra-EU B2B

---

## Stack

| Layer | Tool | Role |
|-------|------|------|
| Frontend | Lovable → React | Mic button, invoice preview, approval modal, T-accounts |
| Agent | Ingram Cloud | Claude Sonnet 4.6, per-smith memory, MCP tool orchestration |
| Tools | Node.js MCP server | 6 tools wrapping e-invoice.be + local knowledge base |
| E-invoicing | e-invoice.be API | PEPPOL invoice creation, validation, sending |
| STT | Browser Web Speech API | Client-side, free, Chrome |

---

## Team Split

| Person | Role | Instructions |
|--------|------|-------------|
| **Bassel** | Agent config, Ingram Cloud, pitch | [BASSEL.md](BASSEL.md) |
| **Wolfgang** | MCP server + knowledge base | [mcp-server/WOLFGANG.md](mcp-server/WOLFGANG.md) |
| **Daniel** | Frontend (Lovable) | [frontend/DANIEL.md](frontend/DANIEL.md) |

---

## Judging Criteria (max 75 pts)

| Criterion | Weight | Our answer |
|-----------|--------|-----------|
| Automation depth | ×5 | Voice → 6 tool calls → PEPPOL sent → ledger booked, zero steps |
| Trust & compliance | ×4 | PEPPOL-validated UBL, correct Belgian VAT, full audit trail |
| Real-world pull | ×3 | Speaks to every Belgian tradesperson, cleaner, consultant |
| Agentic execution | ×2 | Ingram smith memory + approval gating = genuine agent authority |
| Compelling pitch | ×1 | Live demo: speak → invoice in inbox in <30 seconds |

---

## Repo Structure

```
colihack/
├── README.md
├── BASSEL.md                          ← Bassel's task list
├── SETUP.md                           ← End-to-end test checklist
│
├── agent/
│   ├── system-prompt.md               ← Paste into Ingram Cloud agent
│   └── mcp-config.json                ← MCP registration reference
│
├── mcp-server/                        ← Wolfgang's domain
│   ├── WOLFGANG.md
│   ├── vercel.json
│   ├── package.json
│   ├── .env.example
│   ├── data/
│   │   ├── clients.json               ← Client knowledge base (seed data)
│   │   ├── vat-rules.json             ← Belgian VAT rules
│   │   └── seller.example.json        ← Your company details template
│   └── src/
│       ├── index.js                   ← MCP JSON-RPC 2.0 server
│       └── tools/
│           ├── lookup-client.js       ← Local DB + PEPPOL fallback
│           ├── get-vat-rate.js        ← VAT rate determination
│           ├── create-invoice.js      ← e-invoice.be create
│           ├── validate-invoice.js    ← e-invoice.be validate
│           ├── send-invoice.js        ← e-invoice.be send (approval-gated)
│           └── book-entries.js        ← Double-entry ledger
│
└── frontend/                          ← Daniel's domain
    ├── DANIEL.md
    ├── lovable-prompt.md              ← Paste into Lovable to generate UI
    └── lib/
        └── ingram.ts                  ← Ingram Cloud client + SSE stream helper
```
