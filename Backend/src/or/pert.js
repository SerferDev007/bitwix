// Program Evaluation and Review Technique (PERT)
// ---------------------------------------------------------------------------
// Each activity has three-point estimates (optimistic o, most likely m,
// pessimistic p). PERT computes the expected duration and variance per the
// Beta-distribution approximation, runs CPM on the expected durations to find
// the critical path, then aggregates mean and variance along that path and
// gives the probability of finishing by a target date (Normal approximation).
//
// Input: [{ code, name?, o, m, p, predecessors: [code, ...] }]

import { computeCPM } from "./cpm.js";

export function expectedDuration(o, m, p) {
  return (Number(o) + 4 * Number(m) + Number(p)) / 6;
}

export function activityVariance(o, p) {
  return ((Number(p) - Number(o)) / 6) ** 2;
}

export function computePERT(rawActivities, targetDuration) {
  const activities = rawActivities.map((a) => {
    const o = Number(a.o);
    const m = Number(a.m);
    const p = Number(a.p);
    if (![o, m, p].every(Number.isFinite)) {
      throw new Error(`Activity ${a.code} needs numeric o, m, p estimates.`);
    }
    if (!(o <= m && m <= p)) {
      throw new Error(`Activity ${a.code}: require optimistic <= most likely <= pessimistic.`);
    }
    return {
      code: `${a.code}`,
      name: a.name ?? `${a.code}`,
      o,
      m,
      p,
      te: round(expectedDuration(o, m, p)),
      variance: round(activityVariance(o, p)),
      predecessors: (a.predecessors || []).map((x) => `${x}`).filter((x) => x !== ""),
    };
  });

  // Run CPM using expected durations to locate the critical path.
  const cpm = computeCPM(
    activities.map((a) => ({
      code: a.code,
      name: a.name,
      duration: a.te,
      predecessors: a.predecessors,
    }))
  );

  const byCode = new Map(activities.map((a) => [a.code, a]));
  const criticalCodes = new Set(cpm.activities.filter((a) => a.isCritical).map((a) => a.code));

  const expectedProjectDuration = round(cpm.projectDuration);
  // Project variance = sum of variances along the critical path.
  const projectVariance = round(
    [...criticalCodes].reduce((sum, c) => sum + byCode.get(c).variance, 0)
  );
  const projectStdDev = round(Math.sqrt(projectVariance));

  const result = {
    expectedProjectDuration,
    projectVariance,
    projectStdDev,
    criticalPath: cpm.criticalPath,
    activities: activities.map((a) => ({
      code: a.code,
      name: a.name,
      o: a.o,
      m: a.m,
      p: a.p,
      te: a.te,
      variance: a.variance,
      isCritical: criticalCodes.has(a.code),
    })),
  };

  // If a target completion time is supplied, give P(finish <= target).
  if (targetDuration != null && Number.isFinite(Number(targetDuration))) {
    const target = Number(targetDuration);
    const z = projectStdDev > 0 ? (target - expectedProjectDuration) / projectStdDev : Infinity;
    result.target = {
      targetDuration: target,
      z: round(z),
      probability: round(normalCdf(z)),
    };
  }

  return result;
}

// Standard normal CDF via the Abramowitz & Stegun 7.1.26 error-function approx.
export function normalCdf(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x) {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function round(x, dp = 4) {
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
}
