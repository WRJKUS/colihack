export function getVatRate({ service_description, building_age_years, is_private_dwelling }, vatRules) {
  const desc = service_description.toLowerCase();

  // 0% — intra-EU B2B (not detectable from description alone, agent must ask)

  // 6% — renovation of private dwelling > 10 years
  const renovationKeywords = ["renovati", "verbouw", "rénovation", "insulation", "isolat",
    "roof", "dak", "toiture", "plumbing renovat", "electrical renovat", "bathroom renovat",
    "schilderwerk", "peinture", "painting", "vloer", "plancher", "flooring"];

  const isRenovation = renovationKeywords.some(k => desc.includes(k));
  if (isRenovation) {
    if (is_private_dwelling && building_age_years >= 10) {
      return {
        rate: 6,
        category: "renovation",
        reasoning: `6% applies: renovation of a private dwelling older than 10 years (${building_age_years}y). Labour only — materials remain at 21%.`,
        materials_rate: 21,
        warning: "Ensure client provides written declaration confirming building age and private dwelling use."
      };
    }
    return {
      rate: 21,
      category: "standard",
      reasoning: "Renovation keywords detected but conditions for 6% not confirmed (need private dwelling > 10 years old).",
      suggestion: "Ask: Is this a private home older than 10 years? If yes, 6% applies to labour."
    };
  }

  // 12% — food catering
  const cateringKeywords = ["catering", "traiteur", "lunch", "dinner", "maaltijd", "repas", "buffet"];
  if (cateringKeywords.some(k => desc.includes(k))) {
    return {
      rate: 12,
      category: "restaurant_food",
      reasoning: "Catering/food service — 12% on the food component. If staffing is included, split the invoice: 12% food, 21% labour.",
      split_required: true
    };
  }

  // 21% — everything else
  const rule = vatRules.rates.find(r => r.rate === 21);
  return {
    rate: 21,
    category: "standard",
    reasoning: `Standard 21% VAT rate applies to: ${service_description}.`
  };
}
