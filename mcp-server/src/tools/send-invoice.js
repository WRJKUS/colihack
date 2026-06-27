const BASE_URL = "https://api.e-invoice.be";
const SENDER_PEPPOL_SCHEME = process.env.SENDER_PEPPOL_SCHEME ?? "0208";
const SENDER_PEPPOL_ID = process.env.SENDER_PEPPOL_ID; // your PAI

export async function sendInvoice({ document_id, receiver_peppol_id, email }) {
  const [scheme, id] = receiver_peppol_id.split(":");
  const params = new URLSearchParams({
    sender_peppol_scheme: SENDER_PEPPOL_SCHEME,
    sender_peppol_id: SENDER_PEPPOL_ID,
    receiver_peppol_scheme: scheme,
    receiver_peppol_id: id,
    ...(email ? { email } : {})
  });

  const res = await fetch(`${BASE_URL}/api/documents/${document_id}/send?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.EINVOICE_API_KEY}` }
  });
  if (!res.ok) throw new Error(`Send failed: ${res.status} ${await res.text()}`);
  return res.json();
}
