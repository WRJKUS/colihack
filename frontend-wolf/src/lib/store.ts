// CRUD client for the Worker's /api/customers, /api/services, /api/seller.
const BASE =
  (import.meta as any).env?.VITE_PROXY_BASE ||
  "https://einvoice-wolf.riegler31.workers.dev";

export interface Customer {
  id?: string; name: string; aliases?: string[]; vat_number?: string;
  peppol_id?: string; address?: string; contact_email?: string;
  payment_terms_days?: number; default_hourly_rate?: number; notes?: string;
}
export interface Service {
  id?: string; code: string; label: string; aliases?: string[]; type?: string;
  unit?: string; unit_price?: number; tax_rate?: string; description?: string;
}
export interface Seller {
  name: string; vat_number: string; peppol_scheme?: string; peppol_id: string;
  address?: string; contact_email?: string; iban?: string; default_payment_terms_days?: number;
}

async function req(url: string, opts?: RequestInit) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`);
  return r.json();
}

export const listCustomers = () => req(`${BASE}/api/customers`) as Promise<Customer[]>;
export const createCustomer = (c: Customer) => req(`${BASE}/api/customers`, { method: "POST", body: JSON.stringify(c) });
export const updateCustomer = (c: Customer) => req(`${BASE}/api/customers`, { method: "PUT", body: JSON.stringify(c) });
export const deleteCustomer = (id: string) => req(`${BASE}/api/customers?id=${encodeURIComponent(id)}`, { method: "DELETE" });

export const listServices = () => req(`${BASE}/api/services`) as Promise<Service[]>;
export const createService = (s: Service) => req(`${BASE}/api/services`, { method: "POST", body: JSON.stringify(s) });
export const updateService = (s: Service) => req(`${BASE}/api/services`, { method: "PUT", body: JSON.stringify(s) });
export const deleteService = (id: string) => req(`${BASE}/api/services?id=${encodeURIComponent(id)}`, { method: "DELETE" });

export const getSeller = () => req(`${BASE}/api/seller`) as Promise<Seller>;
export const saveSeller = (s: Seller) => req(`${BASE}/api/seller`, { method: "PUT", body: JSON.stringify(s) });

// Belgian MOD97 enterprise-number check (matches the PEPPOL validator).
export function validEnterprise(id: string): boolean {
  if (!/^[0-9]{10}$/.test(id)) return false;
  let chk = 97 - (Number(id.slice(0, 8)) % 97);
  if (chk === 0) chk = 97;
  return String(chk).padStart(2, "0") === id.slice(8);
}
