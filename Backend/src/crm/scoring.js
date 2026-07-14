// Lead scoring (paper Section 8.1). An intentionally simple, transparent
// additive model: fit (matches our ICP?) + engagement (behaving like a buyer?),
// capped at 100, with NEGATIVE weights so scores can decay rather than only
// ratchet upward. Weights are recalibrated against conversion outcomes over time.

export const SCORE_WEIGHTS = {
  // Fit
  company_size_in_range: 20,
  industry_in_target: 15,
  is_decision_maker: 15,
  free_email_domain: -15,
  // Engagement
  requested_demo: 30,
  visited_pricing: 15,
  opened_3plus_emails: 10,
  no_activity_30d: -20, // decay
};

export const MQL_THRESHOLD = Number(process.env.CRM_MQL_THRESHOLD) || 60;

// signals: { company_size_in_range: true, requested_demo: true, ... }
export function scoreLead(signals = {}) {
  let score = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    if (signals[key]) score += weight;
  }
  return Math.max(0, Math.min(100, score));
}

// Whether a scored lead qualifies as a Marketing Qualified Lead.
export function isMql(score) {
  return score >= MQL_THRESHOLD;
}

const FREE_EMAIL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'proton.me']);

// Derive the free-email signal from the address if not supplied explicitly.
export function isFreeEmail(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  return domain ? FREE_EMAIL_DOMAINS.has(domain) : false;
}
