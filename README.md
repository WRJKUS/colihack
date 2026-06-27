# Donna Invoice — Agentic E-Invoicing Hackathon

**Team:** Bassel (you), Daniel, Wolfgang  
**Event:** Agentic Commerce II Hackathon — 27 June 2026, Brussels  
**Track:** Agentic E-Invoicing  

## What We're Building

A voice-first invoicing agent. A Belgian field worker speaks a sentence describing a job — the agent extracts the invoice, looks up the client on the PEPPOL network, validates compliance, asks for one-tap approval, sends the invoice, and books the double-entry ledger entries. Zero forms.

```
Field worker speaks
      ↓
Donna captures / Browser mic transcribes
      ↓
Ingram Cloud Agent (Claude Sonnet 4.6)
      ↓ calls tools via MCP
MCP Server (Wolfgang) → e-invoice.be API
      ↓
PEPPOL Network → client's inbox
      ↓
Double-entry bookkeeping displayed
```

## Team Split

| Person | Role | Folder | Instructions |
|--------|------|--------|--------------|
| **Bassel** | Agent config + coordination | `agent/` + Ingram Cloud console | [BASSEL.md](BASSEL.md) |
| **Wolfgang** | MCP Server (tools → e-invoice.be) | `mcp-server/` | [WOLFGANG.md](mcp-server/WOLFGANG.md) |
| **Daniel** | Frontend UI (Lovable) | `frontend/` | [DANIEL.md](frontend/DANIEL.md) |

## Stack

| Layer | Tool |
|-------|------|
| Frontend | Lovable → React + Vercel AI SDK |
| Agent backend | Ingram Cloud (Claude Sonnet 4.6, per-smith memory) |
| Tools | MCP server (Node.js) deployed to Vercel |
| PEPPOL | e-invoice.be API (sandbox company + PAI already set up) |
| Speech-to-text | Browser Web Speech API (Chrome, client-side) |

## Judging Criteria (max 75 pts)

| Criterion | Weight | Our answer |
|-----------|--------|------------|
| Automation depth | ×5 | Voice → PEPPOL → ledger, zero steps |
| Trust & compliance | ×4 | PEPPOL validated, auditable trail |
| Real-world pull | ×3 | Donna integration, Belgian SMEs |
| Agentic execution | ×2 | Ingram Cloud smiths with memory + approval gating |
| Compelling pitch | ×1 | Live demo: speak → invoice sent in <30s |

## Blockers to Resolve First

1. Bassel shares `EINVOICE_API_KEY` and `SENDER_PEPPOL_ID` with Wolfgang via DM
2. Bassel shares `INGRAM_TOKEN` with Daniel via DM
3. Wolfgang deploys MCP server → shares URL with Bassel to register in Ingram Cloud
4. Daniel connects Lovable to this GitHub repo (`frontend/` folder)
