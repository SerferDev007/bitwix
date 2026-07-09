// Linear Programming (budget / capacity allocation)
// ---------------------------------------------------------------------------
// Solves  maximize c·x  subject to  A x ≤ b,  x ≥ 0  (b ≥ 0) via the simplex
// method, and returns the optimal solution, objective value, per-constraint
// slack/binding status, and shadow prices (dual values) from the final tableau.
//
// Scope: "≤" constraints with non-negative RHS — the standard capacity-
// allocation form (all-slack basis is immediately feasible). Constraints with
// ">=" / "=" or negative RHS are out of scope and rejected with a clear error.
//
// Input:
//   objective:   { coeffs: number[n], labels?: string[] }
//   constraints: [{ coeffs: number[n], op: "<=", rhs: number, label?: string }]
//   sense:       "max" (default). "min" is handled by negating the objective.

export function solveLP({ objective, constraints, sense = "max" }) {
  const c0 = objective?.coeffs;
  if (!Array.isArray(c0) || c0.length === 0) throw new Error("Objective coefficients are required.");
  if (!Array.isArray(constraints) || constraints.length === 0) throw new Error("At least one constraint is required.");

  const n = c0.length;
  for (const con of constraints) {
    if (!Array.isArray(con.coeffs) || con.coeffs.length !== n) {
      throw new Error("Each constraint must have one coefficient per variable.");
    }
    if ((con.op || "<=") !== "<=") {
      throw new Error('Only "<=" constraints are supported in this solver.');
    }
    if (Number(con.rhs) < 0) {
      throw new Error("Constraint right-hand sides must be non-negative.");
    }
  }

  // For minimization, maximize the negated objective.
  const c = sense === "min" ? c0.map((v) => -Number(v)) : c0.map(Number);
  const A = constraints.map((con) => con.coeffs.map(Number));
  const b = constraints.map((con) => Number(con.rhs));

  const { x, objective: zMax, shadow, unbounded } = simplexMax(c, A, b);
  if (unbounded) throw Object.assign(new Error("The problem is unbounded."), { userFacing: true });

  const objectiveValue = sense === "min" ? -zMax : zMax;

  const labels = objective.labels && objective.labels.length === n
    ? objective.labels
    : Array.from({ length: n }, (_, i) => `x${i + 1}`);

  const solution = labels.map((label, i) => ({ label, value: round(x[i]) }));

  const constraintReport = constraints.map((con, i) => {
    const used = A[i].reduce((sum, a, j) => sum + a * x[j], 0);
    const slack = b[i] - used;
    return {
      label: con.label || `c${i + 1}`,
      used: round(used),
      rhs: round(b[i]),
      slack: round(slack),
      binding: Math.abs(slack) < 1e-6,
      shadowPrice: round(shadow[i]),
    };
  });

  return {
    sense,
    objectiveValue: round(objectiveValue),
    solution,
    constraints: constraintReport,
    // A shadow price is the marginal objective gain per unit of that resource.
    note: "Shadow prices show the marginal objective gain from one more unit of each binding resource.",
  };
}

function simplexMax(c, A, b) {
  const m = A.length;
  const n = c.length;
  const cols = n + m + 1; // structural + slack + RHS

  // Build the tableau: m constraint rows + 1 objective (z) row.
  const T = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(cols).fill(0);
    for (let j = 0; j < n; j++) row[j] = A[i][j];
    row[n + i] = 1; // slack variable
    row[cols - 1] = b[i];
    T.push(row);
  }
  const z = new Array(cols).fill(0);
  for (let j = 0; j < n; j++) z[j] = -c[j];
  T.push(z);

  const basis = Array.from({ length: m }, (_, i) => n + i);

  for (let iter = 0; iter < 2000; iter++) {
    // Entering variable: most negative coefficient in the z row.
    let pivotCol = -1;
    let best = -1e-9;
    for (let j = 0; j < cols - 1; j++) {
      if (T[m][j] < best) {
        best = T[m][j];
        pivotCol = j;
      }
    }
    if (pivotCol === -1) break; // optimal

    // Leaving variable: minimum ratio test.
    let pivotRow = -1;
    let minRatio = Infinity;
    for (let i = 0; i < m; i++) {
      const a = T[i][pivotCol];
      if (a > 1e-12) {
        const ratio = T[i][cols - 1] / a;
        if (ratio < minRatio - 1e-12) {
          minRatio = ratio;
          pivotRow = i;
        }
      }
    }
    if (pivotRow === -1) return { unbounded: true };

    // Pivot.
    const piv = T[pivotRow][pivotCol];
    for (let j = 0; j < cols; j++) T[pivotRow][j] /= piv;
    for (let i = 0; i <= m; i++) {
      if (i === pivotRow) continue;
      const factor = T[i][pivotCol];
      if (Math.abs(factor) > 1e-12) {
        for (let j = 0; j < cols; j++) T[i][j] -= factor * T[pivotRow][j];
      }
    }
    basis[pivotRow] = pivotCol;
  }

  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    if (basis[i] < n) x[basis[i]] = T[i][cols - 1];
  }
  const objective = T[m][cols - 1];
  const shadow = [];
  for (let i = 0; i < m; i++) shadow.push(T[m][n + i]); // z-row under slacks = duals

  return { x, objective, shadow };
}

function round(x, dp = 4) {
  if (x == null || !Number.isFinite(x)) return x;
  const f = 10 ** dp;
  const r = Math.round((x + Number.EPSILON) * f) / f;
  return Object.is(r, -0) ? 0 : r;
}
