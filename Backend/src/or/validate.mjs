// Validates the OR engine against the worked examples in the research paper.
import { computeCPM } from "./cpm.js";
import { computePERT } from "./pert.js";
import { computeEVM } from "./evm.js";
import { solveAssignment } from "./assignment.js";
import { projectMarkov, compareIntervention } from "./markov.js";
import { solveLP } from "./lp.js";
import { computeNPV, rankInvestments, computeBreakEven } from "./finance.js";
import { analyzeQueue, recommendServers } from "./queue.js";
import { computeCLV } from "./clv.js";

let failures = 0;
const approx = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const check = (name, cond, got, want) => {
  console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : `  got ${got}, want ${want}`}`);
  if (!cond) failures++;
};

// --- Example 6.1: CPM, feature delivery (expected 25-day critical path) ---
const activities = [
  { code: "A", name: "Requirements", duration: 4, predecessors: [] },
  { code: "B", name: "Design", duration: 6, predecessors: ["A"] },
  { code: "C", name: "Backend development", duration: 8, predecessors: ["B"] },
  { code: "D", name: "Frontend development", duration: 5, predecessors: ["B"] },
  { code: "E", name: "Integration", duration: 4, predecessors: ["C", "D"] },
  { code: "F", name: "Testing & release", duration: 3, predecessors: ["E"] },
];
const cpm = computeCPM(activities);
check("CPM project duration = 25", cpm.projectDuration === 25, cpm.projectDuration, 25);
check("CPM critical path = A,B,C,E,F", cpm.criticalPath.join(",") === "A,B,C,E,F", cpm.criticalPath.join(","), "A,B,C,E,F");
const d = cpm.activities.find((a) => a.code === "D");
check("CPM D float = 3", d.float === 3, d.float, 3);
check("CPM D not critical", d.isCritical === false, d.isCritical, false);
check("CPM D: ES=10 EF=15 LS=13 LF=18", d.es === 10 && d.ef === 15 && d.ls === 13 && d.lf === 18, `${d.es}/${d.ef}/${d.ls}/${d.lf}`, "10/15/13/18");

// --- Example 6.2: PERT (expected 25d, sigma^2=2.76, sigma~1.66, P(<=27)~88%) ---
const pertActs = [
  { code: "A", o: 2, m: 4, p: 6, predecessors: [] },
  { code: "B", o: 4, m: 6, p: 8, predecessors: ["A"] },
  { code: "C", o: 5, m: 8, p: 11, predecessors: ["B"] },
  { code: "D", o: 3, m: 5, p: 7, predecessors: ["B"] }, // non-critical filler
  { code: "E", o: 2, m: 4, p: 6, predecessors: ["C", "D"] },
  { code: "F", o: 1, m: 3, p: 5, predecessors: ["E"] },
];
const pert = computePERT(pertActs, 27);
check("PERT expected duration = 25", approx(pert.expectedProjectDuration, 25), pert.expectedProjectDuration, 25);
// Engine uses exact variances (2.7776); paper rounds each to 0.44 -> 2.76.
check("PERT project variance ~ 2.76", approx(pert.projectVariance, 2.76, 0.02), pert.projectVariance, 2.76);
check("PERT std dev ~ 1.66", approx(pert.projectStdDev, 1.66, 0.01), pert.projectStdDev, 1.66);
check("PERT z(27) ~ 1.20", approx(pert.target.z, 1.20, 0.02), pert.target.z, 1.2);
check("PERT P(<=27) ~ 0.88", approx(pert.target.probability, 0.88, 0.01), pert.target.probability, 0.88);
check("PERT P(<=25) ~ 0.50", approx(computePERT(pertActs, 25).target.probability, 0.5, 0.01), computePERT(pertActs, 25).target.probability, 0.5);

// --- Example 6.3: EVM (BAC 200k, PV 100k, EV 80k, AC 95k -> EAC 237,500) ---
const evm = computeEVM({ bac: 200000, pv: 100000, ev: 80000, ac: 95000 });
check("EVM CV = -15000", evm.costVariance === -15000, evm.costVariance, -15000);
check("EVM SV = -20000", evm.scheduleVariance === -20000, evm.scheduleVariance, -20000);
check("EVM CPI = 0.84", approx(evm.cpi, 0.84, 0.005), evm.cpi, 0.84);
check("EVM SPI = 0.80", evm.spi === 0.8, evm.spi, 0.8);
check("EVM EAC = 237500", approx(evm.estimateAtCompletion, 237500, 1), evm.estimateAtCompletion, 237500);

// --- Example 3.1: Assignment (Ava/Ben/Cara -> Auth/Payments/Reporting = 25) ---
const asg = solveAssignment({
  agents: ["Ava", "Ben", "Cara"],
  tasks: ["Auth", "Payments", "Reporting"],
  cost: [
    [9, 11, 14],
    [6, 15, 13],
    [12, 13, 8],
  ],
  mode: "min",
});
check("Assignment optimal total = 25", asg.totalCost === 25, asg.totalCost, 25);
const pick = Object.fromEntries(asg.assignments.map((a) => [a.agent, a.task]));
check("Assignment: Ava -> Payments", pick.Ava === "Payments", pick.Ava, "Payments");
check("Assignment: Ben -> Auth", pick.Ben === "Auth", pick.Ben, "Auth");
check("Assignment: Cara -> Reporting", pick.Cara === "Reporting", pick.Cara, "Reporting");

// Rectangular safety: 2 agents, 3 tasks -> both agents matched, total minimal.
const rect = solveAssignment({
  agents: ["X", "Y"],
  tasks: ["T1", "T2", "T3"],
  cost: [
    [4, 2, 8],
    [4, 3, 7],
  ],
});
check("Assignment (2x3) matches both agents", rect.assignments.filter((a) => a.task).length === 2);

// --- Example 3.3: Markov attrition (100 engaged; month 1 = [90, 8, 2]) ---
const markov = projectMarkov({
  states: ["Engaged", "At-Risk", "Departed"],
  transition: [
    [0.9, 0.08, 0.02],
    [0.3, 0.55, 0.15],
    [0, 0, 1],
  ],
  initial: [100, 0, 0],
  horizon: 6,
});
const m1 = markov.timeline[1].counts;
check("Markov month 1 = [90, 8, 2]", m1[0] === 90 && m1[1] === 8 && m1[2] === 2, JSON.stringify(m1), "[90,8,2]");
check("Markov detects absorbing Departed state", markov.departedIndex === 2, markov.departedIndex, 2);
check("Markov departures accumulate over 6 months", markov.summary.cumulativeDepartures > 12, markov.summary.cumulativeDepartures, ">12");

// Intervention: improving At-Risk->Engaged 0.30 -> 0.45 avoids departures.
const cmp = compareIntervention({
  states: ["Engaged", "At-Risk", "Departed"],
  transition: [
    [0.9, 0.08, 0.02],
    [0.3, 0.55, 0.15],
    [0, 0, 1],
  ],
  intervention: [
    [0.9, 0.08, 0.02],
    [0.45, 0.45, 0.1],
    [0, 0, 1],
  ],
  initial: [100, 0, 0],
  horizon: 6,
});
check("Retention intervention avoids departures (>0)", cmp.departuresAvoided > 0, cmp.departuresAvoided, ">0");

// --- Example 4.1: LP capacity allocation (max profit = $480k) ---
const lp = solveLP({
  objective: { coeffs: [8, 12], labels: ["Client", "Product"] },
  constraints: [
    { coeffs: [40, 60], op: "<=", rhs: 2400, label: "Engineering-hours" },
    { coeffs: [2, 5], op: "<=", rhs: 180, label: "Cash ($k)" },
  ],
  sense: "max",
});
check("LP optimal objective = 480", approx(lp.objectiveValue, 480, 0.01), lp.objectiveValue, 480);
const hoursCon = lp.constraints.find((c) => c.label === "Engineering-hours");
check("LP hours constraint is binding", hoursCon.binding === true, hoursCon.binding, true);
check("LP hours shadow price = 0.2", approx(hoursCon.shadowPrice, 0.2, 0.001), hoursCon.shadowPrice, 0.2);
// NOTE: paper states unique (30,20) using all cash, but the objective is parallel
// to the hours constraint -> ALTERNATIVE OPTIMA (any point on 40x1+60x2=2400).
// Objective 480 and the hours dual 0.2 are the robust, correct facts.

// --- Example 4.2: NPV ranking (A = $16,164; B = $35,605) ---
const npvA = computeNPV(200000, [90000, 90000, 90000], 0.12);
const npvB = computeNPV(200000, [70000, 110000, 120000], 0.12);
check("NPV Product A ~ 16164", approx(npvA.npv, 16164, 5), npvA.npv, 16164);
check("NPV Product B ~ 35605", approx(npvB.npv, 35605, 5), npvB.npv, 35605);
const ranked = rankInvestments([
  { id: 1, name: "A", initialInvestment: 200000, cashFlows: [90000, 90000, 90000], rate: 0.12 },
  { id: 2, name: "B", initialInvestment: 200000, cashFlows: [70000, 110000, 120000], rate: 0.12 },
]);
check("NPV ranking puts B first", ranked[0].name === "B", ranked[0].name, "B");

// --- Break-even: F=240k/yr, P=$2k/mo, V=$800/mo -> ~17 clients ---
const be = computeBreakEven({ fixedCost: 240000, price: 2000, variableCost: 800, periodsPerYear: 12 });
check("Break-even contribution = 1200", be.contributionMargin === 1200, be.contributionMargin, 1200);
check("Break-even ~ 17 clients", be.breakEvenUnitsCeil === 17, be.breakEvenUnitsCeil, 17);

// --- Example 5.1: M/M/c queuing (λ=18, μ=8) ---
const q3 = analyzeQueue({ arrivalRate: 18, serviceRate: 8, servers: 3 });
const q4 = analyzeQueue({ arrivalRate: 18, serviceRate: 8, servers: 4 });
check("Queue offered load a = 2.25", q3.offeredLoad === 2.25, q3.offeredLoad, 2.25);
check("Queue c=3 utilization 0.75", approx(q3.utilization, 0.75), q3.utilization, 0.75);
check("Queue c=3 P(wait) ~ 0.57", approx(q3.probabilityWait, 0.57, 0.01), q3.probabilityWait, 0.57);
check("Queue c=3 Wq ~ 5.7 min", approx(q3.avgWaitInQueue * 60, 5.7, 0.2), q3.avgWaitInQueue * 60, 5.7);
check("Queue c=4 P(wait) ~ 0.24", approx(q4.probabilityWait, 0.24, 0.01), q4.probabilityWait, 0.24);
check("Queue c=4 Wq ~ 1.0 min", approx(q4.avgWaitInQueue * 60, 1.0, 0.2), q4.avgWaitInQueue * 60, 1.0);
const rec = recommendServers({ arrivalRate: 18, serviceRate: 8, maxProbabilityWait: 0.25 });
check("Queue recommends 4 servers for <25% wait", rec.recommended === 4, rec.recommended, 4);

// --- Example 5.2: CLV (m=$40k; r=0.85 -> $136k; r=0.90 -> $180k) ---
const clv85 = computeCLV({ annualMargin: 40000, retentionRate: 0.85, discountRate: 0.1 });
const clv90 = computeCLV({ annualMargin: 40000, retentionRate: 0.9, discountRate: 0.1 });
check("CLV @85% retention = 136000", approx(clv85.clv, 136000, 1), clv85.clv, 136000);
check("CLV @90% retention = 180000", approx(clv90.clv, 180000, 1), clv90.clv, 180000);

console.log(failures === 0 ? "\n🎯 All OR engine checks passed." : `\n❌ ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
