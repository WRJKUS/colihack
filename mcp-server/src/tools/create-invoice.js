const BASE_URL = "https://api.e-invoice.be";

export async function createInvoice({
  seller_name, seller_vat, buyer_name, buyer_peppol_id, lines, invoice_number
}) {
  const payload = {
    type: "invoice",
    number: invoice_number ?? `INV-${Date.now()}`,
    issue_date: new Date().toISOString().split("T")[0],
    seller: { name: seller_name, tax_id: seller_vat },
    buyer: { name: buyer_name, peppol_id: buyer_peppol_id },
    lines: lines.map((l, i) => ({
      id: String(i + 1),
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      vat_rate: l.vat_rate ?? 21
    }))
  };

  const res = await fetch(`${BASE_URL}/api/documents/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EINVOICE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Create invoice failed: ${res.status} ${await res.text()}`);
  return res.json();
}
