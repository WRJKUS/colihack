import { BASE_URL } from "./create-invoice.js";

// Send a created document over PEPPOL: POST /api/documents/{id}/send.
// By default e-invoice.be derives sender + receiver Peppol IDs from the
// (tax) IDs in the document. Explicit query params override those defaults.
// We pass the receiver override (the agent provides it) and let the sender
// derive from the document's vendor_tax_id. No JSON body is used.
export async function sendInvoice({ document_id, receiver_peppol_id }) {
  const params = new URLSearchParams();

  if (receiver_peppol_id) {
    const idx = receiver_peppol_id.indexOf(":");
    if (idx > 0) {
      params.set("receiver_peppol_scheme", receiver_peppol_id.slice(0, idx));
      params.set("receiver_peppol_id", receiver_peppol_id.slice(idx + 1));
    }
  }

  const qs = params.toString();
  const url = `${BASE_URL}/api/documents/${document_id}/send${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.EINVOICE_API_KEY}` }
  });

  if (!res.ok) throw new Error(`Send failed: ${res.status} ${await res.text()}`);
  return res.json();
}
