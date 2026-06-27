# Daniel — Frontend UI (Lovable)

You own the frontend: a polished React app built with Lovable that lets a field worker speak a job description and watch the invoice flow happen live.

## What you're building

4 sequential panels on one page:

1. **Mic panel** — big record button, live transcript
2. **Invoice preview** — extracted fields, editable, PEPPOL validation badge
3. **Approval panel** — "Send €278.07 to Martens Sanitair?" + one green button
4. **Confirmation** — success message + double-entry T-accounts (debit/credit)

## Step 1 — Generate the UI in Lovable

1. Go to [lovable.dev](https://lovable.dev) and start a new project
2. Open `frontend/lovable-prompt.md` in this repo — paste that prompt into Lovable
3. Let Lovable generate the full UI

## Step 2 — Connect Lovable to this GitHub repo

In Lovable: **Settings → GitHub → Connect repository**
- Repo: `bsselm/colihack`
- Branch: `main`
- Folder: `frontend/`

Lovable will push its generated code directly into the `frontend/` folder. Pull after connecting.

## Step 3 — Wire up the mic (Web Speech API)

In your `MicButton` component, add:

```typescript
const startRecording = () => {
  const recognition = new (window as any).webkitSpeechRecognition();
  recognition.lang = 'nl-BE'; // Dutch Belgian — change to fr-BE for French
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((r: any) => r[0].transcript)
      .join('');
    setTranscript(transcript);
  };

  recognition.onend = () => setIsRecording(false);
  recognition.start();
  setIsRecording(true);
};
```

## Step 4 — Wire up Ingram Cloud

Bassel will give you the `INGRAM_TOKEN` and the Smith ID. Use the helper in `frontend/lib/ingram.ts`:

```typescript
import { runInvoiceAgent, approveToolCall } from '../lib/ingram';

// When user clicks "Process" after transcript is ready:
const response = await runInvoiceAgent(SMITH_ID, transcript, threadId);

// Stream SSE events — listen for:
// - message.delta → update the invoice preview fields
// - approval.required → show the Approval Panel with the approval_id
// - run.completed → show the Confirmation Panel
```

## Step 5 — Handle the approval moment

When the agent is ready to send the invoice, Ingram Cloud fires an `approval.required` SSE event. This is the "accountant just signs" moment — show the Approval Panel:

```typescript
if (event.type === 'approval.required') {
  setApprovalId(event.approval_id);
  setShowApprovalPanel(true);
}

// When user clicks "Approve & Send":
const onApprove = async () => {
  await approveToolCall(SMITH_ID, runId, approvalId);
  // Agent resumes, invoice sends, confirmation panel appears
};
```

## Step 6 — Environment variables

Create `frontend/.env.local`:
```
NEXT_PUBLIC_INGRAM_TOKEN=your_token_from_bassel
NEXT_PUBLIC_SMITH_ID=smt_...  # Bassel creates this for you
```

## Key files

| File | Purpose |
|------|---------|
| `frontend/lovable-prompt.md` | The Lovable generation prompt |
| `frontend/lib/ingram.ts` | Ingram Cloud API calls (already written) |

## Notes for the demo

- Use **Chrome** — Web Speech API doesn't work in Firefox/Safari
- Set the mic language to `nl-BE` (Dutch) for the demo — judges are Belgian
- The approval modal is the money moment — make it big and clear
- Keep the bookkeeping T-accounts visible on screen during the pitch
