// Single source of truth for the professional statuses a Klimr user can request,
// and the proof each requires. Grounded in US/California law (Klimr is LA-based):
//  • Coaching/training roles are NOT state-licensed — a recognized certification
//    is recommended but optional.
//  • Health/medical roles require proof of qualification. Klimr verifies the
//    credential number against the issuing body's public registry. (California
//    does not license athletic trainers or dietitians, so the national BOC/CDR
//    credential is what's verified; PTs, psychologists are state-licensed;
//    massage is CAMTC-certified and required by Los Angeles.)
// Editing this list updates the Settings request flow and the admin review UI.

export type RoleCategory = "coaching" | "health" | "organizer";

export type ProfessionalRole = {
  key: string;
  label: string;
  category: RoleCategory;
  blurb: string;
  requiresCredential: boolean; // health roles require proof before approval
  credentialLabel?: string; // what number/credential to enter
  credentialOrg?: string; // the body that issues / verifies it
  legalNote?: string; // the regulatory context, shown to the applicant
};

export const PROFESSIONAL_ROLES: ProfessionalRole[] = [
  // ── Coaching & training (certifications recommended, not state-licensed) ──
  {
    key: "sport_coach",
    label: "Sport Coach",
    category: "coaching",
    blurb: "Teach tennis, pickleball, padel, racquetball, or beach volleyball — technique, strategy, match play.",
    requiresCredential: false,
    credentialLabel: "Coaching certification (e.g. PTR, PPR, USA Pickleball, USPTA) — optional",
  },
  {
    key: "personal_trainer",
    label: "Personal Trainer",
    category: "coaching",
    blurb: "General fitness training and conditioning for players of all levels.",
    requiresCredential: false,
    credentialLabel: "Certification (NASM, ACE, NSCA-CPT, ACSM, ISSA) — optional",
    legalNote: "Personal training is not state-licensed; a nationally accredited certification is strongly recommended.",
  },
  {
    key: "strength_conditioning",
    label: "Strength & Conditioning Coach",
    category: "coaching",
    blurb: "Sport-specific performance — speed, power, agility, and injury prevention.",
    requiresCredential: false,
    credentialLabel: "Certification (e.g. NSCA CSCS) — optional",
  },
  {
    key: "group_fitness",
    label: "Group Fitness Instructor",
    category: "coaching",
    blurb: "Lead group sessions — conditioning, mobility, yoga, or pilates.",
    requiresCredential: false,
    credentialLabel: "Certification (ACE, AFAA, ACSM, yoga/pilates) — optional",
  },
  {
    key: "event_organizer",
    label: "Event Organizer",
    category: "organizer",
    blurb: "Run tournaments, leagues, ladders, clinics, and social play.",
    requiresCredential: false,
  },
  // ── Health & medical (proof of qualification required) ──
  {
    key: "athletic_trainer",
    label: "Athletic Trainer (ATC)",
    category: "health",
    blurb: "Injury prevention, on-court emergency care, and return-to-play rehab.",
    requiresCredential: true,
    credentialLabel: "BOC certification number (ATC)",
    credentialOrg: "Board of Certification (BOC)",
    legalNote: "California does not license athletic trainers, so Klimr verifies your national BOC (ATC) certification.",
  },
  {
    key: "physical_therapist",
    label: "Physical Therapist (PT/DPT)",
    category: "health",
    blurb: "Licensed rehabilitation, manual therapy, and movement treatment.",
    requiresCredential: true,
    credentialLabel: "California PT license number",
    credentialOrg: "Physical Therapy Board of California",
    legalNote: "Physical therapy is a licensed medical profession in California — an active PT license is required.",
  },
  {
    key: "dietitian",
    label: "Registered Dietitian (RD/RDN)",
    category: "health",
    blurb: "Medical nutrition therapy and evidence-based dietary care for athletes.",
    requiresCredential: true,
    credentialLabel: "CDR registration number (RD/RDN)",
    credentialOrg: "Commission on Dietetic Registration (CDR)",
    legalNote:
      "California does not license dietitians, but medical nutrition therapy requires the national RD/RDN credential, which Klimr verifies.",
  },
  {
    key: "nutrition_coach",
    label: "Nutrition Coach",
    category: "health",
    blurb: "General nutrition guidance and habit coaching — not medical nutrition therapy.",
    requiresCredential: true,
    credentialLabel: "Nutrition certification (e.g. CNS, NASM-CNC, Precision Nutrition)",
    legalNote:
      "California allows general nutrition advice without a license; Klimr verifies a recognized certification. Medical nutrition therapy requires an RD/RDN.",
  },
  {
    key: "sports_massage",
    label: "Sports Massage Therapist (CMT)",
    category: "health",
    blurb: "Soft-tissue, recovery, and pre/post-match massage.",
    requiresCredential: true,
    credentialLabel: "CAMTC certification number (CMT)",
    credentialOrg: "California Massage Therapy Council (CAMTC)",
    legalNote:
      "Massage in California is certified by CAMTC and required by Los Angeles — a valid CAMTC CMT number is required.",
  },
  {
    key: "mental_performance",
    label: "Sport Psychologist / Mental Performance",
    category: "health",
    blurb: "Mental skills, performance psychology, and athlete well-being.",
    requiresCredential: true,
    credentialLabel: "CA psychology license, or AASP CMPC certification number",
    credentialOrg: "CA Board of Psychology / AASP",
    legalNote:
      "Clinical and sport psychology is licensed in California; mental-performance consulting requires a license or AASP CMPC certification.",
  },
];

export function roleMeta(key: string): ProfessionalRole | undefined {
  return PROFESSIONAL_ROLES.find((r) => r.key === key);
}

export function roleLabel(key: string): string {
  return roleMeta(key)?.label ?? key;
}

export const ROLE_CATEGORY_LABEL: Record<RoleCategory, string> = {
  coaching: "Coaching & training",
  health: "Health & medical",
  organizer: "Events",
};
