# Implementation Plan — Field AI Invoicing Assistant

**Goal:** A voice-first agent for Belgian field workers (plumbers, cleaners, consultants) that turns one spoken sentence into a sent, Peppol-compliant invoice + double-entry ledger.
**Stack:** Ingram Cloud agent (Claude) → Node MCP server (6 tools) → e-invoice.be (Peppol Access Point).

This plan is grounded in the actual docs (e-invoice.be `llms.txt` + schema/auth pages, Ingram `tools`/`runs` pages), cross-checked against the existing scaffold. Claims below are marked **confirmed** (read from docs) or **unconfirmed** (needs a doc/curl check before relying on it).

---

## 1. Confirmed API facts

### e-invoice.be
- **Base URL:** `https://api.e-invoice.be` — *confirmed*
- **Auth header:** `Authorization: Bearer <API_KEY>` — *confirmed*. Key from app.e-invoice.be → Settings → API Keys.
- **Endpoints** (*confirmed* from `llms.txt`):
  - `POST /api/documents` — create document
  - `POST /api/documents/from-pdf` · `POST /api/documents/from-ubl`
  - `POST /api/validate/json` · `POST /api/validate/ubl` — validate a **payload**, pre-create
  - `POST /api/documents/{id}/send` — send via Peppol
  - `GET /api/lookup/peppol-id` · `GET /api/lookup/participants`
  - `GET /api/documents/{id}` · `/ubl` · `/timeline`
- **Create-document body** (*confirmed* fields, all optional except `items`):
  - Top: `document_type` (INVOICE|CREDIT_NOTE|DEBIT_NOTE), `invoice_id`, `invoice_date`, `due_date`, `currency` (default EUR), `purchase_order`, `note`, `payment_term`
  - Vendor: `vendor_name`, `vendor_tax_id`, `vendor_address`, `vendor_email`
  - Customer: `customer_name`, `customer_tax_id`, `customer_address`, `customer_email`
  - Financial (optional, server can compute): `subtotal`, `total_tax`, `invoice_total`, `amount_due`
  - **`items[]` (required, min 1)** — LineItem: `description`, `product_code`, `quantity`, `unit`, `unit_price`, `amount`, `tax_rate` (number|string, e.g. `"21.00"`), **`tax`** (per-line VAT amount), `allowances`, `charges`
  - ⚠️ Per-line VAT field is **`tax`** (NOT `tax_amount`/`vat_amount`) — *confirmed by live validate test*. `tax_rate` accepts number or string.
  - **Recipient Peppol ID:** dedicated top-level field **`customer_peppol_id`** (`scheme:identifier`). The `*_tax_id` fields hold the VAT number. Sender (vendor) Peppol ID is the account's — only `vendor_tax_id` (VAT) is sent vendor-side. — *confirmed by live validate test (PEPPOL-COMMON-R043 fired on `customer_peppol_id`→EndpointID)*
  - **`POST /api/validate/json`** takes the full DocumentCreate payload directly (not wrapped); returns `{ id, is_valid, issues:[{message,type:"error"|"warning",rule_id,...}] }`. — *confirmed*
  - **`POST /api/documents/{id}/send`** uses optional **query params** (`receiver_peppol_scheme/id`, `sender_*`); no JSON body. Defaults derived from the document's tax/peppol IDs. — *confirmed*
  - Top-level `subtotal/total_tax/invoice_total/amount_due` are server-computable; we still send them computed and they validate clean.

### Ingram Cloud
- **Base URL:** `https://api.cloud.ingram.tech` · header `IC-Api-Version: 2026-05-01` — *confirmed*
- **MCP registration:** `PUT /v1/tenant/mcp/{name}` with `{ url, auth: { kind: "none"|"static"|"oauth" } }`; re-probe with `POST /v1/tenant/mcp/{name}/refresh` — *confirmed*
- **Run:** `POST /v1/smiths/{id}/runs` (SSE when `stream:true`) — *confirmed*
- **SSE events:** `run.started`, `message.delta`, `tool.executing`, `tool.completed`, `approval.required`, `run.paused`, `run.completed`, `run.failed`, `run.duplicate` — *confirmed*
- **Approval gating:** server `annotations.destructiveHint: true` **or** an `approval_policy` glob list on the MCP resource — *confirmed*
- **`approval.required` payload:** `{ approval_id, tool, args, tool_call_id }` — *confirmed*
- **Resolve approval:** `POST /v1/smiths/{smith_id}/runs/{run_id}/submit` with `{ kind:"approval_decision", approval_id, decision:"approve"|"reject", actor, stream }` — *confirmed*

