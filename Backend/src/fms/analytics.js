// Unit economics and financial analytics (Section 7). Pure functions: they
// DERIVE ratios from ledger data or explicit inputs. They never hold a balance —
// balances come only from summing the journal. Monetary inputs here are ordinary
// numbers (dollars); the integer-minor-unit discipline applies to the LEDGER.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Trial balance: a ledger is valid only if Σ debits === Σ credits (BR-01).
export function trialBalance(lines) {
  const debits = lines.filter((l) => l.side === 'DR').reduce((s, l) => s + Number(l.amount), 0);
  const credits = lines.filter((l) => l.side === 'CR').reduce((s, l) => s + Number(l.amount), 0);
  return { debits: round2(debits), credits: round2(credits), balanced: Math.abs(debits - credits) < 1e-9 };
}

// Fully-loaded cost per BILLABLE hour (Section 6.3). Divides by billable hours —
// not hours worked. Two engineers on identical salaries diverge sharply here.
export function loadedCostPerBillableHour({ salary, benefits = 0, overhead = 0, availableHours, utilization }) {
  const loaded = salary + benefits + overhead;
  const billableHours = availableHours * utilization;
  return { loaded: round2(loaded), billableHours: round2(billableHours), costPerHour: billableHours > 0 ? round2(loaded / billableHours) : null };
}

// Percentage-of-completion revenue (Section 6.2). Completion = cost incurred ÷
// total estimated cost; revenue-to-date = completion × contract value.
export function percentageOfCompletion({ contractValue, estimatedCost, costIncurred }) {
  if (estimatedCost <= 0) return { completion: 0, revenueToDate: 0, profitToDate: 0 };
  const completion = costIncurred / estimatedCost;
  const revenueToDate = round2(completion * contractValue);
  return { completion: round2(completion), revenueToDate, profitToDate: round2(revenueToDate - costIncurred) };
}

// Tiered sales commission with an accelerator above quota (Section 6.4).
export function commission({ bookings, quota, baseRate, acceleratorRate }) {
  const toQuota = Math.min(bookings, quota);
  const above = Math.max(0, bookings - quota);
  const base = toQuota * baseRate;
  const accelerator = above * acceleratorRate;
  return { base: round2(base), accelerator: round2(accelerator), total: round2(base + accelerator) };
}

// CAC by channel (Section 6.5). Fully-loaded spend ÷ customers acquired.
export function cac({ spend, customers }) {
  if (!customers) return null;
  return round2(spend / customers);
}

// LTV (Section 7.2). ARPA × gross-margin% × expected lifetime (= 1/churn).
// The "LTV trap": as churn → 0 lifetime → ∞, so a horizon cap must be supplied
// when churn is zero, and may be supplied to bound an over-optimistic figure.
export function ltv({ arpaMonthly, grossMarginPct, monthlyChurn, horizonMonths = null }) {
  const monthlyGrossProfit = arpaMonthly * grossMarginPct;
  if (monthlyChurn <= 0) {
    if (!horizonMonths) return null; // refuse to report an unbounded LTV
    return round2(monthlyGrossProfit * horizonMonths);
  }
  let lifetimeMonths = 1 / monthlyChurn;
  if (horizonMonths) lifetimeMonths = Math.min(lifetimeMonths, horizonMonths);
  return round2(monthlyGrossProfit * lifetimeMonths);
}

export function ltvCacRatio(ltvValue, cacValue) {
  if (!cacValue || ltvValue == null) return null;
  return round2(ltvValue / cacValue);
}

// CAC payback in months (Section 7.2).
export function cacPayback({ cac: cacValue, arpaMonthly, grossMarginPct }) {
  const monthlyGrossProfit = arpaMonthly * grossMarginPct;
  if (monthlyGrossProfit <= 0) return null;
  return round2(cacValue / monthlyGrossProfit);
}

// Gross margin (Section 7.1). The boundary between cost-of-revenue and opex is
// what makes every downstream ratio meaningful.
export function grossMargin({ revenue, costOfRevenue }) {
  if (revenue <= 0) return null;
  return round2((revenue - costOfRevenue) / revenue);
}

// Cash runway (Section 6.9). Profit is an opinion; cash is a fact.
export function runway({ cashBalance, netMonthlyBurn }) {
  if (netMonthlyBurn <= 0) return Infinity;
  return round2(cashBalance / netMonthlyBurn);
}

// Project / client profitability (Section 7.3): a grouping, not an investigation.
export function projectProfit({ revenueRecognized, billableHours, loadedCostPerHour, directCosts = 0 }) {
  const laborCost = billableHours * loadedCostPerHour;
  const profit = revenueRecognized - laborCost - directCosts;
  return { laborCost: round2(laborCost), profit: round2(profit), margin: revenueRecognized > 0 ? round2(profit / revenueRecognized) : null };
}

// Days Sales Outstanding (Section 6.2).
export function dso({ accountsReceivable, creditSales, daysInPeriod = 365 }) {
  if (creditSales <= 0) return null;
  return round2((accountsReceivable / creditSales) * daysInPeriod);
}
