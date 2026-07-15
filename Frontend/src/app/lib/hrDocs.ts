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
  .sec { font-size:15px; margin:22px 0 8px; border-bottom:1px solid #ddd; padding-bottom:4px; }
  .clause { margin:12px 0; }
  .clause h3 { font-size:13.5px; margin:0 0 4px; }
  ul { margin:6px 0 6px 18px; } li { margin:2px 0; }
  .accept { margin-top:32px; border-top:1px dashed #999; padding-top:16px; }
  .pagebreak { page-break-before: always; }
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

// Derive a standard Indian CTC breakdown from the monthly cost-to-company, so
// the offer's Annexure A reconciles to the CTC (Basic 46%, HRA 40% of basic,
// Employer PF 12% of the ₹15,000 statutory wage ceiling, Special = balance).
function compStructure(monthlyCtc: number) {
  const basic = Math.round(monthlyCtc * 0.46);
  const employerPf = monthlyCtc > 0 ? Math.round(Math.min(basic, 15000) * 0.12) : 0;
  const hra = Math.round(basic * 0.4);
  const special = Math.max(0, monthlyCtc - basic - hra - employerPf);
  const employeePf = employerPf;
  const profTax = monthlyCtc > 0 ? 200 : 0;
  const grossMonthly = monthlyCtc - employerPf;
  const netBeforeTds = grossMonthly - employeePf - profTax;
  return { basic, hra, special, employerPf, employeePf, profTax, grossMonthly, netBeforeTds };
}

function offer(e: Employee) {
  const monthlyCtc = Number(e.monthly_salary || 0);
  const annualCtc = monthlyCtc * 12;
  const hasSalary = monthlyCtc > 0;
  const c = compStructure(monthlyCtc);
  const first = esc((e.name || "").split(" ")[0] || e.name);

  const annexure = hasSalary ? `
    <div class="pagebreak"></div>
    <h1>Annexure A &mdash; Compensation Structure</h1>
    <p>Annual CTC: <strong>${inr(annualCtc)}</strong> (fixed).</p>
    <table>
      <tr><th>Component</th><th class="right">Annual (₹)</th><th class="right">Monthly (₹)</th></tr>
      <tr><td>Basic Salary</td><td class="right">${inr(c.basic * 12)}</td><td class="right">${inr(c.basic)}</td></tr>
      <tr><td>House Rent Allowance</td><td class="right">${inr(c.hra * 12)}</td><td class="right">${inr(c.hra)}</td></tr>
      <tr><td>Special Allowance</td><td class="right">${inr(c.special * 12)}</td><td class="right">${inr(c.special)}</td></tr>
      <tr><td>Employer Provident Fund</td><td class="right">${inr(c.employerPf * 12)}</td><td class="right">${inr(c.employerPf)}</td></tr>
      <tr><th>Total Cost to Company (CTC)</th><th class="right">${inr(annualCtc)}</th><th class="right">${inr(monthlyCtc)}</th></tr>
    </table>
    <table>
      <tr><th>Statutory Deductions (Employee)</th><th class="right">Monthly (₹)</th></tr>
      <tr><td>Employee Provident Fund</td><td class="right">${inr(c.employeePf)}</td></tr>
      <tr><td>Professional Tax</td><td class="right">${inr(c.profTax)}</td></tr>
    </table>
    <table>
      <tr><th>Estimated Monthly Take-Home (before income tax)</th><th class="right">Amount (₹)</th></tr>
      <tr><td>Gross Monthly Salary</td><td class="right">${inr(c.grossMonthly)}</td></tr>
      <tr><td>Less: Employee PF</td><td class="right">${inr(c.employeePf)}</td></tr>
      <tr><td>Less: Professional Tax</td><td class="right">${inr(c.profTax)}</td></tr>
      <tr><th>Estimated Net Monthly (before TDS)</th><th class="right">${inr(c.netBeforeTds)}</th></tr>
    </table>
    <p class="muted">Income tax (TDS) is deducted as per applicable laws. Employer PF is 12% of the statutory PF wage ceiling. Monthly figures may vary slightly due to statutory adjustments or rounding.</p>` : "";

  return shell(`Offer Letter - ${e.name}`, `
    <div class="row"><span>Date: ${today()}</span><span>Ref: BWX/OFR/${esc(e.employee_code || e.id)}</span></div>
    <p><strong>${esc(e.name)}</strong></p>
    <p><strong>Subject: Offer of Employment &mdash; ${esc(e.role || "—")}</strong></p>
    <p>Dear ${first},</p>
    <p>We are pleased to offer you employment with ${COMPANY.name} (the &ldquo;Company&rdquo;) in the position of <strong>${esc(e.role || "—")}</strong>${e.department ? ` in the ${esc(e.department)} department` : ""}, subject to the terms and conditions set out in this letter.</p>

    <h2 class="sec">Position Details</h2>
    <table>
      <tr><th>Position</th><td>${esc(e.role || "—")}</td></tr>
      ${e.department ? `<tr><th>Department</th><td>${esc(e.department)}</td></tr>` : ""}
      <tr><th>Employee Code</th><td>${esc(e.employee_code || "—")}</td></tr>
      <tr><th>Probation</th><td>3 months</td></tr>
      <tr><th>Date of Joining</th><td>${fmtDate(e.date_of_joining)}</td></tr>
      <tr><th>Work Email</th><td>${esc(e.work_email || "—")}</td></tr>
      ${hasSalary ? `<tr><th>Annual Cost to Company (CTC)</th><td>${inr(annualCtc)} (fixed)</td></tr>` : ""}
    </table>

    <div class="clause"><h3>1. Commencement &amp; Probation</h3><p>Your employment commences on <strong>${fmtDate(e.date_of_joining)}</strong>. You will initially be on probation for three (3) months, during which your performance and suitability will be assessed. On satisfactory completion, your employment will be confirmed in writing.</p></div>
    <div class="clause"><h3>2. Compensation</h3><p>Your Annual Cost to Company is <strong>${hasSalary ? inr(annualCtc) : "as discussed"}</strong>. The detailed structure is set out in Annexure A. Statutory deductions (Provident Fund, Professional Tax, and Income Tax/TDS) apply as per applicable law.</p></div>
    <div class="clause"><h3>3. Working Hours</h3><p>Standard working hours are 9 hours per day across a 5-day work week (Monday&ndash;Friday). The Company may modify shifts or work arrangements based on operational requirements.</p></div>
    <div class="clause"><h3>4. Leave</h3><p>You will be entitled to Casual, Sick, and Earned leave in accordance with Company policy, subject to managerial approval and business requirements.</p></div>
    <div class="clause"><h3>5. Notice Period</h3><p>During probation, either party may terminate on fifteen (15) days&rsquo; written notice. After confirmation, the notice period is sixty (60) days. The Company may relieve you earlier by adjusting salary in lieu of the unserved notice.</p></div>
    <div class="clause"><h3>6. Confidentiality &amp; Intellectual Property</h3><p>You shall maintain strict confidentiality of all Company and client information during and after employment. All work products, inventions, and intellectual property created during employment are the exclusive property of the Company.</p></div>
    <div class="clause"><h3>7. Conflict of Interest &amp; Non-Solicitation</h3><p>You shall not engage in any outside activity that conflicts with the Company&rsquo;s interests without prior written approval, and shall not solicit Company employees or clients for a period of twelve (12) months following separation.</p></div>
    <div class="clause"><h3>8. Background Verification</h3><p>This offer is conditional upon successful verification of your qualifications, employment history, and identity. Providing false or misleading information may result in withdrawal of this offer or termination of employment.</p></div>
    <div class="clause"><h3>9. Governing Law &amp; Offer Validity</h3><p>This offer is governed by the laws of India. It is valid for seven (7) days from the date of issuance, after which the Company reserves the right to withdraw or modify it.</p></div>

    <div class="clause"><h3>Joining Documentation</h3><p>At the time of joining, please submit: Aadhaar &amp; PAN copies; this signed offer; relieving letter / resignation acceptance from your previous employer; last 3 payslips or salary proof; bank account details; two passport-size photographs; address proof; and educational marksheets &amp; certificates (X, XII, Graduation, Post-Graduation).</p></div>

    <div class="sign">
      <p>We look forward to welcoming you to ${COMPANY.short} and wish you a successful career with us.</p>
      <p>Yours sincerely,</p>
      <p><strong>Human Resources</strong><br>${COMPANY.name}</p>
    </div>

    <div class="accept">
      <p><strong>Employee Acceptance</strong></p>
      <p>I, ${esc(e.name)}, accept the above offer and agree to abide by the terms and conditions stated herein.</p>
      <p>Signature: ____________________ &nbsp;&nbsp;&nbsp; Date: ____________________</p>
    </div>
    ${annexure}
    <p class="muted">This is a system-generated document.</p>`);
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
