const BASE_URL = "https://api.e-invoice.be";

export async function validateInvoice({ document_id }) {
  const res = await fetch(`${BASE_URL}/api/documents/${document_id}/validate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.EINVOICE_API_KEY}` }
  });
  if (!res.ok) throw new Error(`Validation failed: ${res.status}`);
  return res.json();
}
