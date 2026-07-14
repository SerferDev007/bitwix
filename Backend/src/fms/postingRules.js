// The posting layer (Section 4.2). Operational systems emit business EVENTS;
// these rules are the ONLY place that translates an event into balanced journal
// LINES. Keeping every rule here means a change in accounting policy is one
// change, auditable in one place — and the operational systems stay ignorant of
// accounting, which is the only realistic way to keep them correct.
//
// Amounts are integer MINOR UNITS (cents). Never floating point (NFR: money) —
// the engine asserts Σ debits === Σ credits with exact integer arithmetic.
import { ACCOUNTS } from './accounts.js';

const DR = (account, amount, dims = {}) => ({ side: 'DR', account, amount, ...dims });
const CR = (account, amount, dims = {}) => ({ side: 'CR', account, amount, ...dims });
const sumSide = (lines, side) => lines.filter((l) => l.side === side).reduce((s, l) => s + l.amount, 0);

// The invariant that makes a ledger a ledger (BR-01). Checked BEFORE persistence.
export function assertBalanced(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('An entry needs at least two lines.');
  if (lines.some((l) => !Number.isInteger(l.amount) || l.amount <= 0)) {
    throw new Error('Every line amount must be a positive integer (minor units).');
  }
  const debits = sumSide(lines, 'DR');
  const credits = sumSide(lines, 'CR');
  if (debits !== credits) throw new Error(`Unbalanced entry: DR ${debits} vs CR ${credits}`);
  return { debits, credits };
}

export const POSTING_RULES = {
  // Invoice issued: a receivable and a LIABILITY (deferred revenue) — NOT
  // revenue (BR-04). Invoicing a client is a promise to deliver, not income.
  INVOICE_ISSUED: (e) => [
    DR(ACCOUNTS.ACCOUNTS_RECEIVABLE, e.amount, { account_ref_id: e.account_ref_id }),
    CR(ACCOUNTS.DEFERRED_REVENUE, e.amount, { account_ref_id: e.account_ref_id }),
  ],

  // Payment received: converts a receivable into cash. Still not revenue.
  PAYMENT_RECEIVED: (e) => [
    DR(ACCOUNTS.BANK, e.amount),
    CR(ACCOUNTS.ACCOUNTS_RECEIVABLE, e.amount, { account_ref_id: e.account_ref_id }),
  ],

  // Revenue recognized: the obligation is discharged, one period at a time.
  REVENUE_RECOGNIZED: (e) => [
    DR(ACCOUNTS.DEFERRED_REVENUE, e.amount, { account_ref_id: e.account_ref_id }),
    CR(ACCOUNTS.REVENUE, e.amount, { account_ref_id: e.account_ref_id, project_id: e.project_id }),
  ],

  // Payroll approved (from HR): split by cost center — billable roles land in
  // Cost of Revenue, everyone else in Operating Expense — else gross margin is
  // meaningless (Section 6.3). Credits: what the company now owes.
  PAYROLL_APPROVED: (e) => {
    const lines = [];
    for (const l of e.lines) {
      const account = l.is_billable_role ? ACCOUNTS.COST_OF_REVENUE : ACCOUNTS.OPERATING_EXPENSE;
      lines.push(DR(account, l.gross, { cost_center: l.cost_center, employee_id: l.employee }));
    }
    // Only emit a payable line when it's non-zero — a zero-amount line is
    // invalid, and net + tax still equals the gross total either way.
    const net = e.lines.reduce((s, l) => s + l.net, 0);
    const tax = e.lines.reduce((s, l) => s + l.tax, 0);
    if (net > 0) lines.push(CR(ACCOUNTS.NET_PAY_PAYABLE, net));
    if (tax > 0) lines.push(CR(ACCOUNTS.TAX_PAYABLE, tax));
    return lines;
  },

  // Marketing spend (from marketing), tagged with the campaign so CAC is
  // computable by grouping journal lines (Section 6.5).
  CAMPAIGN_CHARGED: (e) => [
    DR(ACCOUNTS.MARKETING_EXPENSE, e.amount, { cost_center: e.cost_center || 'MKTG', campaign_id: e.campaign_id }),
    CR(ACCOUNTS.BANK, e.amount),
  ],

  // Commission is EARNED on booking: expense + liability. Paid later, on
  // collection — so the clawback never has to reach into a person's bank
  // account (Section 6.4, BR-07).
  COMMISSION_EARNED: (e) => [
    DR(ACCOUNTS.SALES_COMMISSION_EXPENSE, e.amount, { cost_center: 'SALES', employee_id: e.employee }),
    CR(ACCOUNTS.COMMISSION_PAYABLE, e.amount, { employee_id: e.employee }),
  ],
  COMMISSION_PAID: (e) => [
    DR(ACCOUNTS.COMMISSION_PAYABLE, e.amount, { employee_id: e.employee }),
    CR(ACCOUNTS.BANK, e.amount),
  ],
  COMMISSION_CLAWED_BACK: (e) => [
    DR(ACCOUNTS.COMMISSION_PAYABLE, e.amount, { employee_id: e.employee }),
    CR(ACCOUNTS.SALES_COMMISSION_EXPENSE, e.amount, { cost_center: 'SALES', employee_id: e.employee }),
  ],

  // Vendor bill approved (after three-way match): expense by cost center +
  // payable (Section 6.6).
  VENDOR_BILL_APPROVED: (e) => [
    DR(e.expense_account || ACCOUNTS.OPERATING_EXPENSE, e.amount, { cost_center: e.cost_center, project_id: e.project_id }),
    CR(ACCOUNTS.ACCOUNTS_PAYABLE, e.amount),
  ],
};

export function buildLines(eventType, event) {
  const rule = POSTING_RULES[eventType];
  if (!rule) throw new Error(`No posting rule for event type: ${eventType}`);
  const lines = rule(event);
  assertBalanced(lines);
  return lines;
}
