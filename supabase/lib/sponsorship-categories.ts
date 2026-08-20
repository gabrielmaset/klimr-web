// Sponsorship category policy — v1, resolved 2026-07-21 (open decision #7).
// Industry-standard exclusion list (IAB-aligned) adapted to Klimr: an 18+
// verified-identity sports community whose core asset is ranking integrity.
// Gambling and sports betting are PROHIBITED outright — not merely restricted —
// because betting on amateur matches is a direct threat to the match-integrity
// system (see Klimr_Match_Integrity_Strategy / Ranking_Integrity_Threat_Model).
// The readable policy lives in docs/SPONSORSHIP-CATEGORIES.md; this file is the
// enforceable mirror the future sponsorship engine validates against.

export type SponsorshipCategoryTier = "prohibited" | "restricted";

export type SponsorshipCategory = {
  key: string;
  label: string;
  tier: SponsorshipCategoryTier;
  rationale: string;
};

export const SPONSORSHIP_CATEGORIES: SponsorshipCategory[] = [
  // ---- prohibited: never accepted, no review path ----
  { key: "gambling_betting", label: "Gambling & sports betting", tier: "prohibited", rationale: "Direct threat to ranking and match integrity on an amateur platform." },
  { key: "adult_content", label: "Adult & sexual content", tier: "prohibited", rationale: "Incompatible with a community sports environment." },
  { key: "tobacco_nicotine", label: "Tobacco, nicotine & vaping", tier: "prohibited", rationale: "Health-adverse category universally excluded from sport sponsorship." },
  { key: "illegal_drugs", label: "Illegal & recreational drugs", tier: "prohibited", rationale: "Illegal or health-adverse; no compliant placement exists." },
  { key: "weapons", label: "Weapons, firearms & ammunition", tier: "prohibited", rationale: "Standard exclusion for community platforms." },
  { key: "predatory_finance", label: "Payday & predatory lending", tier: "prohibited", rationale: "Exploitative products; reputational risk." },
  { key: "mlm_schemes", label: "MLMs & get-rich-quick schemes", tier: "prohibited", rationale: "Deceptive by structure; erodes member trust." },
  { key: "political", label: "Political campaigns & advocacy", tier: "prohibited", rationale: "Klimr venues stay neutral ground." },
  { key: "rx_pharma", label: "Prescription pharmaceuticals", tier: "prohibited", rationale: "Regulated direct-to-consumer category; compliance burden out of scope." },
  { key: "medical_claim_supplements", label: "Supplements making medical claims (incl. SARMs/peptides)", tier: "prohibited", rationale: "Unsubstantiated health claims and doping-adjacent products." },
  { key: "hate_extremism", label: "Hate or extremist organizations", tier: "prohibited", rationale: "Zero tolerance." },
  { key: "counterfeit", label: "Counterfeit goods", tier: "prohibited", rationale: "Illegal; harms legitimate sponsors." },
  { key: "speculative_crypto", label: "Token offerings & speculative investment schemes", tier: "prohibited", rationale: "High-fraud category; standard platform exclusion." },

  // ---- restricted: possible with manual review + conditions ----
  { key: "alcohol", label: "Alcohol", tier: "restricted", rationale: "18+ platform allows it, but placements must respect venue rules and never sit adjacent to coaching-of-minors contexts." },
  { key: "cbd_hemp", label: "CBD & hemp wellness", tier: "restricted", rationale: "Legal-compliance review per jurisdiction; no medical claims." },
  { key: "licensed_finance", label: "Licensed financial services", tier: "restricted", rationale: "Legitimate banks/insurers fine; review confirms licensing." },
  { key: "energy_supplements", label: "Energy drinks & claim-free supplements", tier: "restricted", rationale: "Common in sport; review screens for medical claims." },
  { key: "weight_loss", label: "Weight-loss programs", tier: "restricted", rationale: "Sensitive category; review screens for body-shaming or extreme methods." },
];

export const PROHIBITED_KEYS = new Set(
  SPONSORSHIP_CATEGORIES.filter((c) => c.tier === "prohibited").map((c) => c.key),
);

export function sponsorshipTierOf(key: string): SponsorshipCategoryTier | null {
  return SPONSORSHIP_CATEGORIES.find((c) => c.key === key)?.tier ?? null;
}
