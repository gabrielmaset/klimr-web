/** The Training Table — Klimr's health & nutrition library, structured per the
 *  Health handoff: taxonomy as data, every read carrying dek/topic/sources/
 *  review metadata. `reviewedBy` is null until a named credentialed pro from
 *  the network reviews the piece (machinery ships now; names are never
 *  fabricated) — rows show the cited bodies instead until then. */

export type HealthTopic = { key: string; label: string; desc: string };

export const HEALTH_TOPICS: HealthTopic[] = [
  { key: "fueling", label: "Fueling", desc: "What to eat and drink, before and during" },
  { key: "hydration", label: "Hydration", desc: "Fluids, electrolytes, and sweat" },
  { key: "recovery", label: "Recovery", desc: "Sleep, refueling, and easy days" },
  { key: "injury", label: "Injury prevention", desc: "Keeping shoulders, elbows & ankles playing" },
  { key: "conditions", label: "Conditions", desc: "Heat, sun, and sand" },
  { key: "training", label: "Training", desc: "Strength and movement for court & beach" },
  { key: "mind", label: "Mental game", desc: "Focus, nerves, and competition mindset" },
];

export type HealthArticle = {
  slug: string;
  topic: string;
  title: string;
  dek: string;
  minutes: number;
  reviewedBy: { name: string; credentials: string } | null;
  reviewedAt: string; // last reviewed/updated (ISO date)
  sources: { label: string; url: string }[];
  sections: { h: string; body: string }[];
};

