// Critical Path Method (CPM)
// ---------------------------------------------------------------------------
// Given a set of activities with durations and precedence (predecessor codes),
// compute the forward pass (ES/EF), backward pass (LS/LF), total float, the
// project duration, and the critical path(s).
//
// Input activities: [{ code, name?, duration, predecessors: [code, ...] }]
// Returns: {
//   projectDuration,
//   activities: [{ code, name, duration, es, ef, ls, lf, float, isCritical }],
//   criticalPath: [code, ...],   // one longest chain of critical activities
//   paths: [{ codes, length }],  // all end-to-end paths with lengths (for context)
// }

export function computeCPM(rawActivities) {
  const activities = normalize(rawActivities);
  const byCode = new Map(activities.map((a) => [a.code, a]));

  validateGraph(activities, byCode);

  const order = topologicalOrder(activities, byCode);

  // Forward pass: earliest start/finish.
  for (const code of order) {
    const a = byCode.get(code);
    a.es = a.predecessors.length
      ? Math.max(...a.predecessors.map((p) => byCode.get(p).ef))
      : 0;
    a.ef = a.es + a.duration;
  }

  const projectDuration = Math.max(...activities.map((a) => a.ef), 0);

  // Successor lookup for the backward pass.
  const successors = new Map(activities.map((a) => [a.code, []]));
  for (const a of activities) {
    for (const p of a.predecessors) successors.get(p).push(a.code);
  }

  // Backward pass: latest start/finish. Process in reverse topological order.
  for (const code of [...order].reverse()) {
    const a = byCode.get(code);
    const succ = successors.get(code);
    a.lf = succ.length
      ? Math.min(...succ.map((s) => byCode.get(s).ls))
      : projectDuration;
    a.ls = a.lf - a.duration;
    a.float = a.ls - a.es;
    // Guard against -0 and tiny floating point noise.
    a.float = Math.abs(a.float) < 1e-9 ? 0 : a.float;
    a.isCritical = a.float === 0;
  }

  return {
    projectDuration,
    activities: activities.map((a) => ({
      code: a.code,
      name: a.name,
      duration: a.duration,
      es: a.es,
      ef: a.ef,
      ls: a.ls,
      lf: a.lf,
      float: a.float,
      isCritical: a.isCritical,
    })),
    criticalPath: longestCriticalChain(activities, byCode, successors),
    paths: enumeratePaths(activities, byCode, successors),
  };
}

function normalize(rawActivities) {
  if (!Array.isArray(rawActivities) || rawActivities.length === 0) {
    throw new Error("CPM requires a non-empty array of activities.");
  }
  return rawActivities.map((a) => {
    if (a.code == null || `${a.code}`.trim() === "") {
      throw new Error("Every activity must have a non-empty code.");
    }
    const duration = Number(a.duration);
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error(`Activity ${a.code} has an invalid duration.`);
    }
    return {
      code: `${a.code}`,
      name: a.name ?? `${a.code}`,
      duration,
      predecessors: (a.predecessors || []).map((p) => `${p}`).filter((p) => p !== ""),
    };
  });
}

function validateGraph(activities, byCode) {
  const seen = new Set();
  for (const a of activities) {
    if (seen.has(a.code)) throw new Error(`Duplicate activity code: ${a.code}`);
    seen.add(a.code);
  }
  for (const a of activities) {
    for (const p of a.predecessors) {
      if (!byCode.has(p)) {
        throw new Error(`Activity ${a.code} references unknown predecessor ${p}.`);
      }
    }
  }
}

// Kahn's algorithm; also detects cycles (which are invalid in a project network).
function topologicalOrder(activities, byCode) {
  const indegree = new Map(activities.map((a) => [a.code, a.predecessors.length]));
  const successors = new Map(activities.map((a) => [a.code, []]));
  for (const a of activities) {
    for (const p of a.predecessors) successors.get(p).push(a.code);
  }
  const queue = activities.filter((a) => indegree.get(a.code) === 0).map((a) => a.code);
  const order = [];
  while (queue.length) {
    const code = queue.shift();
    order.push(code);
    for (const s of successors.get(code)) {
      indegree.set(s, indegree.get(s) - 1);
      if (indegree.get(s) === 0) queue.push(s);
    }
  }
  if (order.length !== activities.length) {
    throw new Error("Activity network contains a cycle; precedence must be acyclic.");
  }
  return order;
}

// Trace one longest chain of critical (zero-float) activities from a start node.
function longestCriticalChain(activities, byCode, successors) {
  const critical = activities.filter((a) => a.isCritical);
  if (!critical.length) return [];
  const criticalSet = new Set(critical.map((a) => a.code));

  // Start nodes: critical activities with no critical predecessor.
  const starts = critical.filter(
    (a) => !a.predecessors.some((p) => criticalSet.has(p))
  );

  let best = [];
  const walk = (code, chain) => {
    const a = byCode.get(code);
    const next = chain.concat(code);
    const criticalSucc = successors.get(code).filter((s) => criticalSet.has(s));
    if (criticalSucc.length === 0) {
      const length = next.reduce((sum, c) => sum + byCode.get(c).duration, 0);
      const bestLength = best.reduce((sum, c) => sum + byCode.get(c).duration, 0);
      if (length > bestLength) best = next;
      return;
    }
    for (const s of criticalSucc) walk(s, next);
  };
  for (const s of starts) walk(s.code, []);
  return best;
}

// Enumerate all source-to-sink paths and their total durations (for reporting).
function enumeratePaths(activities, byCode, successors) {
  const hasPred = new Set();
  const isSource = (a) => a.predecessors.length === 0;
  const paths = [];
  const sinks = new Set(
    activities.filter((a) => successors.get(a.code).length === 0).map((a) => a.code)
  );

  const walk = (code, chain) => {
    const next = chain.concat(code);
    if (sinks.has(code)) {
      paths.push({
        codes: next,
        length: next.reduce((sum, c) => sum + byCode.get(c).duration, 0),
      });
      return;
    }
    for (const s of successors.get(code)) walk(s, next);
  };
  for (const a of activities.filter(isSource)) walk(a.code, []);
  // Sort longest first so the critical path is at the top.
  return paths.sort((x, y) => y.length - x.length);
}
