const BASE_URL = "https://api.e-invoice.be";

// Fuzzy name match — checks name and all aliases
function matchesQuery(client, query) {
  const q = query.toLowerCase().trim();
  const names = [client.name, ...(client.aliases ?? [])].map(n => n.toLowerCase());
  return names.some(n => n.includes(q) || q.includes(n.split(" ")[0]));
}

export async function lookupClient({ query, country_code = "BE" }, clientDb) {
  // 1. Check local knowledge base first
  const local = clientDb.find(c => matchesQuery(c, query));

  if (local) {
    return {
      source: "local_database",
      found: true,
      name: local.name,
      vat_number: local.vat_number,
      peppol_id: local.peppol_id,
      address: local.address,
      contact_email: local.contact_email,
      default_hourly_rate: local.default_hourly_rate ?? null,
      payment_terms_days: local.payment_terms_days ?? 30,
      recurring: local.recurring ?? false,
      notes: local.notes ?? null
    };
  }

  // 2. Fall back to live PEPPOL network search
  try {
    const res = await fetch(
      `${BASE_URL}/api/lookup/participants?query=${encodeURIComponent(query)}&country_code=${country_code}`,
      { headers: { Authorization: `Bearer ${process.env.EINVOICE_API_KEY}` } }
    );

    if (!res.ok) throw new Error(`PEPPOL lookup failed: ${res.status}`);
    const data = await res.json();

    if (data.participants?.length > 0) {
      const match = data.participants[0];
      return {
        source: "peppol_network",
        found: true,
        name: match.name ?? query,
        peppol_id: match.peppol_id,
        vat_number: null,
        address: null,
        contact_email: null,
        default_hourly_rate: null,
        payment_terms_days: 30,
        notes: "Found via live PEPPOL network — add to clients.json for faster lookup next time"
      };
    }
  } catch (err) {
    // PEPPOL lookup failed — return not found
  }

  return {
    source: "not_found",
    found: false,
    query,
    message: "Client not found in local database or PEPPOL network. Ask the user for their VAT number or PEPPOL ID."
  };
}
