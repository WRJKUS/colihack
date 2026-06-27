// Maps a free-text phrase ("1 hour of work", "the drive", "thermostat")
// to a service/product catalog item with unit, unit_price and default tax_rate.
// Pure local lookup over data/services.json — no external API.

function norm(s) {
  return String(s ?? "").toLowerCase().trim();
}

// Score how well a catalog item matches the query.
// Higher is better; 0 means no match.
function scoreItem(item, q) {
  const haystacks = [item.code, item.label, ...(item.aliases ?? [])].map(norm);

  let best = 0;
  for (const h of haystacks) {
    if (!h) continue;
    if (h === q) { best = Math.max(best, 100); continue; }          // exact
    if (q.includes(h) || h.includes(q)) { best = Math.max(best, 70); continue; } // substring either way

    // word-overlap fallback
    const hWords = new Set(h.split(/\s+/));
    const qWords = q.split(/\s+/).filter(Boolean);
    const overlap = qWords.filter(w => w.length > 2 && hWords.has(w)).length;
    if (overlap > 0) best = Math.max(best, 30 + overlap * 5);
  }
  return best;
}

export function lookupService({ query, type }, serviceCatalog) {
  const q = norm(query);

  let candidates = serviceCatalog;
  if (type) candidates = candidates.filter(s => norm(s.type) === norm(type));

  const ranked = candidates
    .map(item => ({ item, score: scoreItem(item, q) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      found: false,
      query,
      message: "No matching service in the catalog. Ask the user for a description and unit price, or add it via the services catalog."
    };
  }

  const shape = ({ code, label, type, unit, unit_price, tax_rate, description }) =>
    ({ code, label, type, unit, unit_price, tax_rate, description: description ?? null });

  const top = ranked[0];
  return {
    found: true,
    query,
    match: shape(top.item),
    // other plausible matches so the agent can disambiguate if needed
    alternatives: ranked.slice(1, 4).map(r => shape(r.item))
  };
}