---

## 2. Bugs in the current scaffold (confirmed against docs)

| # | File | Problem | Fix | Status |
|---|------|---------|-----|--------|
| 1 | `mcp-server/src/tools/create-invoice.js` | Payload used `type/number/issue_date/seller{}/buyer{}/lines[]` — **wrong field names**; would 422. | Rewrote to `document_type/invoice_id/invoice_date/vendor_*/customer_*/items[]`; shared `buildInvoicePayload()`; `tax_rate` string, per-line `tax`, `customer_peppol_id` for routing. Create path is **`/api/documents/`** (trailing slash required — bare path 405s). | ✅ **DONE — live create persisted a DRAFT** (`state:DRAFT`, total 133.10); schema `valid:true` |
| 2 | `mcp-server/src/tools/validate-invoice.js` | Called `POST /api/documents/{id}/validate` — **no such endpoint**. | Re-pointed to `POST /api/validate/json` on the full payload **pre-create**; now takes invoice fields (not a `document_id`); parses `is_valid`/`issues`. Workflow reordered: validate → create. | ✅ **DONE — live-tested** |
| 3 | `mcp-server/src/tools/send-invoice.js` | Sender/receiver passed as query params incl. undocumented `email`. | Confirmed query-param shape; pass `receiver_peppol_scheme/id` override, let sender derive from document; dropped `email`. | ✅ **DONE — live send `DRAFT→TRANSIT→SENT`** (sandbox, user-authorized) |
| 4 | `frontend/lib/ingram.ts` → `approveToolCall` | Hits `POST /v1/approvals/{id}/submit` with `{decision}` — **wrong endpoint + body** (`BASSEL.md` step 5 has the same bug). | Now goes through the Worker proxy → `/v1/smiths/{smith_id}/runs/{run_id}/submit` with `{kind:"approval_decision", approval_id, decision, actor}`. Token server-side. | ✅ **DONE** (live-tested via proxy: reject path confirmed no-send) |
| 5 | `frontend/lib/ingram.ts` → `streamRun` | Parsed `event.type` from the `data` JSON — **that field never exists**; the event NAME is on the SSE `event:` line, so no events ever matched. | Rewrote SSE parser to key on the `event:` line; tracks `run.started` (smith_id/run_id) + tool events. | ✅ **DONE** |
| 6 | `agent/mcp-config.json` | Stale: listed `lookup_peppol_participant`, missing `lookup_client/get_vat_rate/lookup_service`. | Rewrote to the 7 real tools; confirmed `PUT /v1/tenant/mcp/{name}` supports `tool_allowlist` + `approval_policy`. Allowlist now matches live `tools/list` exactly. | ✅ **DONE** |

**Net:** the create → validate → approve happy path does **not** work as written. Fixing it is the core of the build.

---

## 3. Phased plan

### Phase 0 — Accounts & secrets (blocking)
- e-invoice.be sandbox API key; sandbox sender company Peppol ID + VAT → fill `SENDER_*`, `SELLER_*` in `.env`.
- Ingram tenant-admin token + an `agent_id`.
- `cd mcp-server && npm install` (no `node_modules` present yet); generate a 32-char `MCP_AUTH_SECRET`.

### Phase 1 — MCP server ↔ e-invoice.be (the real work)
1. Rewrite `create-invoice.js` to the confirmed schema (`vendor_*`/`customer_*`/`items[]`, `tax_rate` string).
2. Re-point `validate-invoice.js` to `POST /api/validate/json` (validate payload pre-create).
3. Confirm + fix `send-invoice.js` body shape (verify receiver-ID location).
4. Keep `lookup-peppol.js` (`/api/lookup/participants` is correct), `get-vat-rate.js`, `book-entries.js` (local logic, fine).
5. `curl`-test every tool against the live sandbox before wiring the agent (credentials available).

### Phase 1.5 — Data-entry frontend: customers, services & invoice data (NEW)
**Why:** today customers are a static seed (`mcp-server/data/clients.json`, loaded once at startup) and there is **no service/product catalog at all**. For the plumber to say *"write an invoice for 1 hour of work plus the drive to Ingram for fixing their toilet,"* the agent must resolve **"Ingram" → a customer record**, **"1 hour of work" → a labour service** (unit price + VAT), and **"the drive" → a travel/call-out service**. None of that data is enterable today. This phase adds the UI + backing store to manage it.

