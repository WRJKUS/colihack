import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

export const BASE_URL = "https://api.e-invoice.be";

function getSellerInfo() {
  // Try seller.json first (local/Node + Fly image). Wrapped so it degrades to
  // env vars where there is no filesystem (Cloudflare Workers).
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sellerPath = join(dir, "../../data/seller.json");
    if (existsSync(sellerPath)) {
      return JSON.parse(readFileSync(sellerPath, "utf8"));
    }
  } catch {
    // no filesystem (Workers) — fall through to env vars below
  }
  return {
    name: process.env.SELLER_NAME,
    vat_number: process.env.SELLER_VAT,
    // env stores scheme + id separately; build the "scheme:id" tax id
    peppol_id: `${process.env.SENDER_PEPPOL_SCHEME ?? "0208"}:${process.env.SENDER_PEPPOL_ID}`,
    address: { street: process.env.SELLER_ADDRESS, country: "BE" },
    iban: process.env.SELLER_IBAN,
    contact_email: process.env.SELLER_EMAIL,
    default_payment_terms_days: 30
  };
}

// e-invoice.be wants addresses as a single string.
function formatAddress(a) {
  if (!a) return undefined;
  if (typeof a === "string") return a;
  const line = [a.postal_code, a.city].filter(Boolean).join(" ");
  return [a.street, line, a.country].filter(Boolean).join(", ");
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Build the e-invoice.be document payload from the agent's invoice args.
 * Shared by create_invoice and validate_invoice so both speak the exact
 * same schema (POST /api/documents and POST /api/validate/json).
 *
 * Confirmed schema (docs.e-invoice.be): document_type, invoice_id, invoice_date,
 * due_date, currency, payment_term, vendor_*, customer_*, items[] with
 * { description, product_code, quantity, unit, unit_price, amount,
 *   tax_rate (STRING "21.00"), tax_amount }. The recipient Peppol ID is derived
 * from customer_tax_id ("scheme:identifier").
 */
export function buildInvoicePayload({
  buyer_name, buyer_peppol_id, buyer_vat, buyer_address, buyer_email,
  lines, payment_terms_days, invoice_number
}) {
  const seller = getSellerInfo();
  const termDays = payment_terms_days ?? seller.default_payment_terms_days ?? 30;
  const invoiceDate = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + termDays * 86400000).toISOString().split("T")[0];

  const items = lines.map((l) => {
    const amount = round2((l.quantity ?? 1) * l.unit_price);
    const rate = Number(l.vat_rate ?? 0);
    return {
      description: l.description,
      product_code: l.product_code ?? undefined,
      quantity: l.quantity ?? 1,
      unit: l.unit ?? "C62",
      unit_price: l.unit_price,
      amount,
      tax_rate: rate.toFixed(2),          // string "21.00" (number|string accepted)
      tax: round2(amount * rate / 100)    // per-line VAT amount — field is "tax"
    };
  });

  const subtotal = round2(items.reduce((s, it) => s + it.amount, 0));
  const totalTax = round2(items.reduce((s, it) => s + it.tax, 0));
  const invoiceTotal = round2(subtotal + totalTax);

  // DocumentCreate schema: VAT goes in *_tax_id; the PEPPOL routing id has its
  // own field. The sender (vendor) PEPPOL id is the account's, configured at
  // e-invoice.be, so only the VAT number is sent vendor-side.
  return {
    document_type: "INVOICE",
    invoice_id: invoice_number ?? `INV-${Date.now()}`,
    invoice_date: invoiceDate,
    due_date: dueDate,
    currency: "EUR",
    payment_term: `${termDays} days net`,

    vendor_name: seller.name,
    vendor_tax_id: seller.vat_number,
    vendor_address: formatAddress(seller.address),
    vendor_email: seller.contact_email,

    customer_name: buyer_name,
    customer_tax_id: buyer_vat ?? undefined,
    customer_peppol_id: buyer_peppol_id,   // recipient PEPPOL routing id
    customer_address: formatAddress(buyer_address),
    customer_email: buyer_email,

    subtotal,
    total_tax: totalTax,
    invoice_total: invoiceTotal,
    amount_due: invoiceTotal,

    items
  };
}

export async function createInvoice(args) {
  const payload = buildInvoicePayload(args);

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

  return {
    document_id: doc.id ?? doc.document_id,
    invoice_number: payload.invoice_id,
    buyer: payload.customer_name,
    invoice_date: payload.invoice_date,
    due_date: payload.due_date,
    total_excl_vat: payload.subtotal,
    vat_amount: payload.total_tax,
    total_incl_vat: payload.invoice_total,
    lines: payload.items
  };
}
