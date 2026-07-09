// Markov Attrition / Retention Model
// ---------------------------------------------------------------------------
// Model the workforce as a Markov chain over engagement states (e.g. Engaged,
// At-Risk, Departed with Departed absorbing). Given a one-period transition
// matrix and an initial state vector (head counts), project the workforce
// forward over a horizon, and optionally compare a retention intervention
// (a modified transition matrix) against the baseline.
//
// Input:
//   states:     [name, ...]                 (length k)
//   transition: number[k][k]                (row-stochastic: each row sums to 1)
//   initial:    number[k]                   (head counts per state at t=0)
//   horizon:    integer periods to project
//   absorbing:  optional index of the absorbing "departed" state (for summaries)

export function projectMarkov({ states, transition, initial, horizon = 6, absorbing }) {
  validate(states, transition, initial);
  const k = states.length;
  const H = Math.max(1, Math.floor(Number(horizon) || 1));

  const timeline = [snapshot(0, initial.map(Number), states)];
  let current = initial.map(Number);
  for (let t = 1; t <= H; t++) {
    current = step(current, transition);
    timeline.push(snapshot(t, current, states));
  }

  // Identify the absorbing (departed) state if not supplied: a row that maps
  // entirely to itself (diagonal ~ 1).
  const departedIndex =
    absorbing != null ? absorbing : transition.findIndex((row, i) => Math.abs(row[i] - 1) < 1e-9);

  const startTotalActive =
    departedIndex >= 0
      ? initial.reduce((s, v, i) => s + (i === departedIndex ? 0 : Number(v)), 0)
      : initial.reduce((s, v) => s + Number(v), 0);

  const endDeparted = departedIndex >= 0 ? current[departedIndex] : null;
  const startDeparted = departedIndex >= 0 ? Number(initial[departedIndex]) : 0;

  return {
    states,
    horizon: H,
    departedIndex,
    timeline,
    summary: {
      startTotalActive: round(startTotalActive),
      cumulativeDepartures: endDeparted == null ? null : round(endDeparted - startDeparted),
      finalState: timeline[timeline.length - 1].counts,
    },
  };
}

// Compare a baseline transition matrix against an intervention matrix.
// Returns both projections and the headcount difference in the absorbing state.
export function compareIntervention({ states, transition, intervention, initial, horizon = 6, absorbing }) {
  const base = projectMarkov({ states, transition, initial, horizon, absorbing });
  const withIntervention = projectMarkov({
    states,
    transition: intervention,
    initial,
    horizon,
    absorbing,
  });

  const di = base.departedIndex;
  const baseDep = base.summary.cumulativeDepartures;
  const intvDep = withIntervention.summary.cumulativeDepartures;

  return {
    baseline: base,
    intervention: withIntervention,
    departuresAvoided:
      baseDep == null || intvDep == null ? null : round(baseDep - intvDep),
    departedState: di >= 0 ? states[di] : null,
  };
}

function step(vector, transition) {
  const k = vector.length;
  const next = new Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      next[j] += Number(vector[i]) * Number(transition[i][j]);
    }
  }
  return next;
}

function snapshot(period, counts, states) {
  const total = counts.reduce((s, v) => s + v, 0);
  return {
    period,
    counts: counts.map((c) => round(c)),
    byState: Object.fromEntries(states.map((s, i) => [s, round(counts[i])])),
    total: round(total),
  };
}

function validate(states, transition, initial) {
  if (!Array.isArray(states) || states.length < 2) {
    throw new Error("At least two states are required.");
  }
  const k = states.length;
  if (!Array.isArray(transition) || transition.length !== k) {
    throw new Error("Transition matrix must be square and match the number of states.");
  }
  for (const row of transition) {
    if (!Array.isArray(row) || row.length !== k) {
      throw new Error("Each transition row must match the number of states.");
    }
    const sum = row.reduce((s, v) => s + Number(v), 0);
    if (Math.abs(sum - 1) > 1e-6) {
      throw new Error(`Each transition row must sum to 1 (got ${round(sum)}).`);
    }
    for (const v of row) {
      if (Number(v) < 0 || Number(v) > 1) throw new Error("Transition probabilities must be in [0, 1].");
    }
  }
  if (!Array.isArray(initial) || initial.length !== k) {
    throw new Error("Initial state vector must match the number of states.");
  }
}

function round(x, dp = 4) {
  if (x == null || !Number.isFinite(x)) return x;
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
}
