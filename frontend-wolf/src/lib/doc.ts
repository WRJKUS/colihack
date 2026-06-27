// Fetch a created document's JSON (for PDF) and the UBL download URL, via the
// Worker proxy (the e-invoice.be API key stays server-side).
const BASE =
  (import.meta as any).env?.VITE_PROXY_BASE ||
  "https://einvoice-wolf.riegler31.workers.dev";

export async function getDocument(id: string): Promise<any> {
  const r = await fetch(`${BASE}/api/document?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`);
  return r.json();
}

export function ublDownloadUrl(id: string): string {
  return `${BASE}/api/document/ubl?id=${encodeURIComponent(id)}`;
}

export function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
