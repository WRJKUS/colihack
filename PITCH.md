# Voice Invoice — *Speak it. Sign it. Sent.*

**Track 1 · From one spoken sentence to a sent PEPPOL e-invoice and a balanced double-entry ledger — the accountant just signs.**

> A Belgian plumber finishes a job. He says one sentence into his phone.
> Thirty seconds later the client has a legally-compliant PEPPOL invoice in their
> inbox, and the books are already balanced. The only human action left is one tap: **Sign & Send.**

---

## The 5-minute script

### 0:00 — The problem (45s)
Every Belgian tradesperson, cleaner, consultant and caterer loses **hours a week** to invoicing admin. Finish the job, then go home and fight with a form: look up the client's PEPPOL ID, pick the right VAT rate, type the line items, generate UBL, send it, then book it into the ledger. It's the last, most annoying thing standing between *finishing the work* and *getting paid* — and from 2026 Belgian B2B e-invoicing over PEPPOL is **mandatory**, so this pain is about to hit every SME at once.

The dream everyone keeps describing: the **"€50-a-year accountant who just signs."** We built the machine that makes that real.

### 0:45 — The demo (2:30) — *this is the pitch*
Open the app. Tap the mic. Say:

> **“Invoice Proximus for one hour of work plus the drive, for fixing their toilet.”**

Watch the agent work, live, in one turn:
1. **Finds the client** — Proximus, PEPPOL `0208:0202239951`.
2. **Prices the work** — “1 hour of work” → labour €65/h; “the drive” → call-out €45. From our catalog, not guessed.
3. **Picks the VAT** — 21% (commercial client), with its reasoning.
4. **Validates** the invoice against PEPPOL / EN16931 — *before* creating it.
5. **Creates** the UBL invoice via e-invoice.be.
6. **Pauses.** An amber card appears: **€133.10 to Proximus — Sign & Send?**

That pause is the whole product. The agent did everything; the human does **one click**.

Tap **Approve & Send** →
7. It's **transmitted over the real PEPPOL network**.
8. The **double-entry ledger** appears automatically:
   - **Debit 400** Accounts Receivable €133.10
   - **Credit 700** Revenue €110.00
   - **Credit 451** VAT Payable €23.10
9. **Download the PDF** and the **UBL XML** right there.

Speech → sent → booked, **under 30 seconds**, one tap.

### 3:15 — Why it's safe to sign (45s)
This isn't a chatbot guessing. **Every invoice is validated against the official PEPPOL/EN16931 rules before it can be sent** — real UBL 2.1, via a real Belgian Access Point (e-invoice.be).

Our proof: during testing, the validator **rejected one of our own seeded clients** — a Belgian enterprise number that failed the MOD97 checksum (rule `PEPPOL-COMMON-R043`). The agent **refused to invoice it** and asked us to fix the number. It won't send garbage. Belgian VAT rules (21 / 12 / 6 / 0%) are baked in. Every number is traceable from spoken word to ledger line. **An accountant can audit the whole chain — and sign without fear.**

### 4:00 — Why an SME pays for this Monday (45s)
- **WhatsApp-simple:** one sentence, one tap. No forms, no training.
- **Multilingual:** Dutch, French, English — and voice that works on any browser (server-side Whisper, not the Chrome-only trick).
- **Manage-your-data screens** so the catalog and clients are *your* business, reused every time.
- **It already runs:** deployed on Cloudflare, talking to a live PEPPOL sandbox. Not a mockup — a real send.

The agent has **real authority** — it creates and transmits real invoices — fenced by **exactly one human gate at the irreversible step.** That's the accounting loop, automated end-to-end, with a human who *just signs*.

---

## How we score against the criteria

**1 · Automation depth — “Does the accountant just sign?”**
The entire loop runs hands-off: captured (voice) → enriched (client + catalog lookup) → categorised (VAT) → checked (PEPPOL validation) → created → booked (double-entry). The **only** human touch is the single approval tap at the send step. Literally one-click sign-off.

**2 · Trust & compliance — “Safe to sign.”**
PEPPOL/EN16931-validated UBL via a real Access Point; validation runs *before* send and **blocks** non-compliant data (demonstrated live — it refused a bad MOD97 number). Belgian VAT logic built in. Full provenance: spoken phrase → priced catalog item → VAT decision → UBL → ledger line, all auditable. The Ingram admin token never touches the browser; sends are gated.

**3 · Real-world pull — “An SME would pay for this.”**
Clear user (Belgian field workers), genuine pain (mandatory 2026 e-invoicing + hours of admin), WhatsApp-simple adoption. A real business **actually sends and books an invoice** in the demo. This is the “€50 accountant who just signs.”

**4 · Agentic execution — “It actually works.”**
A Claude agent on **Ingram Cloud** with **7 MCP tools** and **real authority** — it creates and sends invoices — bounded by a `destructiveHint` approval gate so the human owns the irreversible step. Data is structured (catalog + client store the agent reads live) so automation is obvious. Deployed and working: Cloudflare Worker (MCP server) + Pages (UI) + e-invoice.be (PEPPOL). The demo lands in 5 minutes.

**5 · Compelling pitch — “5 minutes that land.”**
One sentence in, a sent invoice and a balanced ledger out. The story is the demo, and the demo is the product: **speak it, sign it, sent.**

---

## Architecture (one breath)
**Voice (Whisper) → Ingram Cloud agent (Claude) → 7 MCP tools on a Cloudflare Worker → e-invoice.be → PEPPOL network**, with double-entry bookkeeping and a one-tap human approval at the send.

| Layer | What | Status |
|---|---|---|
| Voice | Cloudflare Workers AI **Whisper** (browser-agnostic) | live |
| Agent | **Ingram Cloud** smith (Claude), one-turn, approval-gated | live |
| Tools | 7 MCP tools (lookup client/service, VAT, validate, create, send, book) | live |
| Compliance | **e-invoice.be** PEPPOL Access Point, EN16931 validation, UBL 2.1 | live |
| App | Cloudflare **Pages** — voice, approval, invoices list, PDF/UBL, data mgmt | live |

## The 30-second close
Belgian SMEs are about to be *forced* onto PEPPOL. We turn that obligation into one spoken sentence and one tap. The agent does the accounting; the human just signs. **That's automatic accounting — and it already sends real invoices today.**
