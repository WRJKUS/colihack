import { BASE_URL, buildInvoicePayload } from "./create-invoice.js";

// Validates the invoice JSON payload BEFORE creating the document.
// e-invoice.be exposes POST /api/validate/json which takes the full
// document payload (same shape as POST /api/documents) and returns
// any PEPPOL/EN16931 compliance issues. There is no per-document
// /validate endpoint, so we validate the payload pre-create.
export async function validateInvoice(args) {
  const payload = buildInvoicePayload(args);

  const res = await fetch(`${BASE_URL}/api/validate/json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EINVOICE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`Validation request failed: ${res.status} ${await res.text()}`);
  const result = await res.json();

  // Response schema: { id, is_valid, issues:[{message,type,location,rule_id,...}] }
  const all = result.issues ?? [];
  const errors = all.filter((i) => i.type === "error");
  const warnings = all.filter((i) => i.type === "warning");
  return {
    valid: result.is_valid ?? errors.length === 0,
    errors,
    warnings
  };
}
