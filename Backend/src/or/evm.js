// Earned Value Management (EVM)
// ---------------------------------------------------------------------------
// Given the budget at completion (BAC) and a status-date snapshot of
// Planned Value (PV), Earned Value (EV), and Actual Cost (AC), compute the
// standard EVM variances, performance indices, and forecasts.
//
// CV  = EV - AC              (cost variance; negative = over budget)
// SV  = EV - PV              (schedule variance; negative = behind)
// CPI = EV / AC              (cost performance index)
// SPI = EV / PV              (schedule performance index)
// EAC = BAC / CPI            (estimate at completion; assumes current efficiency holds)
// ETC = EAC - AC             (estimate to complete)
// VAC = BAC - EAC            (variance at completion)
// TCPI= (BAC - EV)/(BAC - AC)(to-complete performance index vs. BAC)
// %   completion = EV / BAC

export function computeEVM({ bac, pv, ev, ac }) {
  const BAC = Number(bac);
  const PV = Number(pv);
  const EV = Number(ev);
  const AC = Number(ac);

  for (const [k, v] of Object.entries({ bac: BAC, pv: PV, ev: EV, ac: AC })) {
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`EVM input "${k}" must be a non-negative number.`);
    }
  }

  const cv = EV - AC;
  const sv = EV - PV;
  const cpi = AC === 0 ? null : EV / AC;
  const spi = PV === 0 ? null : EV / PV;
  const eac = cpi ? BAC / cpi : null;
  const etc = eac == null ? null : eac - AC;
  const vac = eac == null ? null : BAC - eac;
  const tcpi = BAC - AC === 0 ? null : (BAC - EV) / (BAC - AC);

  return {
    inputs: { bac: BAC, pv: PV, ev: EV, ac: AC },
    costVariance: round(cv),
    scheduleVariance: round(sv),
    cpi: round(cpi),
    spi: round(spi),
    estimateAtCompletion: round(eac),
    estimateToComplete: round(etc),
    varianceAtCompletion: round(vac),
    toCompletePerformanceIndex: round(tcpi),
    percentComplete: BAC === 0 ? null : round((EV / BAC) * 100, 2),
    status: {
      cost: cv < 0 ? "over_budget" : cv > 0 ? "under_budget" : "on_budget",
      schedule: sv < 0 ? "behind_schedule" : sv > 0 ? "ahead_of_schedule" : "on_schedule",
    },
  };
}

function round(x, dp = 2) {
  if (x == null || !Number.isFinite(x)) return null;
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
}