**3a. Backing data store (MCP server)**
- Make the customer store writable (the current read-once `clients.json` can't be edited from a UI). Add a small store + REST CRUD on the MCP server that the agent's lookup tools read from the same source:
  - `GET/POST/PUT/DELETE /api/customers` — name, aliases, `vendor`-side fields, Peppol ID, VAT, address, email, payment-terms days, default hourly rate, notes.
  - `GET/POST/PUT/DELETE /api/services` — **new** `data/services.json` catalog: code, label, `unit` (HUR/EA/KM…), `unit_price`, default `tax_rate`/`tax_code`, type (labour | travel | parts). Seed with: hourly labour, call-out/drive fee, common parts.
  - `GET/PUT /api/seller` — the company profile currently split across `.env`/`seller.json`; make it editable.
- Keep these endpoints behind the same `MCP_AUTH_SECRET` auth as `/mcp`.

**3b. New MCP tool** — `lookup_service` (brings tool count 6 → 7): maps a phrase ("1 hour of work", "the drive", "thermostat") to a catalog item with `unit_price`, `unit`, and default `tax_rate`. Register it in `index.js` `TOOLS` + `dispatch`, and reference it in `agent/system-prompt.md` so the agent enriches free-text into priced line items.

**3c. Management UI** (extend the Lovable/React frontend)
- Customers tab: list + add/edit form (the fields above), with a "validate Peppol ID" action hitting `lookup_peppol`.
- Services tab: catalog CRUD (labour / travel / parts), each with default VAT.
- Company/seller settings tab.
- These screens write to the 3a endpoints; the voice agent reads the same data — single source of truth.

**Worked example — "invoice for 1h work + the drive to Ingram for fixing their toilet":**
1. `lookup_client("Ingram")` → customer record (Peppol ID, VAT, address, terms).
2. `lookup_service("1 hour of work")` → labour @ rate, unit HUR, qty 1.
3. `lookup_service("the drive")` → travel/call-out fee, unit EA or KM.
4. `get_vat_rate("toilet repair / plumbing", is_private_dwelling?, building_age?)` → 21% or 6% (renovation of private dwelling >10y).
5. `create_invoice` with both line items → `validate_invoice` → preview → **approve** → `send_invoice` → `book_entries`.

### Phase 2 — Ingram agent + MCP registration
- Deploy/expose MCP server → `PUT /v1/tenant/mcp/{name}` at the public `/mcp` URL, `auth.kind:"static"` matching `MCP_AUTH_SECRET`.
- Create agent from `agent/system-prompt.md`; confirm `tools/list` discovery and that `send_invoice`'s `destructiveHint`/`approval_policy` triggers `approval.required`.

**Status — prepared, blocked on 2 inputs:**
- ✅ Confirmed API shapes via docs: `POST /v1/agents {slug,name,instructions,model}`; `PUT /v1/tenant/mcp/{name} {url,auth,tool_allowlist,approval_policy}`; approval gate = server `destructiveHint` **OR** `approval_policy` match; approval resolves at `POST /v1/smiths/{id}/runs/{run_id}/submit`.
- ✅ `agent/mcp-config.json` rewritten to the 7 real tools (matches live `tools/list`).
- ✅ `agent/setup-ingram.mjs` — runnable script that creates the agent + registers the MCP + verifies discovery. Needs env `INGRAM_TOKEN`, `MCP_PUBLIC_URL`, `MCP_AUTH_SECRET`.
- ✅ **LIVE (wolf track):** deployed to **Cloudflare Workers** at `https://einvoice-wolf.riegler31.workers.dev` (src/worker.js + core.js, `nodejs_compat`, JSON-bundled data, env→process.env shim). Live `wolf_validate_invoice` → `valid:true`.
- ✅ **Agent** `agt_1CcTkzST6nqLeQ3Dr7AHdQ` (`voice-invoice-wolf`) published v1 with `wolf_`-prefixed prompt.
- ✅ **MCP `einvoice-wolf` registered** (tenant), `status: active`, all 7 `wolf_` tools discovered. Separate from Bassel's stale `einvoice` MCP.
- Remaining: create a smith on the agent + run the demo sentence to confirm the tool chain and the `wolf_send_invoice` approval gate.

### Phase 3 — Frontend (voice flow) — ✅ LIVE (wolf track)
- **Token-safe proxy** added to the Worker (`/api/run`, `/api/approve`): the Ingram admin token is a Worker secret and never reaches the browser. Verified live (run streams the chain; approve(reject) confirmed no-send).
- **Runnable app** `frontend-wolf/` (Vite + React + TS): Web Speech mic → proxy → live tool progress + streamed agent summary → amber approval panel → approve/reject. Deployed to **Cloudflare Pages: https://voice-invoice-wolf.pages.dev**.
- **`frontend/lib/ingram.ts` rewritten** to the corrected contract (bugs #4/#5) for Daniel's Lovable app: proxy-based, `event:`-line SSE parsing, correct approval submit.
- Speech-to-text = browser Web Speech API (per STT section), Chrome-only.
- ⚠️ Not browser-tested headlessly: the live voice capture + the real approve→PEPPOL-send need a human in Chrome. Thread continuity remains non-functional, but the one-turn agent design means it isn't needed.
- Still plan-only: the Phase 1.5 management screens (customers/services/company CRUD UI).

### Speech-to-text (STT)
**Current choice (*confirmed* in code/docs):** the **browser Web Speech API** — `window.SpeechRecognition || window.webkitSpeechRecognition`, client-side, no API key. Implemented in `frontend/DANIEL.md:48-59`; locales **nl-BE / fr-BE** (`README.md:45`); **Chrome-only** (`SETUP.md:9`, `DANIEL.md:156` — fails in Firefox/Safari).

**Caveats (risk to a live demo):**
- Chrome-only; requires mic permission + network. In Chrome the audio is sent to Google's servers, so it is free-to-us but **not offline** and needs working venue wifi.
- Accuracy on Belgian-accented nl/fr and domain terms ("Peppol", company names like "Ingram") is **unconfirmed** — verify with a real mic test before relying on it.

**Plan:**
1. Keep Web Speech API as the primary path (zero cost, zero setup, already scaffolded).
2. **Mic test in Phase 4** end-to-end checklist: speak the example sentence in nl-BE and confirm the transcript is usable.
3. **Optional upgrade if accuracy is poor:** swap to a server-side STT (e.g. Whisper / Deepgram) behind a small `/api/transcribe` endpoint that takes recorded audio and returns text — same transcript contract downstream, so nothing else changes. Adds an API key + cost; only do this if the mic test fails. *(Provider/pricing unconfirmed — decide only if needed.)*

### Phase 4 — End-to-end test (`SETUP.md`)
- First, via the new UI: add the "Ingram" customer and the labour + drive services.
- Then voice the example: *"invoice for 1h work + the drive to Ingram for fixing their toilet."*
- Flow: lookup_client → lookup_service ×2 → get_vat_rate → create → validate → preview → **approve** → send → Peppol receipt → book_entries (T-accounts).

### Phase 5 — Demo polish
Invoice preview, T-account display, <30s wall-clock from speech to "sent".

---

## 3b. Sender Peppol identity — RESOLVED
`data/seller.json` now holds the tenant's real sandbox sender: **collibra-hack, VAT `BE0999787908`, `0208:0999787908`**. Live `create_invoice` succeeds → persists a **DRAFT** OUTBOUND document (verified: `GET /api/documents/{id}` → 200, `state: DRAFT`, total 133.10). Response id shape is `doc.id` (e.g. `doc-…`). `send_invoice` **verified live** (user-authorized, sandbox): the draft `doc-fz8w1m1z4stu15abbg7y4ihouctwn8jy` went `DRAFT → TRANSIT → SENT`; timeline confirms sender `0208:0999787908` / receiver `0208:0563825564`. Note: sandbox marked SENT even though the Ingram buyer id is fictional/unregistered — sandbox does not appear to hard-fail on recipient SMP lookup, so a *real* delivery still requires a genuinely registered recipient.

## 4. Open items to confirm before/while coding
- Exact location of the Peppol **receiver ID** in create vs. send (Phase 1.3/1.4).
- Whether e-invoice.be **computes totals** server-side or expects `subtotal/total_tax/invoice_total` in the create body.
- Ingram `approval_policy` vs. `destructiveHint` — pick one; `destructiveHint` already set on `send_invoice` is simplest.
