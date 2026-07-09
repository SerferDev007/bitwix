// Financial models: NPV / profitability index, cost-volume-profit break-even,
// and the fully-loaded engineer rate.

// Net Present Value of a stream of future cash flows discounted at rate r.
// cashFlows are period-end amounts starting at t = 1.
export function computeNPV(initialInvestment, cashFlows, rate) {
  const r = Number(rate);
  const I = Number(initialInvestment);
  if (!Number.isFinite(r) || r <= -1) throw new Error("Discount rate must be > -1.");
  if (!Array.isArray(cashFlows) || cashFlows.length === 0) throw new Error("At least one cash flow is required.");

  const discounted = cashFlows.map((cf, i) => {
    const t = i + 1;
    const pv = Number(cf) / (1 + r) ** t;
    return { period: t, cashFlow: round(Number(cf)), presentValue: round(pv) };
  });
  const pvSum = discounted.reduce((s, d) => s + d.presentValue, 0);
  const npv = pvSum - I;

  return {
    initialInvestment: round(I),
    rate: r,
    perPeriod: discounted,
    pvOfInflows: round(pvSum),
    npv: round(npv),
    // Profitability index: PV of inflows per dollar invested (>1 = value-creating).
    profitabilityIndex: I === 0 ? null : round(pvSum / I),
  };
}

// Rank several investment candidates by NPV (and profitability index).
export function rankInvestments(candidates) {
  const evaluated = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    ...computeNPV(c.initialInvestment, c.cashFlows, c.rate),
  }));
  // Sort by NPV desc; PI breaks ties for capital-rationing guidance.
  const ranked = [...evaluated].sort((a, b) => b.npv - a.npv || (b.profitabilityIndex ?? 0) - (a.profitabilityIndex ?? 0));
  return ranked.map((e, i) => ({ ...e, rank: i + 1 }));
}

// Cost-Volume-Profit break-even: units needed to cover fixed cost.
// Q* = F / (P - V). Returns break-even volume and per-unit contribution.
export function computeBreakEven({ fixedCost, price, variableCost, periodsPerYear = 1 }) {
  const F = Number(fixedCost);
  const P = Number(price);
  const V = Number(variableCost);
  if (![F, P, V].every(Number.isFinite)) throw new Error("Fixed cost, price, and variable cost must be numbers.");
  const contribution = P - V;
  if (contribution <= 0) {
    throw Object.assign(new Error("Contribution margin (price − variable cost) must be positive."), { userFacing: true });
  }
  // If a per-period price/cost is given with periodsPerYear, express the annual
  // fixed cost as per-period break-even units (e.g. clients over a year).
  const perPeriodContribution = contribution * Number(periodsPerYear);
  const breakEvenUnits = F / perPeriodContribution;

  return {
    fixedCost: round(F),
    price: round(P),
    variableCost: round(V),
    contributionMargin: round(contribution),
    periodsPerYear: Number(periodsPerYear),
    breakEvenUnits: round(breakEvenUnits, 2),
    breakEvenUnitsCeil: Math.ceil(breakEvenUnits - 1e-9),
  };
}

// Fully-loaded hourly cost of an engineer.
// (Salary + Benefits + Allocated overhead) / Annual billable hours.
export function loadedRate({ salary, benefits = 0, overhead = 0, annualBillableHours }) {
  const numerator = Number(salary) + Number(benefits) + Number(overhead);
  const hours = Number(annualBillableHours);
  if (!(hours > 0)) throw new Error("Annual billable hours must be positive.");
  return round(numerator / hours, 2);
}

function round(x, dp = 4) {
  if (x == null || !Number.isFinite(x)) return x;
  const f = 10 ** dp;
  const r = Math.round((x + Number.EPSILON) * f) / f;
  return Object.is(r, -0) ? 0 : r;
}
