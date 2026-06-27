import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getSellerInfo() {
  const sellerPath = join(__dirname, "../../data/seller.json");
  if (existsSync(sellerPath)) {
    return JSON.parse(readFileSync(sellerPath, "utf8"));
  }
  return {
    name: process.env.SELLER_NAME,
    vat_number: process.env.SELLER_VAT,
    company_id: process.env.SELLER_VAT?.replace(/^BE/, ""),
    peppol_id: `${process.env.SENDER_PEPPOL_SCHEME}:${process.env.SENDER_PEPPOL_ID}`,
    address: process.env.SELLER_ADDRESS,
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

  // e-invoice.be uses flat vendor_*/customer_* fields (not nested objects).
  // Sender PEPPOL is auto-derived from the API key; only receiver goes in customer_peppol_id.
  const payload = {
    document_type: "INVOICE",
    currency: "EUR",
    invoice_id: invoice_number ?? `INV-${Date.now()}`,
    invoice_date: issueDate,
    due_date: dueDate,
    vendor_name: seller.name,
    vendor_tax_id: seller.vat_number,
    vendor_company_id: seller.company_id ?? seller.vat_number?.replace(/^BE/, ""),
    vendor_address: typeof seller.address === "object"
      ? `${seller.address.street}, ${seller.address.zip ?? ""} ${seller.address.city ?? ""}`.trim()
      : seller.address,
    customer_name: buyer_name,
    customer_tax_id: buyer_vat ?? null,
    customer_company_id: buyer_vat ? buyer_vat.replace(/^BE/, "") : null,
    customer_peppol_id: buyer_peppol_id ?? null,
    customer_address: buyer_address ?? null,
    items: lines.map(l => ({
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.vat_rate
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

  const totalExclVat = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const vatAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price * l.vat_rate / 100, 0);

  return {
    document_id: doc.id,
    invoice_number: doc.invoice_id,
    buyer: buyer_name,
    issue_date: issueDate,
    due_date: dueDate,
    total_excl_vat: Math.round(totalExclVat * 100) / 100,
    vat_amount: Math.round(vatAmount * 100) / 100,
    total_incl_vat: Math.round((totalExclVat + vatAmount) * 100) / 100,
    lines
  };
}
