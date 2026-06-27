import { useEffect, useState } from "react";
import * as store from "./lib/store";
import { Customer, Service, Seller, validEnterprise } from "./lib/store";

const enterprise = (peppol?: string) => (peppol || "").split(":")[1] || "";

export default function Manage() {
  const [tab, setTab] = useState<"customers" | "services" | "company">("customers");
  return (
    <div className="card">
      <div className="subtabs">
        {(["customers", "services", "company"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "customers" && <Customers />}
      {tab === "services" && <Services />}
      {tab === "company" && <Company />}
    </div>
  );
}

function Field({ label, children }: any) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Customers() {
  const [list, setList] = useState<Customer[]>([]);
  const [draft, setDraft] = useState<Customer | null>(null);
  const [err, setErr] = useState("");
  const load = () => store.listCustomers().then(setList).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);

  const set = (k: keyof Customer, v: any) => setDraft({ ...(draft as Customer), [k]: v });
  const save = async () => {
    if (!draft?.name) { setErr("Name is required"); return; }
    setErr("");
    try {
      draft.id ? await store.updateCustomer(draft) : await store.createCustomer(draft);
      setDraft(null); load();
    } catch (e) { setErr(String(e)); }
  };
  const del = async (id?: string) => { if (id && confirm("Delete this customer?")) { await store.deleteCustomer(id); load(); } };

  const ent = enterprise(draft?.peppol_id);
  const peppolBad = !!ent && !validEnterprise(ent);

  return (
    <div>
      {err && <div className="error">⚠️ {err}</div>}
      <div className="toolbar">
        <h3>Customers ({list.length})</h3>
        <button className="primary sm" onClick={() => setDraft({ name: "", aliases: [], vat_number: "", peppol_id: "0208:", address: "", contact_email: "", payment_terms_days: 30 })}>+ Add</button>
      </div>
      <table className="grid">
        <thead><tr><th>Name</th><th>PEPPOL</th><th>VAT</th><th>Email</th><th></th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className="mono">{c.peppol_id}{enterprise(c.peppol_id) && !validEnterprise(enterprise(c.peppol_id)) ? " ⚠️" : ""}</td>
              <td className="mono">{c.vat_number}</td>
              <td>{c.contact_email}</td>
              <td className="row-actions">
                <button onClick={() => setDraft(c)}>Edit</button>
                <button className="danger" onClick={() => del(c.id)}>Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {draft && (
        <div className="editor">
          <h4>{draft.id ? "Edit customer" : "New customer"}</h4>
          <Field label="Name"><input value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Aliases (comma-separated)">
            <input value={(draft.aliases || []).join(", ")} onChange={(e) => set("aliases", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </Field>
          <Field label="PEPPOL ID (scheme:number)">
            <input value={draft.peppol_id} onChange={(e) => set("peppol_id", e.target.value)} className={peppolBad ? "invalid" : ""} />
          </Field>
          {peppolBad && <p className="warn">⚠️ Enterprise number fails the Belgian MOD97 checksum — PEPPOL will reject it.</p>}
          <Field label="VAT number"><input value={draft.vat_number} onChange={(e) => set("vat_number", e.target.value)} /></Field>
          <Field label="Address"><input value={draft.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Email"><input value={draft.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></Field>
          <Field label="Payment terms (days)"><input type="number" value={draft.payment_terms_days ?? 30} onChange={(e) => set("payment_terms_days", Number(e.target.value))} /></Field>
          <div className="btn-row">
            <button className="primary" onClick={save}>Save</button>
            <button className="ghost" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Services() {
  const [list, setList] = useState<Service[]>([]);
  const [draft, setDraft] = useState<Service | null>(null);
  const [err, setErr] = useState("");
  const load = () => store.listServices().then(setList).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);
  const set = (k: keyof Service, v: any) => setDraft({ ...(draft as Service), [k]: v });
  const save = async () => {
    if (!draft?.label || !draft?.code) { setErr("Code and label are required"); return; }
    setErr("");
    try {
      draft.id ? await store.updateService(draft) : await store.createService(draft);
      setDraft(null); load();
    } catch (e) { setErr(String(e)); }
  };
  const del = async (id?: string) => { if (id && confirm("Delete this service?")) { await store.deleteService(id); load(); } };

  return (
    <div>
      {err && <div className="error">⚠️ {err}</div>}
      <div className="toolbar">
        <h3>Services ({list.length})</h3>
        <button className="primary sm" onClick={() => setDraft({ code: "", label: "", aliases: [], type: "labour", unit: "HUR", unit_price: 0, tax_rate: "21" })}>+ Add</button>
      </div>
      <table className="grid">
        <thead><tr><th>Code</th><th>Label</th><th>Type</th><th>Unit</th><th>Price</th><th>VAT</th><th></th></tr></thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id}>
              <td className="mono">{s.code}</td><td>{s.label}</td><td>{s.type}</td>
              <td className="mono">{s.unit}</td><td>€{s.unit_price}</td><td>{s.tax_rate}%</td>
              <td className="row-actions">
                <button onClick={() => setDraft(s)}>Edit</button>
                <button className="danger" onClick={() => del(s.id)}>Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {draft && (
        <div className="editor">
          <h4>{draft.id ? "Edit service" : "New service"}</h4>
          <Field label="Code"><input value={draft.code} onChange={(e) => set("code", e.target.value)} /></Field>
          <Field label="Label"><input value={draft.label} onChange={(e) => set("label", e.target.value)} /></Field>
          <Field label="Aliases (comma-separated)">
            <input value={(draft.aliases || []).join(", ")} onChange={(e) => set("aliases", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </Field>
          <Field label="Type">
            <select value={draft.type} onChange={(e) => set("type", e.target.value)}>
              <option value="labour">labour</option><option value="travel">travel</option><option value="parts">parts</option>
            </select>
          </Field>
          <Field label="Unit (HUR / KMT / C62)"><input value={draft.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
          <Field label="Unit price (€)"><input type="number" step="0.01" value={draft.unit_price ?? 0} onChange={(e) => set("unit_price", Number(e.target.value))} /></Field>
          <Field label="VAT rate (e.g. 21)"><input value={draft.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} /></Field>
          <Field label="Description"><input value={draft.description || ""} onChange={(e) => set("description", e.target.value)} /></Field>
          <div className="btn-row">
            <button className="primary" onClick={save}>Save</button>
            <button className="ghost" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Company() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { store.getSeller().then(setSeller).catch((e) => setErr(String(e))); }, []);
  const set = (k: keyof Seller, v: any) => { setSeller({ ...(seller as Seller), [k]: v }); setSaved(false); };
  const save = async () => {
    if (!seller) return;
    setErr("");
    try { await store.saveSeller(seller); setSaved(true); } catch (e) { setErr(String(e)); }
  };
  if (!seller) return <p className="muted">Loading…</p>;
  const ent = enterprise(seller.peppol_id);
  const bad = !!ent && !validEnterprise(ent);
  return (
    <div>
      {err && <div className="error">⚠️ {err}</div>}
      <h3>Company (sender)</h3>
      <p className="muted">These details appear as the vendor on every invoice the agent sends.</p>
      <Field label="Name"><input value={seller.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="VAT number"><input value={seller.vat_number} onChange={(e) => set("vat_number", e.target.value)} /></Field>
      <Field label="PEPPOL ID (scheme:number)">
        <input value={seller.peppol_id} onChange={(e) => set("peppol_id", e.target.value)} className={bad ? "invalid" : ""} />
      </Field>
      {bad && <p className="warn">⚠️ Enterprise number fails MOD97 — your tenant must own this PEPPOL ID for sends to work.</p>}
      <Field label="Address"><input value={seller.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
      <Field label="Email"><input value={seller.contact_email || ""} onChange={(e) => set("contact_email", e.target.value)} /></Field>
      <Field label="IBAN"><input value={seller.iban || ""} onChange={(e) => set("iban", e.target.value)} /></Field>
      <Field label="Default payment terms (days)"><input type="number" value={seller.default_payment_terms_days ?? 30} onChange={(e) => set("default_payment_terms_days", Number(e.target.value))} /></Field>
      <div className="btn-row">
        <button className="primary" onClick={save}>Save company</button>
        {saved && <span className="ok">Saved ✓</span>}
      </div>
    </div>
  );
}
