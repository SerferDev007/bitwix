// Validates the Financial Management System against the paper's worked examples
// (Tables 7, 9, 13; Sections 2, 4, 6, 7). Pure — no database needed.
import { buildLines, assertBalanced } from './postingRules.js';
import { ACCOUNTS } from './accounts.js';
import * as A from './analytics.js';
import * as R from './rbac.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.log(`❌ ${name}`); fail++; }
}
const approx = (a, b, eps = 0.01) => a != null && Math.abs(a - b) <= eps;

// ─── The $120k contract through the ledger (Table 7), amounts in cents ───
const invoice = buildLines('INVOICE_ISSUED', { amount: 12000000, account_ref_id: 1 });
const payment = buildLines('PAYMENT_RECEIVED', { amount: 12000000, account_ref_id: 1 });
const recognize = buildLines('REVENUE_RECOGNIZED', { amount: 1000000, account_ref_id: 1 });
const payroll = buildLines('PAYROLL_APPROVED', {
  lines: [{ employee: 1, cost_center: 'ENG', gross: 600000, net: 480000, tax: 120000, is_billable_role: true }],
});

check('Invoice issued is balanced', assertBalanced(invoice).debits === 12000000);
check('Payment received is balanced', assertBalanced(payment).debits === 12000000);
check('Revenue recognized is balanced', assertBalanced(recognize).debits === 1000000);
check('Payroll posts balanced (gross = net + tax)', assertBalanced(payroll).debits === 600000);

const all = [...invoice, ...payment, ...recognize, ...payroll];
const side = (code, s) => all.filter((l) => l.account === code && l.side === s).reduce((sum, l) => sum + l.amount, 0);
const net = (code) => side(code, 'DR') - side(code, 'CR');
check('Invoicing does NOT record revenue (Revenue untouched by entry 1)',
  invoice.every((l) => l.account !== ACCOUNTS.REVENUE));
check('Bank holds $120,000', net(ACCOUNTS.BANK) === 12000000);
check('Accounts Receivable nets to $0 after payment', net(ACCOUNTS.ACCOUNTS_RECEIVABLE) === 0);
check('Deferred Revenue is $110,000 (11 months still owed)', -net(ACCOUNTS.DEFERRED_REVENUE) === 11000000);
check('Revenue recognized is $10,000 (month 1 only)', -net(ACCOUNTS.REVENUE) === 1000000);
check('Cost of Revenue is $6,000', net(ACCOUNTS.COST_OF_REVENUE) === 600000);
check('Whole ledger balances (Σ DR = Σ CR)', A.trialBalance(all).balanced);

let threw = false;
try { assertBalanced([{ side: 'DR', account: '1000', amount: 100 }, { side: 'CR', account: '4000', amount: 90 }]); }
catch { threw = true; }
check('An unbalanced entry is rejected before persistence', threw);

// ─── Loaded cost per billable hour (Table 9) ───
const engA = A.loadedCostPerBillableHour({ salary: 100000, benefits: 25000, overhead: 25000, availableHours: 2000, utilization: 0.80 });
const engB = A.loadedCostPerBillableHour({ salary: 100000, benefits: 25000, overhead: 25000, availableHours: 2000, utilization: 0.55 });
check('Engineer A loaded cost/hr = $93.75', approx(engA.costPerHour, 93.75));
check('Engineer B loaded cost/hr = $136.36', approx(engB.costPerHour, 136.36));

// ─── Percentage of completion (Section 6.2) ───
const poc = A.percentageOfCompletion({ contractValue: 300000, estimatedCost: 200000, costIncurred: 80000 });
check('POC completion = 40%', approx(poc.completion, 0.40));
check('POC revenue-to-date = $120,000', approx(poc.revenueToDate, 120000));
check('POC profit-to-date = $40,000', approx(poc.profitToDate, 40000));

// ─── Sales commission with accelerator (Section 6.4) ───
const comm = A.commission({ bookings: 650000, quota: 500000, baseRate: 0.08, acceleratorRate: 0.12 });
check('Commission base (8% to quota) = $40,000', approx(comm.base, 40000));
check('Commission accelerator (12% above) = $18,000', approx(comm.accelerator, 18000));
check('Commission total = $58,000', approx(comm.total, 58000));

// ─── CAC / LTV / payback (Table 13) ───
const cacV = A.cac({ spend: 600000, customers: 40 });
const ltvV = A.ltv({ arpaMonthly: 2000, grossMarginPct: 0.75, monthlyChurn: 0.015 });
check('CAC = $15,000', approx(cacV, 15000));
check('LTV = $100,000', approx(ltvV, 100000, 1));
check('LTV:CAC ≈ 6.7', approx(A.ltvCacRatio(ltvV, cacV), 6.67, 0.05));
check('CAC payback = 10 months', approx(A.cacPayback({ cac: cacV, arpaMonthly: 2000, grossMarginPct: 0.75 }), 10));
check('LTV is withheld when churn = 0 and no horizon (the LTV trap)',
  A.ltv({ arpaMonthly: 2000, grossMarginPct: 0.75, monthlyChurn: 0 }) === null);

// ─── Gross margin / runway / project profit (Section 7) ───
check('Gross margin = 75%', approx(A.grossMargin({ revenue: 100000, costOfRevenue: 25000 }), 0.75));
check('Runway = 12 months', approx(A.runway({ cashBalance: 2400000, netMonthlyBurn: 200000 }), 12));
const pp = A.projectProfit({ revenueRecognized: 180000, billableHours: 1400, loadedCostPerHour: 95, directCosts: 12000 });
check('Project profit = $35,000', approx(pp.profit, 35000));
check('Project margin ≈ 19%', approx(pp.margin, 0.19, 0.005));

// ─── Controls: maker-checker, approval matrix, SoD (Section 2) ───
check('Maker cannot be checker (BR-05)', R.makerCheckerOk(7, 7) === false);
check('A different checker is allowed', R.makerCheckerOk(7, 8) === true);
check('$500 needs 1 approver (Budget Owner)', R.requiredApprovers(500).length === 1);
check('$12,000 needs 3 approvers (adds CFO)', R.requiredApprovers(12000).length === 3);
check('> $50,000 needs board sign-off', R.requiredApprovers(60000).includes('BOARD'));
check('Split 6k + 6k is flagged (aggregate raises the tier)', R.splitPaymentFlag([6000, 6000]) === true);
check('Two $400 payments are not flagged', R.splitPaymentFlag([400, 400]) === false);
check('CFO can approve but cannot create journals', R.fmsCan('CFO', 'journal.create') === false && R.fmsCan('CFO', 'journal.approve') === true);
check('Auditor is read-only (no writes, ever)', R.fmsCan('AUDITOR', 'journal.create') === false && R.fmsCan('AUDITOR', 'report.read') === true);
check('SoD: create-vendor + approve-payment is a conflict', R.sodViolations(['vendor.create', 'payment.approve']).length === 1);
check('SoD: bank-reconcile + create-payment is a conflict', R.sodViolations(['bank.reconcile', 'payment.create']).length === 1);
check('SoD: no standard role violates its own duties (CFO)', R.sodViolations([...R.FMS_MATRIX.CFO]).length === 0);
check('SoD: no standard role violates its own duties (Finance Exec)', R.sodViolations([...R.FMS_MATRIX.FINANCE_EXEC]).length === 0);
check('SoD: no standard role violates its own duties (Finance Manager)', R.sodViolations([...R.FMS_MATRIX.FINANCE_MANAGER]).length === 0);

console.log(`\n🎯 FMS checks: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
