// Client-side HR document generator. Builds print-ready HTML letters (offer,
// joining, experience) and payslips from the employee record / actual payroll
// runs, and opens them in a new tab with a "Download / Print PDF" button — no
// server-side PDF dependency.
import type { Employee, Payslip } from "./hrApi";

export type DocType = "offer" | "joining" | "experience";

const COMPANY = {
  name: "Bitwix Technologies Private Limited",
  short: "Bitwix Technologies",
  phone: "+91-8261861224",
  email: "support@bitwix.co.in",
  website: "www.bitwix.co.in",
};

const inr = (n: number | string | null | undefined) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—";
const today = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

function shell(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color:#1a1a1a; line-height:1.65; max-width:820px; margin:0 auto; padding:28px; }
  .bar { text-align:center; margin-bottom:18px; }
  .bar button { background:#030213; color:#fff; border:0; padding:10px 22px; border-radius:6px; font:600 14px system-ui,sans-serif; cursor:pointer; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #030213; padding-bottom:12px; margin-bottom:26px; }
  .logo { font:700 26px system-ui,sans-serif; color:#030213; }
  .cmeta { text-align:right; font-size:12px; color:#555; }
  h1 { font-size:18px; text-align:center; text-transform:uppercase; letter-spacing:1px; margin:22px 0; }
  .row { display:flex; justify-content:space-between; font-size:13px; color:#444; margin-bottom:18px; }
  table { width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; }
  th, td { border:1px solid #cfcfd6; padding:8px 10px; text-align:left; }
  th { background:#f2f2f5; }
  .right { text-align:right; }
  .sign { margin-top:44px; }
  .muted { color:#777; font-size:11px; margin-top:28px; }
  @media print { .bar { display:none; } body { padding:0; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Download / Print PDF</button></div>
<div class="head">
  <div class="logo">${COMPANY.short}</div>
  <div class="cmeta">${COMPANY.name}<br>${COMPANY.phone} &middot; ${COMPANY.email}<br>${COMPANY.website}</div>
</div>
${body}
</body></html>`;
}

function openHtml(html: string): { ok: boolean; message?: string } {
  const w = window.open("", "_blank");
  if (!w) return { ok: false, message: "Pop-up blocked — allow pop-ups for this site to download documents." };
  w.document.open();
  w.document.write(html);
  w.document.close();
  return { ok: true };
}

function offer(e: Employee) {
  const annual = Number(e.monthly_salary || 0) * 12;
  return shell(`Offer Letter - ${e.name}`, `
    <div class="row"><span>Date: ${today()}</span><span>Ref: BWX/OFR/${esc(e.employee_code || e.id)}</span></div>
    <h1>Offer of Employment</h1>
    <p>Dear ${esc(e.name)},</p>
    <p>We are pleased to offer you the position of <strong>${esc(e.role || "—")}</strong>${e.department ? ` in the <strong>${esc(e.department)}</strong> department` : ""} at ${COMPANY.name}. This letter sets out the principal terms of your employment.</p>
    <table>
      <tr><th>Position</th><td>${esc(e.role || "—")}</td></tr>
      ${e.department ? `<tr><th>Department</th><td>${esc(e.department)}</td></tr>` : ""}
      <tr><th>Date of Joining</th><td>${fmtDate(e.date_of_joining)}</td></tr>
      <tr><th>Work Email</th><td>${esc(e.work_email || "—")}</td></tr>
      ${e.monthly_salary != null ? `<tr><th>Annual CTC</th><td>${inr(annual)}</td></tr><tr><th>Monthly Gross</th><td>${inr(e.monthly_salary)}</td></tr>` : ""}
    </table>
    <p>Your employment will be governed by the company's policies as amended from time to time. We look forward to your contributions and wish you a rewarding career with us.</p>
    <div class="sign"><p>Sincerely,</p><p><strong>Human Resources</strong><br>${COMPANY.name}</p></div>
    <p class="muted">This is a system-generated document and does not require a physical signature.</p>`);
}

function joining(e: Employee) {
  return shell(`Joining Letter - ${e.name}`, `
    <div class="row"><span>Date: ${today()}</span><span>Ref: BWX/JN/${esc(e.employee_code || e.id)}</span></div>
    <h1>Joining Letter</h1>
    <p>Dear ${esc(e.name)},</p>
    <p>This is to confirm that you have joined ${COMPANY.name} as <strong>${esc(e.role || "—")}</strong>${e.department ? ` in the ${esc(e.department)} department` : ""}, effective <strong>${fmtDate(e.date_of_joining)}</strong>.</p>
    <table>
      <tr><th>Employee Code</th><td>${esc(e.employee_code || "—")}</td></tr>
      <tr><th>Designation</th><td>${esc(e.role || "—")}</td></tr>
      ${e.department ? `<tr><th>Department</th><td>${esc(e.department)}</td></tr>` : ""}
      <tr><th>Date of Joining</th><td>${fmtDate(e.date_of_joining)}</td></tr>
    </table>
    <p>We warmly welcome you to the team and look forward to a long and mutually rewarding association.</p>
    <div class="sign"><p>Regards,</p><p><strong>Human Resources</strong><br>${COMPANY.name}</p></div>
    <p class="muted">This is a system-generated document.</p>`);
}

function experience(e: Employee) {
  return shell(`Experience Letter - ${e.name}`, `
    <div class="row"><span>Date: ${today()}</span><span>Ref: BWX/EXP/${esc(e.employee_code || e.id)}</span></div>
    <h1>Experience &amp; Relieving Letter</h1>
    <p>To Whomsoever It May Concern,</p>
    <p>This is to certify that <strong>${esc(e.name)}</strong> was employed with ${COMPANY.name} as <strong>${esc(e.role || "—")}</strong>${e.department ? ` in the ${esc(e.department)} department` : ""} from <strong>${fmtDate(e.date_of_joining)}</strong> to <strong>${fmtDate(e.date_of_exit)}</strong>.</p>
    <p>During the tenure with us, ${esc(e.name)} was found to be sincere, diligent, and professional in conduct. We wish ${esc(e.name)} continued success in all future endeavours.</p>
    <div class="sign"><p>For ${COMPANY.name},</p><p><strong>Human Resources</strong></p></div>
    <p class="muted">This is a system-generated document.</p>`);
}

// Payslip built from an ACTUAL approved/posted payroll run. Gross/tax/net are the
// real figures; the earnings split (basic/HRA/special) is presented from gross.
function payslipHtml(e: Employee, run: Payslip) {
  const gross = Number(run.gross);
  const tax = Number(run.tax);
  const net = Number(run.net);
  const basic = Math.round(gross * 0.5);
  const hra = Math.round(gross * 0.2);
  const special = gross - basic - hra;
  return shell(`Payslip - ${e.name} - ${run.label}`, `
    <h1>Payslip &mdash; ${esc(run.label)}</h1>
    <table>
      <tr><th>Employee</th><td>${esc(e.name)}</td><th>Employee Code</th><td>${esc(e.employee_code || "—")}</td></tr>
      <tr><th>Designation</th><td>${esc(e.role || "—")}</td><th>Department</th><td>${esc(e.department || run.cost_center || "—")}</td></tr>
    </table>
    <table>
      <tr><th>Earnings</th><th class="right">Amount</th><th>Deductions</th><th class="right">Amount</th></tr>
      <tr><td>Basic</td><td class="right">${inr(basic)}</td><td>Tax &amp; statutory</td><td class="right">${inr(tax)}</td></tr>
      <tr><td>House Rent Allowance</td><td class="right">${inr(hra)}</td><td>&nbsp;</td><td class="right">&nbsp;</td></tr>
      <tr><td>Special Allowance</td><td class="right">${inr(special)}</td><td>&nbsp;</td><td class="right">&nbsp;</td></tr>
      <tr><th>Gross Earnings</th><th class="right">${inr(gross)}</th><th>Total Deductions</th><th class="right">${inr(tax)}</th></tr>
    </table>
    <table><tr><th>Net Pay</th><td class="right"><strong>${inr(net)}</strong></td></tr></table>
    <p class="muted">Generated from the ${esc(run.status?.toLowerCase() || "approved")} payroll run for ${esc(run.label)}. System-generated payslip.</p>`);
}

// Offer / joining / experience letters (from the employee record).
export function openDocument(type: DocType, e: Employee): { ok: boolean; message?: string } {
  if (type === "experience" && e.hr_status !== "terminated") {
    return { ok: false, message: "An experience letter is only available for offboarded (alumni) employees." };
  }
  const html = type === "offer" ? offer(e) : type === "joining" ? joining(e) : experience(e);
  return openHtml(html);
}

// A payslip from a specific payroll run.
export function openPayslip(e: Employee, run: Payslip): { ok: boolean; message?: string } {
  return openHtml(payslipHtml(e, run));
}
