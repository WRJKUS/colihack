# Daniel — Frontend (Lovable)

You own the frontend: a polished React app where a field worker speaks a job description and watches the full invoice flow happen live.

---

## Step 1 — Generate the UI in Lovable

1. Go to [lovable.dev](https://lovable.dev) → new project
2. Open `frontend/lovable-prompt.md` in this repo
3. Paste the full prompt into Lovable
4. Let it generate — takes ~2 min

---

## Step 2 — Connect Lovable to GitHub

In Lovable: **Settings → GitHub → Connect repository**
- Repo: `bsselm/colihack`
- Branch: `main`
- Subfolder: `frontend/`

Lovable pushes its generated code directly into `frontend/`. Pull when connected.

---

## Step 3 — Environment variables

In Lovable **Settings → Environment variables**, add:
```
VITE_INGRAM_TOKEN=<token from Bassel>
VITE_AGENT_ID=<agt_... from Bassel>
```

Update `frontend/lib/ingram.ts` line 2 to use Vite env:
```typescript
const API_KEY = import.meta.env.VITE_INGRAM_TOKEN ?? "";
```

---

## Step 4 — Wire the mic (Web Speech API)

Add to your `MicButton` component:

```typescript
const startRecording = () => {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = "nl-BE"; // Switch to "fr-BE" for French, "en-GB" for English
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

---

## Step 5 — Wire Ingram Cloud

```typescript
import { createSmith, runInvoiceAgent, streamRun, approveToolCall } from "../lib/ingram";

const AGENT_ID = import.meta.env.VITE_AGENT_ID;

// On page load — upsert is safe, creates or returns existing smith
useEffect(() => {
  createSmith("demo_user_1", "Field Worker", AGENT_ID).then(s => setSmithId(s.id));
}, []);

// When user clicks "Process"
const onProcess = async () => {
  setIsProcessing(true);
  const threadId = `thread_${Date.now()}`;
  const response = await runInvoiceAgent(smithId, transcript, threadId);

  await streamRun(response, {
    onDelta: (text) => {
      // Agent is reasoning — append to a hidden buffer
      // Parse JSON fragments to extract invoice fields as they arrive
      setAgentBuffer(prev => prev + text);
    },
    onApprovalRequired: (approvalId) => {
      // Agent is ready to send — show the approval panel
      setCurrentApprovalId(approvalId);
      setStep("approval");
    },
    onCompleted: () => {
      // All done — show confirmation and bookkeeping
      setStep("confirmation");
      setIsProcessing(false);
    },
    onError: (err) => {
      console.error(err);
      setIsProcessing(false);
    }
  });
};

// When user clicks "Approve & Send"
const onApprove = async () => {
  await approveToolCall(currentApprovalId);
  // Agent resumes automatically — onCompleted fires when done
};
```

---

## Step 6 — State to manage

```typescript
type Step = "input" | "preview" | "approval" | "confirmation";

const [step, setStep] = useState<Step>("input");
const [transcript, setTranscript] = useState("");
const [isRecording, setIsRecording] = useState(false);
const [isProcessing, setIsProcessing] = useState(false);
const [smithId, setSmithId] = useState("");
const [currentApprovalId, setCurrentApprovalId] = useState("");
const [agentBuffer, setAgentBuffer] = useState("");

// Reset
const onNewInvoice = () => {
  setStep("input");
  setTranscript("");
  setAgentBuffer("");
};
```

---

## The 4 panels at a glance

| Panel | Shows when | Key element |
|-------|-----------|-------------|
| `input` | Always (start) | Big red mic button, transcript box, "Process" |
| `preview` | After agent creates + validates | Invoice card, PEPPOL Valid badge, progress steps |
| `approval` | `onApprovalRequired` fires | Amber card, "Approve & Send" button |
| `confirmation` | `onCompleted` fires | Green success, T-account table, "New Invoice" |

---

## Notes for the demo

- **Chrome only** — Web Speech API doesn't work in Firefox or Safari
- Language `nl-BE` for the demo — judges are in Brussels
- The **approval panel** is the critical moment — make it visually unmissable
- The **T-account table** must be on screen at the end — judges are scoring bookkeeping
- After "Approve & Send" the invoice is actually sent via PEPPOL — this is real
- Test the full flow yourself before the pitch using the sentence: *"Fixed the boiler at Martens Sanitair, 3 hours labour at 65 euro, parts 87 euro"*
