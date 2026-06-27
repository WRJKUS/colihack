# Lovable UI Prompt

Paste this into Lovable to generate the frontend:

---

Build a clean, professional web app called "Voice Invoice" for Belgian field workers to convert spoken job descriptions into PEPPOL e-invoices.

**Layout:** Single page. Light sidebar on the left showing recent invoices. Main content area on the right with 4 sequential panels that appear as the flow progresses.

**Sidebar:**
- App name "Voice Invoice" at the top with a small microphone icon
- Below: list of recent invoices (client name, amount, status badge — Sent / Pending / Draft)
- Each invoice card shows: client name, date, total amount, coloured status dot

**Main content — 4 sequential panels:**

**Panel 1: Voice Input** (always visible at start)
- Large circular mic button — red with pulse animation when recording, grey when idle
- Text below mic: "Speak your job description"
- Live transcript box fills in as user speaks (light grey background, monospace font)
- Example placeholder text: "e.g. Fixed the boiler at Martens Sanitair, 3 hours labour at €65, parts €87"
- "Process" button below transcript (disabled until transcript is non-empty)
- Small language selector: 🇧🇪 NL / FR / EN

**Panel 2: Invoice Preview** (appears after agent processes)
- Show a visual step-by-step progress while agent works:
  - ✓ Client found: Martens Sanitair (PEPPOL: 0208:XXXXXXXXXX)
  - ✓ VAT rate: 21% (standard)
  - ✓ Invoice created
  - ✓ PEPPOL Valid
- Below the progress: clean invoice card showing:
  - Invoice number and date
  - Seller name and buyer name
  - Line items table: Description / Qty / Unit Price / VAT / Line Total
  - VAT summary: excl. VAT / VAT amount / Total incl. VAT in bold
  - Payment due date
- All fields editable inline (click to edit before approving)
- "Edit" button to go back to transcript

**Panel 3: Approval** (appears when agent is ready to send)
- Yellow/amber background card
- Bold text: "Ready to send via PEPPOL"
- Invoice summary: client name, total amount, PEPPOL endpoint
- Two buttons: "Approve & Send" (green, large) and "Edit Invoice" (grey, small)
- Small note: "This action sends the invoice directly to the client's PEPPOL inbox"

**Panel 4: Confirmation + Bookkeeping** (appears after invoice sent)
- Green success banner: "Invoice sent via PEPPOL ✓" with timestamp
- Double-entry bookkeeping T-accounts displayed as a clean table:
  | Account | Type | Amount |
  |---------|------|--------|
  | 400 Accounts Receivable | Debit | €278.07 |
  | 700 Revenue | Credit | €229.81 |
  | 451 VAT Payable | Credit | €48.26 |
- "New Invoice" button to reset back to Panel 1

**Style:**
- Clean, minimal. White cards on very light grey (#F8F9FA) background
- Blue accent (#2563EB) for primary actions
- Green (#16A34A) for success states
- Amber (#D97706) for the approval panel
- Inter or system font, 14px body
- Fully responsive, works on tablet (field workers may use iPad)

**Tech stack:**
- React + TypeScript + Tailwind CSS
- Web Speech API for microphone
- Vercel AI SDK for streaming from backend agent
- No authentication needed for demo

**Important interactions:**
- Mic button: click to start recording, click again to stop
- While agent is processing: show animated loading dots next to each step
- Approval panel must be visually distinct — this is the critical moment
- After send: always show bookkeeping entries — this is a key demo moment
