// Customer Lifetime Value (CLV) and portfolio segmentation.
// ---------------------------------------------------------------------------
// Recurring-revenue CLV with a constant retention rate r and discount rate i:
//   CLV = m × [ r / (1 + i − r) ]
// where m is the annual margin. The multiplier r/(1+i−r) captures the geometric
// sum of retained, discounted future margins.

export function computeCLV({ annualMargin, retentionRate, discountRate }) {
  const m = Number(annualMargin);
  const r = Number(retentionRate);
  const i = Number(discountRate);
  if (!Number.isFinite(m)) throw new Error("Annual margin must be a number.");
  if (!(r >= 0 && r < 1)) throw new Error("Retention rate must be in [0, 1).");
  if (!(i > -1)) throw new Error("Discount rate must be > -1.");
  const denom = 1 + i - r;
  if (denom <= 0) throw Object.assign(new Error("Retention too high relative to discount rate (divergent CLV)."), { userFacing: true });

  const multiplier = r / denom;
  return {
    annualMargin: round(m),
    retentionRate: r,
    discountRate: i,
    lifetimeMultiplier: round(multiplier),
    clv: round(m * multiplier),
  };
}

// Segment a set of clients by CLV into tiers for account-management focus.
// Tiers: "strategic" (top), "managed" (middle), "efficient" (long tail).
export function segmentPortfolio(clients, opts = {}) {
  const discountRate = opts.discountRate ?? 0.1;
  const evaluated = clients.map((cl) => {
    const clv = computeCLV({
      annualMargin: cl.annualMargin,
      retentionRate: cl.retentionRate,
      discountRate: cl.discountRate ?? discountRate,
    }).clv;
    return { ...cl, clv };
  });

  const sorted = [...evaluated].sort((a, b) => b.clv - a.clv);
  const n = sorted.length;
  // Top 20% strategic, next 30% managed, remainder efficient (min 1 each when possible).
  const strategicCut = Math.max(1, Math.round(n * 0.2));
  const managedCut = strategicCut + Math.max(1, Math.round(n * 0.3));

  const ranked = sorted.map((c, idx) => ({
    ...c,
    rank: idx + 1,
    tier: idx < strategicCut ? "strategic" : idx < managedCut ? "managed" : "efficient",
  }));

  const totalClv = ranked.reduce((s, c) => s + c.clv, 0);
  const byTier = { strategic: 0, managed: 0, efficient: 0 };
  for (const c of ranked) byTier[c.tier] += c.clv;

  return {
    clients: ranked,
    totalClv: round(totalClv),
    clvByTier: {
      strategic: round(byTier.strategic),
      managed: round(byTier.managed),
      efficient: round(byTier.efficient),
    },
  };
}

function round(x, dp = 2) {
  if (x == null || !Number.isFinite(x)) return x;
  const f = 10 ** dp;
  const r = Math.round((x + Number.EPSILON) * f) / f;
  return Object.is(r, -0) ? 0 : r;
}
