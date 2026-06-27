---
marp: true
theme: default
paginate: true
size: 16:9
---

<!-- _paginate: false -->

# 🎙️ Voice Invoice
## *Speak it. Sign it. Sent.*

One spoken sentence → a **sent PEPPOL e-invoice** + a **balanced double-entry ledger**.

**The accountant just signs.**

<small>Track 1 · Belgian SME invoicing · live on Cloudflare + e-invoice.be (PEPPOL)</small>

<!-- Hook: hold up a phone. "Watch a plumber invoice a client in one sentence." -->

---

# Belgian SMEs are about to drown in invoicing

- Finish the job → **20 minutes of admin**: client PEPPOL ID, VAT rate, line items, UBL, send it… then book it into the ledger.
- **2026: B2B e-invoicing over PEPPOL becomes mandatory** — every Belgian SME, all at once.
- Everyone keeps describing the same dream: the **“€50-a-year accountant who just signs.”**

### We built the machine that makes that real.

<!-- 45s. Land the mandate + the "just signs" dream — that's the whole product in one line. -->

---

# One sentence. One tap.

> 🗣️ *“Invoice Proximus for 1 hour of work plus the drive, for fixing their toilet.”*

**The agent, in a single turn:**
find client → price the work (**€65 + €45**) → VAT **21%** → ✅ **validate** → create UBL →
⏸️ **€133.10 to Proximus — Sign & Send?**

**👆 One tap →** transmitted over PEPPOL · ledger booked · **PDF + UBL** ready to download.

### ⏱️ Speech → sent → booked, in under 30 seconds.

<!-- 2.5 min. THIS is the pitch. Do it live. The amber "Sign & Send" pause is the money shot. -->

---

# Safe to sign

- Every invoice is **validated against PEPPOL / EN16931 *before* it can be sent** — real UBL 2.1, real Belgian Access Point.
- **Live proof:** it **refused a bad enterprise number** (MOD97 checksum fail, rule `PEPPOL-COMMON-R043`). It will not send garbage.
- Belgian **VAT logic** (21 / 12 / 6 / 0%) baked in · full **provenance**: spoken word → catalog item → VAT decision → UBL → ledger line.

### An accountant can audit the whole chain — and sign without fear.

<!-- 45s. "Trust & compliance." The refusal story is stronger than any claim. -->

---

# Real authority — one guardrail

- **Ingram Cloud** agent (Claude) wired to **7 MCP tools** — it **creates and sends real invoices**.
- Bounded by **one human approval at the irreversible step** (`destructiveHint` gate). Real authority, real fence.
- **Deployed & working today**, not a mockup.

`Voice (Whisper) → Agent → MCP tools → e-invoice.be → PEPPOL`

**Auto double-entry:**  Debit 400 AR **€133.10** · Credit 700 Revenue **€110.00** · Credit 451 VAT **€23.10**

<!-- 30s. "It actually works." Agentic execution + the books balance automatically. -->

---

# An SME would use this Monday

- **WhatsApp-simple:** one sentence, one tap. Dutch · French · English.
- A real business **actually sends and books** an invoice — live, on a real PEPPOL sandbox.

> Belgian SMEs are being **forced** onto PEPPOL. We turn that obligation into **one sentence and one tap.**

## The agent does the accounting. The human just signs.
### → That’s automatic accounting — and it sends real invoices today.

<!-- 45s close. Real-world pull + the memorable line. Leave them with "speak it, sign it, sent." -->
