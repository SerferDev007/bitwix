// Assignment Problem (skill-based task allocation)
// ---------------------------------------------------------------------------
// Match n agents (developers) one-to-one with m tasks to minimize total cost,
// solved exactly with the Hungarian / Kuhn-Munkres algorithm in O(k^3) where
// k = max(n, m). Rectangular matrices are padded to square with zero-cost
// dummy rows/columns (unmatched agents/tasks fall on the dummies).
//
// Input:
//   agents:  [label, ...]            (rows)
//   tasks:   [label, ...]            (cols)
//   cost:    number[n][m]            (cost of agent i doing task j)
//   mode:    "min" (default) | "max" (e.g. maximize skill-fit score)
//
// Returns optimal assignment, total cost, and a greedy baseline for contrast.

export function solveAssignment({ agents, tasks, cost, mode = "min" }) {
  validate(agents, tasks, cost);

  const n = agents.length;
  const m = tasks.length;

  // For maximization, negate against the max so we can reuse the min solver.
  const flat = cost.flat();
  const maxVal = Math.max(...flat);
  const work = cost.map((row) => row.map((c) => (mode === "max" ? maxVal - c : c)));

  const assignRowToCol = hungarian(work); // assignRowToCol[i] = j (or -1)

  const assignments = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const j = assignRowToCol[i];
    if (j != null && j >= 0 && j < m) {
      assignments.push({ agent: agents[i], task: tasks[j], cost: cost[i][j] });
      total += cost[i][j];
    } else {
      assignments.push({ agent: agents[i], task: null, cost: null });
    }
  }

  const greedy = greedyAssignment(agents, tasks, cost, mode);

  return {
    mode,
    assignments,
    totalCost: round(total),
    greedyTotalCost: round(greedy.total),
    // Savings vs a naive greedy assignment (positive = optimizer did better).
    savingsVsGreedy: round(mode === "max" ? total - greedy.total : greedy.total - total),
  };
}

function validate(agents, tasks, cost) {
  if (!Array.isArray(agents) || !agents.length) throw new Error("At least one agent is required.");
  if (!Array.isArray(tasks) || !tasks.length) throw new Error("At least one task is required.");
  if (!Array.isArray(cost) || cost.length !== agents.length) {
    throw new Error("Cost matrix rows must match the number of agents.");
  }
  for (const row of cost) {
    if (!Array.isArray(row) || row.length !== tasks.length) {
      throw new Error("Each cost matrix row must match the number of tasks.");
    }
    for (const c of row) {
      if (!Number.isFinite(Number(c))) throw new Error("Cost matrix contains a non-numeric value.");
    }
  }
}

// Kuhn-Munkres via potentials (e-maxx formulation), 1-indexed internally.
// Minimizes total cost over a square matrix; pads rectangular input with zeros.
function hungarian(cost) {
  const n = cost.length;
  const m = cost[0].length;
  const dim = Math.max(n, m);
  const INF = Infinity;

  const a = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => (i < n && j < m ? Number(cost[i][j]) : 0))
  );

  const u = new Array(dim + 1).fill(0);
  const v = new Array(dim + 1).fill(0);
  const p = new Array(dim + 1).fill(0); // p[j] = row matched to column j
  const way = new Array(dim + 1).fill(0);

  for (let i = 1; i <= dim; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(dim + 1).fill(INF);
    const used = new Array(dim + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= dim; j++) {
        if (!used[j]) {
          const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= dim; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= dim; j++) {
    const i = p[j];
    if (i >= 1 && i <= n && j <= m) rowToCol[i - 1] = j - 1;
  }
  return rowToCol;
}

// Naive greedy: repeatedly take the best remaining (agent, task) pair.
function greedyAssignment(agents, tasks, cost, mode) {
  const usedRows = new Set();
  const usedCols = new Set();
  const pairs = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = 0; j < tasks.length; j++) pairs.push({ i, j, c: cost[i][j] });
  }
  pairs.sort((a, b) => (mode === "max" ? b.c - a.c : a.c - b.c));
  let total = 0;
  const k = Math.min(agents.length, tasks.length);
  let count = 0;
  for (const { i, j, c } of pairs) {
    if (count === k) break;
    if (!usedRows.has(i) && !usedCols.has(j)) {
      usedRows.add(i);
      usedCols.add(j);
      total += c;
      count++;
    }
  }
  return { total };
}

function round(x, dp = 4) {
  if (x == null || !Number.isFinite(x)) return x;
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
}
