// Chart of accounts — the classification every journal line hangs off (Section
// 5.1). `normal_side` is the side that INCREASES the account, which is how the
// system knows whether a debit raises or lowers a balance.
export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

// The side that increases each account type.
export const NORMAL_SIDE = { ASSET: 'DR', EXPENSE: 'DR', LIABILITY: 'CR', EQUITY: 'CR', REVENUE: 'CR' };

// The seeded chart. Codes are stable; posting rules reference them via ACCOUNTS.
export const CHART = [
  { code: '1000', name: 'Bank', type: 'ASSET' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
  { code: '2000', name: 'Deferred Revenue', type: 'LIABILITY' },
  { code: '2100', name: 'Net Pay Payable', type: 'LIABILITY' },
  { code: '2200', name: 'Tax Payable', type: 'LIABILITY' },
  { code: '2300', name: 'Commission Payable', type: 'LIABILITY' },
  { code: '2400', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '3000', name: 'Retained Earnings', type: 'EQUITY' },
  { code: '4000', name: 'Revenue', type: 'REVENUE' },
  { code: '5000', name: 'Cost of Revenue', type: 'EXPENSE' },
  { code: '5100', name: 'Operating Expense', type: 'EXPENSE' },
  { code: '5200', name: 'Sales Commission Expense', type: 'EXPENSE' },
  { code: '5300', name: 'Marketing Expense', type: 'EXPENSE' },
];

// Semantic names so posting rules never hard-code raw codes.
export const ACCOUNTS = {
  BANK: '1000',
  ACCOUNTS_RECEIVABLE: '1100',
  DEFERRED_REVENUE: '2000',
  NET_PAY_PAYABLE: '2100',
  TAX_PAYABLE: '2200',
  COMMISSION_PAYABLE: '2300',
  ACCOUNTS_PAYABLE: '2400',
  RETAINED_EARNINGS: '3000',
  REVENUE: '4000',
  COST_OF_REVENUE: '5000',
  OPERATING_EXPENSE: '5100',
  SALES_COMMISSION_EXPENSE: '5200',
  MARKETING_EXPENSE: '5300',
};

// Which side (DR/CR) represents the natural, positive balance of an account —
// used when presenting a trial balance or a statement.
export function naturalBalance(type, debits, credits) {
  return NORMAL_SIDE[type] === 'DR' ? debits - credits : credits - debits;
}