export const HEALTH_ARTICLES: HealthArticle[] = [
  {
    slug: "hydration-electrolytes",
    topic: "hydration",
    title: "Hydration & electrolytes for court and sand",
    dek: "Stop-start sports in the sun lose more sodium than steady cardio — late-match cramps and fading focus are usually a fluids story.",
    minutes: 4,
    reviewedBy: null,
    reviewedAt: "2026-07-01",
    sources: [
      { label: "ACSM — Exercise and Fluid Replacement", url: "https://www.acsm.org/education-resources/trending-topics-resources/hydration" },
      { label: "CDC — Water and Healthier Drinks", url: "https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/" },
    ],
    sections: [
      { h: "Before you play", body: "Arrive hydrated instead of chasing it: roughly 16–20 oz of fluid in the two hours before first serve, with a salty snack or an electrolyte mix if you're a heavy or salty sweater (white residue on your hat is the tell)." },
      { h: "During play", body: "Sip on every changeover rather than chugging between sets — small, regular amounts absorb better. For sessions past 60–90 minutes or anything in real heat, plain water isn't enough; add sodium (300–600 mg/hour is a common range for salty sweaters) and some carbohydrate." },
      { h: "After", body: "Rehydrate to about 125–150% of what you lost — weigh in before and after a hard session once to learn your sweat rate. Pale-yellow urine by the evening is the simple check." },
    ],
  },
  {
    slug: "match-day-fueling",
    topic: "fueling",
    title: "What to eat on match day",
    dek: "Tournament days are long with unpredictable gaps — the goal is steady energy without ever playing on a full stomach.",
    minutes: 4,
    reviewedBy: null,
    reviewedAt: "2026-07-01",
    sources: [
      { label: "Academy of Nutrition and Dietetics — Fueling for Sport", url: "https://www.eatright.org/fitness/sports-and-performance" },
    ],
    sections: [
      { h: "The base meal", body: "Three to four hours out: a familiar, carb-forward meal with moderate protein and low fat/fiber — rice or pasta with chicken, oatmeal with banana, a turkey sandwich. Match day is never the day to try something new." },
      { h: "Between matches", body: "Under an hour to your next match: fast carbs only — banana, applesauce pouch, sports drink, a handful of pretzels. Two-plus hours: a small real meal works, then top up lightly 30–45 minutes before." },
      { h: "The night before", body: "A normal dinner with an extra portion of carbs beats any extreme 'carb load.' Prioritize sleep over everything else on the list." },
    ],
  },
  {
    slug: "recovery-sleep",
    topic: "recovery",
    title: "Recovery that actually moves the needle",
    dek: "Most recovery gadgets fight over the last 5%. Sleep, food timing, and easy movement are the 95% — and they're free.",
    minutes: 5,
    reviewedBy: null,
    reviewedAt: "2026-07-01",
    sources: [
      { label: "NIH — Sleep and Health", url: "https://www.nhlbi.nih.gov/health/sleep" },
      { label: "ACSM — Recovery Strategies", url: "https://www.acsm.org/" },
    ],
    sections: [
      { h: "Sleep is the whole game", body: "Aim for 7–9 hours on a consistent schedule; a single short night measurably degrades serve accuracy and reaction time. If you play night matches, build a wind-down: screens down, room cool and dark, same routine every time." },
      { h: "The first hour after", body: "Get carbs plus 20–40 g of protein within an hour or two of a hard session — chocolate milk, yogurt with granola, or a proper meal all qualify. You're restocking glycogen and giving muscle material to repair with." },
      { h: "Easy movement beats total rest", body: "The day after a tournament, a 20–30 minute walk, swim, or easy spin clears soreness faster than the couch. Save true rest days for when your body — or your motivation — asks loudly." },
    ],
  },
  {
    slug: "shoulder-elbow-care",
    topic: "injury",
    title: "Protecting the overhead athlete's shoulder & elbow",
    dek: "Serves, smashes, and spikes load the same small structures thousands of times a season — overuse pain announces itself quietly first.",
    minutes: 5,
    reviewedBy: null,
    reviewedAt: "2026-07-01",
    sources: [
      { label: "NIH — Tendinopathy overview", url: "https://www.niams.nih.gov/health-topics/tendinitis" },
    ],
    sections: [
      { h: "The 10-minute insurance policy", body: "Twice a week: band external rotations, scapular rows, and wrist-extensor work (the classic tennis-elbow curl with a light dumbbell). Boring, effective, and cheaper than an MRI." },
      { h: "Ramp load, don't spike it", body: "Most overuse injuries follow a sudden jump — a new racquet, a heavier ball, a tournament weekend after a quiet month. Increase weekly volume gradually and treat big jumps as a risk you're consciously choosing." },
      { h: "The traffic-light rule", body: "Pain that warms up and disappears: monitor. Pain that persists through play or changes your mechanics: cut volume and see a professional. Sharp pain, swelling, or night pain: stop and get assessed." },
    ],
  },
  {
    slug: "heat-sun-safety",
    topic: "conditions",
    title: "Heat & sun: playing smart outdoors",
    dek: "Beach volleyball at noon and summer hard courts are genuinely hostile environments — respecting them is a performance strategy.",
    minutes: 3,
    reviewedBy: null,
    reviewedAt: "2026-07-01",
    sources: [
      { label: "CDC — Heat and Athletes", url: "https://www.cdc.gov/heat-health/hcp/clinical-guidance/heat-and-athletes.html" },
    ],
    sections: [
      { h: "Sun", body: "SPF 30+ applied 20 minutes before play and re-applied every two hours (sweat eats it faster than the label admits). A hat and sunglasses aren't style points — glare costs you overheads." },
      { h: "Heat", body: "Acclimatize over 1–2 weeks of shorter sessions when summer arrives. Pre-cool with cold fluids, seek shade on changeovers, and know the red flags: goosebumps in the heat, confusion, or when you stop sweating — that's a stop-now medical situation." },
      { h: "Sand specifics", body: "Sand surface temps can exceed 120°F on a sunny afternoon — sand socks are legal in most leagues and your feet will thank you. Schedule hard training for mornings when you can." },
    ],
  },
  {
    slug: "strength-foundations",
    topic: "training",
    title: "Strength foundations for racquet & beach athletes",
    dek: "You don't need a bodybuilding program — you need force you can express sideways, overhead, and off one leg, twice a week.",
    minutes: 5,
    reviewedBy: null,
    reviewedAt: "2026-07-01",
    sources: [
      { label: "ACSM — Resistance Training Guidance", url: "https://www.acsm.org/education-resources/trending-topics-resources/resource-library" },
    ],
    sections: [
      { h: "The core four", body: "A squat or split-squat pattern, a hinge (Romanian deadlift), a push (overhead or bench), and a pull (row or pull-up). Two sessions a week, 3–4 sets each, leaving a rep or two in the tank." },
      { h: "Make it sport-shaped", body: "Add lateral lunges and band-resisted shuffles for court coverage, medicine-ball rotational throws for groundstroke and spike power, and single-leg calf work for sand push-off." },
      { h: "In-season vs off-season", body: "In-season, strength work maintains: shorter, lighter, never within 24 hours of a match. Off-season is when you build. New to lifting? Two months with a qualified trainer beats a year of guessing." },
    ],
  },
  {
    slug: "tournament-week-taper",
    topic: "training",
    title: "The tournament-week taper",
    dek: "The week before an event, less is more — you can't gain fitness in five days, but you can absolutely arrive tired.",
    minutes: 3,
    reviewedBy: null,
    reviewedAt: "2026-07-05",
    sources: [{ label: "ACSM — Periodization basics", url: "https://www.acsm.org/" }],
    sections: [
      { h: "Cut volume, keep sharpness", body: "Drop total training volume 30–50% over the final week while keeping short, crisp, high-quality touches — serves, first steps, quick points. Intensity stays; duration shrinks." },
      { h: "The last 48 hours", body: "One light session the day before — 30–45 minutes, break a sweat, groove your serve, done. No new drills, no grinding sets, nothing that leaves soreness." },
    ],
  },
  {
    slug: "pre-match-nerves",
    topic: "mind",
    title: "Pre-match nerves: making anxiety useful",
    dek: "The flutter before a match isn't a malfunction — it's fuel that needs a direction.",
    minutes: 4,
    reviewedBy: null,
    reviewedAt: "2026-07-05",
    sources: [{ label: "AASP — Mental skills resources", url: "https://appliedsportpsych.org/resources/" }],
    sections: [
      { h: "Reframe the signal", body: "Elevated heart rate and butterflies are arousal, not doom — the same physiology as excitement. Athletes who label it 'ready' instead of 'nervous' consistently perform closer to practice level." },
      { h: "A 60-second routine", body: "Between points and before serves: one long exhale (twice as long as the inhale), one physical cue (bounce the ball, adjust strings), one tactical thought — where the next serve goes. Routines crowd out spirals." },
      { h: "When it's bigger than a match", body: "If dread shows up days early or steals sleep regularly, that's worth real support — a mental-performance pro or a clinician, not another breathing hack." },
    ],
  },
  {
    slug: "tournament-week-reset",
    topic: "recovery",
    title: "The day-after reset",
    dek: "How you spend the 24 hours after a tournament decides how the next two weeks of training feel.",
    minutes: 3,
    reviewedBy: null,
    reviewedAt: "2026-07-05",
    sources: [{ label: "NIH — Muscle recovery", url: "https://www.nhlbi.nih.gov/" }],
    sections: [
      { h: "Same day", body: "Real meal within two hours, fluids until urine runs pale, and an easy 15-minute walk before you sit down for the evening. Skip the celebratory all-nighter if you can — sleep is where the repair happens." },
      { h: "Next day", body: "Easy movement (walk, swim, spin), light stretching where you're stiff, and an honest body scan: anything that's pain rather than soreness gets rest and, if it lingers, a professional." },
    ],
  },
];

