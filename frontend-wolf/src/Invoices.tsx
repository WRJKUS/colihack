import { useEffect, useState } from "react";
import { listInvoices, getDocument, ublDownloadUrl, triggerDownload, InvoiceListItem } from "./lib/doc";
import { downloadInvoicePDF } from "./lib/pdf";

const eur = (n: any) => "€" + Number(n ?? 0).toFixed(2);

export default function Invoices() {
  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = () => {
    setLoading(true); setErr("");
    listInvoices().then(setItems).catch((e) => setErr(String(e))).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const pdf = async (id: string) => {
    setBusy(id);
    try { downloadInvoicePDF(await getDocument(id)); }
    catch (e: any) { setErr("PDF failed: " + (e?.message ?? String(e))); }
    setBusy("");
  };

  return (
    <div className="card">
      <div className="toolbar">
        <h3>Invoices ({items.length})</h3>
        <button className="primary sm" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>
      {err && <div className="error">⚠️ {err}</div>}
      {!loading && items.length === 0 && <p className="muted">No invoices yet.</p>}
      <table className="grid">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th>Download</th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="mono">{it.invoice_id || it.id}</td>
              <td>{it.customer_name}</td>
              <td>{it.invoice_date}</td>
              <td>{eur(it.invoice_total)}</td>
              <td><span className={"badge " + String(it.state || "").toLowerCase()}>{it.state}</span></td>
              <td className="row-actions">
                <button onClick={() => pdf(it.id)} disabled={busy === it.id}>{busy === it.id ? "…" : "PDF"}</button>
                <button onClick={() => triggerDownload(ublDownloadUrl(it.id))}>UBL</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
