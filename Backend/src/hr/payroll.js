// Payroll computation (pure). Turns an employee master row into a payroll line
// in integer MINOR UNITS (cents) so the amounts posted to the ledger are exact.
// Cost-center + billable classification decide whether the cost lands in Cost of
// Revenue or Operating Expense downstream (FMS Section 6.3).
export const DEFAULT_TAX_RATE = Number(process.env.PAYROLL_TAX_RATE) || 0.15;

// A rough "does this role deliver client work" heuristic. In a real system this
// is a flag on the employment record, not a string match — but it keeps the demo
// self-contained.
export function isBillableRole(designation = '') {
  return /develop|engineer|consult|qa|tester|designer|architect|analyst/i.test(designation || '');
}

export function payrollLineFor(employee, taxRate = DEFAULT_TAX_RATE) {
  const grossCents = Math.round(Number(employee.monthly_salary || 0) * 100);
  const taxCents = Math.round(grossCents * taxRate);
  const netCents = grossCents - taxCents;
  const billable = isBillableRole(employee.role);
  return {
    employee_id: employee.id,
    employee_name: employee.name,
    grossCents,
    taxCents,
    netCents,
    is_billable_role: billable,
    cost_center: billable ? 'ENG' : 'G&A',
  };
}
