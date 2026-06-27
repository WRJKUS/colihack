const BASE_URL = "https://api.e-invoice.be";

export async function lookupPeppolParticipant({ query, country_code = "BE" }) {
  const res = await fetch(
    `${BASE_URL}/api/lookup/participants?query=${encodeURIComponent(query)}&country_code=${country_code}`,
    { headers: { Authorization: `Bearer ${process.env.EINVOICE_API_KEY}` } }
  );
  if (!res.ok) throw new Error(`PEPPOL lookup failed: ${res.status}`);
  const data = await res.json();
  return data;
}
