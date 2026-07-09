// M/M/c Queuing (support-desk staffing)
// ---------------------------------------------------------------------------
// Poisson arrivals (rate λ), exponential service (rate μ per agent), c parallel
// agents. Computes the offered load, utilization, the Erlang C probability that
// an arriving request must wait, and the mean waiting/queue metrics.
//
//   a  = λ / μ                    (offered load, Erlangs)
//   ρ  = λ / (c μ)                (utilization; must be < 1 for stability)
//   C(c,a) = Erlang C probability of waiting
//   Wq = C(c,a) / (c μ − λ)       (mean wait in queue)
//   Lq = λ Wq                     (mean number waiting)
//   W  = Wq + 1/μ ,  L = λ W

export function analyzeQueue({ arrivalRate, serviceRate, servers }) {
  const lambda = Number(arrivalRate);
  const mu = Number(serviceRate);
  const c = Number(servers);
  if (!(lambda > 0) || !(mu > 0)) throw new Error("Arrival and service rates must be positive.");
  if (!Number.isInteger(c) || c < 1) throw new Error("Number of servers must be a positive integer.");

  const a = lambda / mu;
  const rho = lambda / (c * mu);

  if (rho >= 1) {
    return {
      arrivalRate: lambda,
      serviceRate: mu,
      servers: c,
      offeredLoad: round(a),
      utilization: round(rho),
      stable: false,
      message: `Unstable: utilization ρ = ${round(rho)} ≥ 1. Need at least ${Math.floor(a) + 1} servers.`,
      minServersForStability: Math.floor(a) + 1,
    };
  }

  const pWait = erlangC(c, a);
  const wq = pWait / (c * mu - lambda); // in the same time unit as the rates
  const lq = lambda * wq;
  const w = wq + 1 / mu;
  const l = lambda * w;

  return {
    arrivalRate: lambda,
    serviceRate: mu,
    servers: c,
    offeredLoad: round(a),
    utilization: round(rho),
    stable: true,
    probabilityWait: round(pWait),
    avgWaitInQueue: round(wq, 6),
    avgTimeInSystem: round(w, 6),
    avgNumberInQueue: round(lq),
    avgNumberInSystem: round(l),
    minServersForStability: Math.floor(a) + 1,
  };
}

// Recommend the fewest servers meeting a target (max probability of waiting
// and/or a max average wait). Scans upward from the stability minimum.
export function recommendServers({ arrivalRate, serviceRate, maxProbabilityWait, maxAvgWait, maxServers = 100 }) {
  const lambda = Number(arrivalRate);
  const mu = Number(serviceRate);
  const a = lambda / mu;
  const start = Math.floor(a) + 1;
  const options = [];
  let recommended = null;

  for (let c = start; c <= Math.min(maxServers, start + 50); c++) {
    const r = analyzeQueue({ arrivalRate: lambda, serviceRate: mu, servers: c });
    options.push(r);
    const okProb = maxProbabilityWait == null || r.probabilityWait <= Number(maxProbabilityWait);
    const okWait = maxAvgWait == null || r.avgWaitInQueue <= Number(maxAvgWait);
    if (okProb && okWait) {
      recommended = c;
      break;
    }
  }
  return { recommended, options };
}

// Erlang C: probability that an arriving customer must queue.
export function erlangC(c, a) {
  const rho = a / c;
  if (rho >= 1) return 1;
  // a^c / c! * 1/(1-rho)
  const lastTerm = (poissonTerm(a, c) / (1 - rho));
  let sum = 0;
  for (let k = 0; k < c; k++) sum += poissonTerm(a, k);
  return lastTerm / (sum + lastTerm);
}

// a^k / k!  computed iteratively to avoid overflow for large k.
function poissonTerm(a, k) {
  let term = 1;
  for (let i = 1; i <= k; i++) term *= a / i;
  return term;
}

function round(x, dp = 4) {
  if (x == null || !Number.isFinite(x)) return x;
  const f = 10 ** dp;
  const r = Math.round((x + Number.EPSILON) * f) / f;
  return Object.is(r, -0) ? 0 : r;
}
