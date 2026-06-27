# Lovable UI Prompt

Use this prompt in Lovable to generate the frontend:

---

Build a clean, modern web app called "Donna Invoice" for Belgian field workers to convert voice notes into PEPPOL e-invoices.

**Layout:** Single page, dark sidebar on left, main content area on right.

**Sidebar:** App name "Donna Invoice" at top, list of recent invoices below (client name, amount, status badge: sent/pending/draft).

**Main area — 4 sequential panels that appear as the flow progresses:**

1. **Voice Input Panel** (always visible)
   - Large circular mic button (red when recording, grey when idle)
   - Recording animation (pulsing ring) while active
   - Transcript text box below that fills in real time as user speaks
   - "Process" button below transcript

2. **Invoice Preview Panel** (appears after processing)
   - Extracted fields in a clean card: Client name, line items table (description / qty / unit price / VAT / total), VAT rate badge, invoice total
   - All fields editable inline
   - Green "PEPPOL Valid ✓" badge after validation

3. **Approval Panel** (appears before sending)
   - Summary: "Send invoice for €278.07 to Martens Sanitair via PEPPOL?"
   - Two buttons: "Approve & Send" (green) and "Edit" (grey)

4. **Confirmation + Bookkeeping Panel** (appears after sending)
   - "Invoice sent via PEPPOL ✓" success message with timestamp
   - Double-entry bookkeeping T-accounts:
     - Debit: 400 Accounts Receivable
     - Credit: 700 Revenue
     - Credit: 451 VAT Payable
   - "New Invoice" button to reset

**Style:** Clean, professional. White cards on light grey background. Blue accent colour. Inter font. Mobile-friendly.

**Tech:** React + TypeScript + Tailwind. Use Vercel AI SDK for streaming from the backend agent. Web Speech API for microphone. No auth needed for demo.
