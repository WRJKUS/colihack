# Daniel — Frontend (Lovable)

You own the frontend: a polished React app where a field worker speaks a job description and watches the invoice flow happen live on screen.

## What you're building

4 sequential panels:
1. **Mic panel** — big record button, live transcript
2. **Invoice preview** — extracted fields, editable, PEPPOL Valid badge
3. **Approval panel** — "Send €278.07 to Martens Sanitair?" + one green button
4. **Confirmation** — success + double-entry T-accounts

## Step 1 — Generate UI in Lovable

1. Go to [lovable.dev](https://lovable.dev) → new project
2. Open `frontend/lovable-prompt.md` → paste into Lovable
3. Let it generate the full React app

## Step 2 — Connect to GitHub

In Lovable: **Settings → GitHub → Connect repository**
- Repo: `bsselm/colihack`
- Branch: `main`
- Subfolder: `frontend/`

## Step 3 — Environment variables

In Lovable project settings, add:
```
VITE_INGRAM_TOKEN=<token from Bassel>
VITE_AGENT_ID=<agt_... from Bassel>
```

Update `frontend/lib/ingram.ts` line 2:
```typescript
const API_KEY = import.meta.env.VITE_INGRAM_TOKEN ?? "";
```

## Step 4 — Wire the mic (Web Speech API)

```typescript
const startRecording = () => {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = "nl-BE"; // Dutch Belgian for demo
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((r: any) => r[0].transcript)
      .join("");
    setTranscript(transcript);
  };

  recognition.onend = () => setIsRecording(false);
  recognition.start();
  setIsRecording(true);
};
```

## Step 5 — Wire Ingram Cloud

```typescript
import { createSmith, runInvoiceAgent, streamRun, approveToolCall } from "../lib/ingram";

const AGENT_ID = import.meta.env.VITE_AGENT_ID;

// On page load — safe to call every time (upsert)
const smith = await createSmith("demo_user_1", "Field Worker", AGENT_ID);
const smithId = smith.id; // smt_...

// When user clicks "Process"
const onProcess = async () => {
  const threadId = `thread_${Date.now()}`;
  const response = await runInvoiceAgent(smithId, transcript, threadId);

  await streamRun(response, {
    onDelta: (text) => {
      // Agent is thinking/responding — update invoice preview fields
      setAgentOutput(prev => prev + text);
    },
    onApprovalRequired: (approvalId) => {
      // Agent is ready to send — show approval modal
      setApprovalId(approvalId);
      setShowApproval(true);
    },
    onCompleted: () => {
      // Everything done — show confirmation + T-accounts
      setShowConfirmation(true);
    },
    onError: (err) => console.error(err)
  });
};

// When user clicks "Approve & Send"
const onApprove = async () => {
  await approveToolCall(approvalId);
  setShowApproval(false);
  // onCompleted fires from the resumed stream
};
```

## Step 6 — State to track

```typescript
const [transcript, setTranscript] = useState("");
const [isRecording, setIsRecording] = useState(false);
const [agentOutput, setAgentOutput] = useState("");
const [approvalId, setApprovalId] = useState("");
const [showApproval, setShowApproval] = useState(false);
const [showConfirmation, setShowConfirmation] = useState(false);
```

## Notes for the demo

- Use **Chrome** — Web Speech API only works in Chrome
- Language is `nl-BE` (Belgian Dutch) — judges are Belgian
- The approval modal is the money moment — make it visually bold
- The T-account display must be on screen during the pitch
- After "Approve & Send", the invoice is actually sent via PEPPOL — this is real
