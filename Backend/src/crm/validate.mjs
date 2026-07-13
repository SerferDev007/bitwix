// CRM dual-plane validation. The most important checks (Section 12.1) assert
// tenant isolation and plane separation. Pure logic, no DB required.
import {
  INTERNAL_ROLES, EXTERNAL_ROLES, internalCan, externalCan,
  scopeFilter, scopeToSql, stripInternalFields, PORTAL_HIDDEN_FIELDS,
} from './rbac.js';
import { signInternalToken, signExternalToken, verifyToken } from './token.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${!cond && extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

// --- The critical property: the external scope is a TERMINAL tenant predicate ---
const extActorA = { plane: 'EXTERNAL', accountId: 4471, role: 'CLIENT_USER' };
const extActorB = { plane: 'EXTERNAL', accountId: 8899, role: 'CLIENT_ADMIN' };
const sA = scopeFilter(extActorA);
check('EXTERNAL scope kind = tenant', sA.kind === 'tenant');
check('EXTERNAL scope bound to session accountId', sA.accountId === 4471);
const sqlA = scopeToSql(sA);
check('EXTERNAL → account_id = ? predicate', sqlA.sql === 'account_id = ?' && sqlA.params[0] === 4471);
check('Two tenants get different predicates (isolation)', scopeToSql(scopeFilter(extActorB)).params[0] === 8899);
check('EXTERNAL predicate has no OR / widening', !/OR/i.test(sqlA.sql));

// --- Plane confusion: token plane is distinct and checkable ---
const staffTok = signInternalToken({ userId: 5, role: 'SALES_REP', tokenVersion: 1 });
const portalTok = signExternalToken({ portalUserId: 9, accountId: 4471, role: 'CLIENT_USER', tokenVersion: 1 });
check('internal token plane = INTERNAL', verifyToken(staffTok).plane === 'INTERNAL');
check('internal token carries NO account claim', verifyToken(staffTok).acc === undefined);
check('external token plane = EXTERNAL', verifyToken(portalTok).plane === 'EXTERNAL');
check('external token carries acc binding', verifyToken(portalTok).acc === 4471);
check('tampered token rejected', verifyToken(portalTok.slice(0, -2) + 'zz') === null);

// --- Internal matrix callouts (Table 6) ---
check('SUPER_ADMIN cannot approve discount (SoD)', !internalCan('SUPER_ADMIN', 'discount.approve'));
check('Only SALES_MANAGER approves discount', internalCan('SALES_MANAGER', 'discount.approve') && !internalCan('SALES_REP', 'discount.approve'));
check('consent.override granted to NOBODY', INTERNAL_ROLES.every((r) => !internalCan(r, 'consent.override')));
check('SUPPORT_AGENT has no commercial write', !internalCan('SUPPORT_AGENT', 'quote.create') && !internalCan('SUPPORT_AGENT', 'opportunity.manage'));
check('SUPPORT_AGENT can resolve tickets', internalCan('SUPPORT_AGENT', 'ticket.resolve'));
check('MARKETING_EXEC cannot send without... has campaign.send', internalCan('MARKETING_EXEC', 'campaign.send'));
check('SALES_REP cannot manage contracts', !internalCan('SALES_REP', 'contract.manage'));

// --- External matrix (Table 7) — every entry is account-bounded ---
check('CLIENT_FINANCE sees invoices', externalCan('CLIENT_FINANCE', 'invoice.read'));
check('CLIENT_FINANCE has NO ticket access', !externalCan('CLIENT_FINANCE', 'ticket.create') && !externalCan('CLIENT_FINANCE', 'ticket.read.self'));
check('CLIENT_USER cannot read account-wide tickets', !externalCan('CLIENT_USER', 'ticket.read.account'));
check('CLIENT_ADMIN can read account-wide tickets', externalCan('CLIENT_ADMIN', 'ticket.read.account'));
check('CLIENT_USER cannot request portal users', !externalCan('CLIENT_USER', 'portal.user.request'));
check('CLIENT_ADMIN can request portal users', externalCan('CLIENT_ADMIN', 'portal.user.request'));
check('No external role can read internal-only perms', EXTERNAL_ROLES.every((r) => !externalCan(r, 'forecast.read') && !externalCan(r, 'health.read')));

// --- Internal scoping fails closed ---
check('SALES_REP scope = owner', scopeFilter({ plane: 'INTERNAL', role: 'SALES_REP', userId: 3 }).kind === 'owner');
check('SUPER_ADMIN scope = all', scopeFilter({ plane: 'INTERNAL', role: 'SUPER_ADMIN' }).kind === 'all');
check('unknown internal role → none (deny)', scopeToSql(scopeFilter({ plane: 'INTERNAL', role: 'GHOST' })).sql === '1=0');
check('empty territory → no rows', scopeToSql({ kind: 'territory', territories: [] }).sql === '1=0');

// --- Portal must never see internal fields ---
const acct = { id: 1, name: 'Acme', health_score: 38, owner_id: 5, account_manager_id: 9, lost_reason: 'price', segment: 'ENTERPRISE' };
const portalView = stripInternalFields(acct);
check('portal view strips health_score', !('health_score' in portalView));
check('portal view strips owner/AM/lost_reason', PORTAL_HIDDEN_FIELDS.every((f) => !(f in portalView)));
check('portal view keeps allowed fields', portalView.name === 'Acme' && portalView.segment === 'ENTERPRISE');

console.log(failures === 0 ? '\n🎯 All CRM dual-plane checks passed.' : `\n❌ ${failures} CRM check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