export type FeaturedCollection = {
  title: string;
  dek: string;
  reviewedBy: string | null;
  slugs: string[];
};

export const FEATURED_COLLECTION: FeaturedCollection = {
  title: "The Tournament Week Playbook",
  dek: "Five short reads that carry you from the Monday before to the Monday after — taper, fuel, hydrate, compete, reset.",
  reviewedBy: null,
  slugs: ["tournament-week-taper", "match-day-fueling", "hydration-electrolytes", "pre-match-nerves", "tournament-week-reset"],
};

export type QuickAnswer = { id: string; question: string; answer: string; sourceSlug: string; suggestPro?: boolean };

export const QUICK_ANSWERS: QuickAnswer[] = [
  { id: "cramp", question: "Why do I cramp in the third set?", answer: "Usually a fluids-and-sodium story compounded by fatigue: you're behind on what you sweated out. Pre-load fluids, add sodium during long sessions, and learn your sweat rate.", sourceSlug: "hydration-electrolytes" },
  { id: "eat-before", question: "How close to a match can I eat?", answer: "A real meal 3–4 hours out; light fast carbs down to about 30–45 minutes. The closer to play, the simpler the food.", sourceSlug: "match-day-fueling" },
  { id: "elbow", question: "My elbow aches after long sessions — keep playing?", answer: "Pain that warms up and fades: monitor and add wrist-extensor work. Pain that persists through play or changes your swing: cut volume and get assessed — lingering tendon pain rewards early attention.", sourceSlug: "shoulder-elbow-care", suggestPro: true },
  { id: "sand-hot", question: "The sand is burning my feet — options?", answer: "Sand socks (legal in most leagues), morning scheduling, and shade breaks. Surface temps can pass 120°F on sunny afternoons.", sourceSlug: "heat-sun-safety" },
  { id: "nervous", question: "I play worse in matches than in practice. Normal?", answer: "Very. Arousal narrows attention; a between-point routine (long exhale, physical cue, one tactical thought) closes most of the gap. Persistent match dread is worth working through with a pro.", sourceSlug: "pre-match-nerves", suggestPro: true },
  { id: "day-after", question: "Rest completely the day after a tournament?", answer: "Easy movement beats the couch: a 20–30 minute walk or swim clears soreness faster. Save full rest for when your body asks loudly.", sourceSlug: "tournament-week-reset" },
];

export const topicLabel = new Map(HEALTH_TOPICS.map((t) => [t.key, t.label]));
export const articleBySlug = new Map(HEALTH_ARTICLES.map((a) => [a.slug, a]));
/** Longest topic label in characters — the index tag column derives from this. */
export const LONGEST_TOPIC_CH = Math.max(...HEALTH_TOPICS.map((t) => t.label.length));
