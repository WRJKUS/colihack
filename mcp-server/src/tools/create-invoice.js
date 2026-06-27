import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getSellerInfo() {
  // Try seller.json first (local override), fall back to env vars
  const sellerPath = join(__dirname, "../../data/seller.json");
  if (existsSync(sellerPath)) {
    return JSON.parse(readFileSync(sellerPath, "utf8"));
  }
  return {
    name: process.env.SELLER_NAME,
    vat_number: process.env.SELLER_VAT,
    peppol_id: `${process.env.SENDER_PEPPOL_SCHEME}:${process.env.SENDER_PEPPOL_ID}`,
    address: { street: process.env.SELLER_ADDRESS, country: "BE" },
    iban: process.env.SELLER_IBAN,
    default_payment_terms_days: 30
  };
}

const BASE_URL = "https://api.e-invoice.be";

export async function createInvoice({
  buyer_name, buyer_peppol_id, buyer_vat, buyer_address,
  lines, payment_terms_days, invoice_number
}) {
  const seller = getSellerInfo();
  const issueDate = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + (payment_terms_days ?? 30) * 86400000).toISOString().split("T")[0];

  const payload = {
    type: "invoice",
    number: invoice_number ?? `INV-${Date.now()}`,
    issue_date: issueDate,
    due_date: dueDate,
    seller: {
      name: seller.name,
      tax_id: seller.vat_number,
      address: seller.address,
      iban: seller.iban
    },
    buyer: {
      name: buyer_name,
      tax_id: buyer_vat ?? null,
      peppol_id: buyer_peppol_id,
      address: buyer_address ?? null
    },
    lines: lines.map((l, i) => ({
      id: String(i + 1),
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      vat_rate: l.vat_rate
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
  const doc = await res.json();

  // Compute totals for display
  const totalExclVat = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const vatAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price * l.vat_rate / 100, 0);

  return {
    document_id: doc.id,
    invoice_number: payload.number,
    buyer: buyer_name,
    issue_date: issueDate,
    due_date: dueDate,
    total_excl_vat: Math.round(totalExclVat * 100) / 100,
    vat_amount: Math.round(vatAmount * 100) / 100,
    total_incl_vat: Math.round((totalExclVat + vatAmount) * 100) / 100,
    lines
  };
}
