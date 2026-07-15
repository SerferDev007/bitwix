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

function shell(title: string, body: string, addr?: string) {
  const addrLine = addr ? `<br>${esc(addr)}` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  /* Typography mirrors the reference letter: Calibri body, Calibri Bold for
     headings/labels, Arial for the footer/contact block, Courier New for
     signature placeholders. Carlito is a metric-compatible Calibri fallback. */
  :root {
    --calibri: Calibri, Carlito, 'Segoe UI', Candara, sans-serif;
    --arial: ArialMT, Arial, 'Helvetica Neue', Helvetica, sans-serif;
    --courier: 'Courier New', Courier, monospace;
  }
  @page { size: A4; margin: 18mm; }
  body { font-family: var(--calibri); font-size:11pt; color:#1a1a1a; line-height:1.5; max-width:820px; margin:0 auto; padding:28px; }
  .bar { text-align:center; margin-bottom:18px; }
  .bar button { background:#030213; color:#fff; border:0; padding:10px 22px; border-radius:6px; font:600 14px system-ui,sans-serif; cursor:pointer; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #030213; padding-bottom:12px; margin-bottom:26px; }
  .logo { font-family: var(--calibri); font-weight:700; font-size:22pt; color:#030213; }
  .cmeta { text-align:right; font-family: var(--arial); font-size:10pt; color:#555; }
  h1 { font-family: var(--calibri); font-weight:700; font-size:15pt; text-align:center; text-transform:uppercase; letter-spacing:1px; margin:20px 0; }
  .row { display:flex; justify-content:space-between; font-size:10.5pt; color:#444; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; margin:14px 0; font-size:10.5pt; }
  th, td { border:1px solid #cfcfd6; padding:7px 10px; text-align:left; }
  th { background:#f2f2f5; font-weight:700; }
  .right { text-align:right; }
  .sign { margin-top:40px; }
  .muted { font-family: var(--arial); color:#777; font-size:9pt; margin-top:26px; }
  .sec { font-weight:700; font-size:13pt; margin:22px 0 8px; border-bottom:1px solid #ddd; padding-bottom:4px; }
  .clause { margin:12px 0; }
  .clause h3 { font-weight:700; font-size:11.5pt; margin:0 0 4px; }
  ul { margin:6px 0 6px 18px; } li { margin:2px 0; }
  .accept { margin-top:30px; border-top:1px dashed #999; padding-top:16px; }
  .mono { font-family: var(--courier); font-size:10.5pt; }
  .pagebreak { page-break-before: always; }
  @media print { .bar { display:none; } body { padding:0; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Download / Print PDF</button></div>
<div class="head">
  <div class="logo">${COMPANY.short}</div>
  <div class="cmeta">${COMPANY.name}<br>${COMPANY.phone} &middot; ${COMPANY.email}<br>${COMPANY.website}${addrLine}</div>
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

// Company document settings — configurable per-company defaults that HR admins
// edit at /hr/settings; drive the offer letter terms and the signatory block.
export interface DocSettings {
  signatory_name?: string | null;
  signatory_designation?: string | null;
  probation_months?: number | null;
  notice_probation_days?: number | null;
  notice_confirmed_days?: number | null;
  work_location?: string | null;
  work_hours?: string | null;
  governing_city?: string | null;
  offer_validity_days?: number | null;
  company_address?: string | null;
  basic_pct?: number | null;
  hra_pct?: number | null;
  pf_rate_pct?: number | null;
  pf_wage_ceiling?: number | null;
  professional_tax?: number | null;
  gratuity_pct?: number | null;
}

const DOC_DEFAULTS = {
  probation_months: 3,
  notice_probation_days: 15,
  notice_confirmed_days: 60,
  work_location: "As per Company policy",
  work_hours: "9 hours per day, Monday to Friday (5-day work week)",
  governing_city: "",
  offer_validity_days: 7,
  basic_pct: 46,
  hra_pct: 40,
  pf_rate_pct: 12,
  pf_wage_ceiling: 15000,
  professional_tax: 200,
  gratuity_pct: 4.81,
};

// Fill blanks/nulls with defaults so a partially-configured (or absent) settings
// record still renders a complete letter.
function resolve(s?: DocSettings | null) {
  const v = s || {};
  return {
    signatory_name: v.signatory_name || "",
    signatory_designation: v.signatory_designation || "",
    company_address: v.company_address || "",
    probation_months: v.probation_months ?? DOC_DEFAULTS.probation_months,
    notice_probation_days: v.notice_probation_days ?? DOC_DEFAULTS.notice_probation_days,
    notice_confirmed_days: v.notice_confirmed_days ?? DOC_DEFAULTS.notice_confirmed_days,
    work_location: v.work_location || DOC_DEFAULTS.work_location,
    work_hours: v.work_hours || DOC_DEFAULTS.work_hours,
    governing_city: v.governing_city || DOC_DEFAULTS.governing_city,
    offer_validity_days: v.offer_validity_days ?? DOC_DEFAULTS.offer_validity_days,
    basic_pct: v.basic_pct ?? DOC_DEFAULTS.basic_pct,
    hra_pct: v.hra_pct ?? DOC_DEFAULTS.hra_pct,
    pf_rate_pct: Number(v.pf_rate_pct ?? DOC_DEFAULTS.pf_rate_pct),
    pf_wage_ceiling: Number(v.pf_wage_ceiling ?? DOC_DEFAULTS.pf_wage_ceiling),
    professional_tax: Number(v.professional_tax ?? DOC_DEFAULTS.professional_tax),
    gratuity_pct: Number(v.gratuity_pct ?? DOC_DEFAULTS.gratuity_pct),
  };
}
type ResolvedSettings = ReturnType<typeof resolve>;

// The signatory line — a named authorised signatory when configured, else HR.
function signatoryWho(S: ResolvedSettings) {
  return S.signatory_name
    ? `<strong>${esc(S.signatory_name)}</strong><br>${esc(S.signatory_designation || "Authorised Signatory")}<br>${COMPANY.name}`
    : `<strong>Human Resources</strong><br>${COMPANY.name}`;
}

// Derive a CTC breakdown from the monthly cost-to-company. The split and the
// deductions are configurable (defaults: Basic 46% of CTC, HRA 40% of Basic,
// PF 12% of the ₹15,000 wage ceiling, Professional Tax ₹200, Gratuity 4.81% of
// Basic); Special Allowance is the balancing figure so components total the CTC.
// Employer PF and Gratuity are retiral costs (part of CTC, not paid in cash), so
// monthly gross = Basic + HRA + Special. A pf_wage_ceiling of 0 ⇒ PF on full
// Basic; a gratuity_pct of 0 ⇒ no gratuity line.
type CompOpts = Pick<ResolvedSettings, "basic_pct" | "hra_pct" | "pf_rate_pct" | "pf_wage_ceiling" | "professional_tax" | "gratuity_pct">;
function compStructure(monthlyCtc: number, o: CompOpts) {
  const basic = Math.round(monthlyCtc * (o.basic_pct / 100));
  const pfBase = o.pf_wage_ceiling > 0 ? Math.min(basic, o.pf_wage_ceiling) : basic;
  const employerPf = monthlyCtc > 0 ? Math.round(pfBase * (o.pf_rate_pct / 100)) : 0;
  const hra = Math.round(basic * (o.hra_pct / 100));
  const gratuity = monthlyCtc > 0 ? Math.round(basic * (o.gratuity_pct / 100)) : 0;
  const special = Math.max(0, monthlyCtc - basic - hra - employerPf - gratuity);
  const employeePf = employerPf;
  const profTax = monthlyCtc > 0 ? o.professional_tax : 0;
  const grossMonthly = basic + hra + special; // cash components (retirals excluded)
  const netBeforeTds = grossMonthly - employeePf - profTax;
  const totalPf = employerPf + employeePf;
  return { basic, hra, special, employerPf, employeePf, gratuity, profTax, grossMonthly, netBeforeTds, totalPf };
}

function offer(e: Employee, settings?: DocSettings | null) {
  const S = resolve(settings);
  const monthlyCtc = Number(e.monthly_salary || 0);
  const annualCtc = monthlyCtc * 12;
  const hasSalary = monthlyCtc > 0;
  const c = compStructure(monthlyCtc, S);
  const first = esc((e.name || "").split(" ")[0] || e.name);
  const pfNote = (S.pf_wage_ceiling > 0
    ? `Employer PF is ${S.pf_rate_pct}% of Basic, capped at the ₹${S.pf_wage_ceiling.toLocaleString("en-IN")} statutory wage ceiling.`
    : `Employer PF is ${S.pf_rate_pct}% of Basic salary.`)
    + (S.gratuity_pct > 0 ? ` Gratuity (${S.gratuity_pct}% of Basic) is a retiral benefit — an employer cost included in CTC, not deducted from your salary.` : "");
  const jurisdiction = S.governing_city
    ? `the courts at ${esc(S.governing_city)} shall have exclusive jurisdiction`
    : `the courts of competent jurisdiction in India shall have jurisdiction`;

  const annexure = hasSalary ? `
    <div class="pagebreak"></div>
    <h1>Annexure A &mdash; Compensation Structure</h1>
    <p>Annual CTC: <strong>${inr(annualCtc)}</strong> (fixed).</p>
    <table>
      <tr><th>Component</th><th class="right">Annual (₹)</th><th class="right">Monthly (₹)</th></tr>
      <tr><td>Basic Salary</td><td class="right">${inr(c.basic * 12)}</td><td class="right">${inr(c.basic)}</td></tr>
      <tr><td>House Rent Allowance</td><td class="right">${inr(c.hra * 12)}</td><td class="right">${inr(c.hra)}</td></tr>
      <tr><td>Special Allowance</td><td class="right">${inr(c.special * 12)}</td><td class="right">${inr(c.special)}</td></tr>
      <tr><td>Employer Provident Fund (retiral)</td><td class="right">${inr(c.employerPf * 12)}</td><td class="right">${inr(c.employerPf)}</td></tr>
      ${c.gratuity > 0 ? `<tr><td>Gratuity (retiral)</td><td class="right">${inr(c.gratuity * 12)}</td><td class="right">${inr(c.gratuity)}</td></tr>` : ""}
      <tr><th>Total Cost to Company (CTC)</th><th class="right">${inr(annualCtc)}</th><th class="right">${inr(monthlyCtc)}</th></tr>
    </table>
    <table>
      <tr><th>Statutory Deductions (Employee)</th><th class="right">Monthly (₹)</th></tr>
      <tr><td>Employee Provident Fund</td><td class="right">${inr(c.employeePf)}</td></tr>
      <tr><td>Professional Tax</td><td class="right">${inr(c.profTax)}</td></tr>
    </table>
    <table>
      <tr><th>Provident Fund Summary</th><th class="right">Monthly (₹)</th><th class="right">Annual (₹)</th></tr>
      <tr><td>Employee contribution</td><td class="right">${inr(c.employeePf)}</td><td class="right">${inr(c.employeePf * 12)}</td></tr>
      <tr><td>Employer contribution</td><td class="right">${inr(c.employerPf)}</td><td class="right">${inr(c.employerPf * 12)}</td></tr>
      <tr><th>Total credited to your EPF account</th><th class="right">${inr(c.totalPf)}</th><th class="right">${inr(c.totalPf * 12)}</th></tr>
    </table>
    <table>
      <tr><th>Estimated Monthly Take-Home (before income tax)</th><th class="right">Amount (₹)</th></tr>
      <tr><td>Gross Monthly Salary</td><td class="right">${inr(c.grossMonthly)}</td></tr>
      <tr><td>Less: Employee PF</td><td class="right">${inr(c.employeePf)}</td></tr>
      <tr><td>Less: Professional Tax</td><td class="right">${inr(c.profTax)}</td></tr>
      <tr><th>Estimated Net Monthly (before TDS)</th><th class="right">${inr(c.netBeforeTds)}</th></tr>
    </table>
    <p class="muted">Income tax (TDS) is deducted as per applicable laws. ${pfNote} Monthly figures may vary slightly due to statutory adjustments or rounding.</p>` : "";

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
      <tr><th>Probation</th><td>${S.probation_months} months</td></tr>
      <tr><th>Work Location</th><td>${esc(S.work_location)}</td></tr>
      <tr><th>Date of Joining</th><td>${fmtDate(e.date_of_joining)}</td></tr>
      <tr><th>Work Email</th><td>${esc(e.work_email || "—")}</td></tr>
      ${hasSalary ? `<tr><th>Annual Cost to Company (CTC)</th><td>${inr(annualCtc)} (fixed)</td></tr>` : ""}
    </table>

    <div class="clause"><h3>1. Commencement &amp; Probation</h3><p>Your employment commences on <strong>${fmtDate(e.date_of_joining)}</strong>. You will initially be on probation for ${S.probation_months} month${S.probation_months === 1 ? "" : "s"}, during which your performance and suitability will be assessed. On satisfactory completion, your employment will be confirmed in writing.</p></div>
    <div class="clause"><h3>2. Compensation</h3><p>Your Annual Cost to Company is <strong>${hasSalary ? inr(annualCtc) : "as discussed"}</strong>. The detailed structure is set out in Annexure A. Statutory deductions (Provident Fund, Professional Tax, and Income Tax/TDS) apply as per applicable law.</p></div>
    <div class="clause"><h3>3. Working Hours &amp; Location</h3><p>Your work location is <strong>${esc(S.work_location)}</strong>. Standard working hours are ${esc(S.work_hours)}. The Company may modify shifts or work arrangements based on operational requirements.</p></div>
    <div class="clause"><h3>4. Leave</h3><p>You will be entitled to Casual, Sick, and Earned leave in accordance with Company policy, subject to managerial approval and business requirements.</p></div>
    <div class="clause"><h3>5. Notice Period</h3><p>During probation, either party may terminate on ${S.notice_probation_days} days&rsquo; written notice. After confirmation, the notice period is ${S.notice_confirmed_days} days. The Company may relieve you earlier by adjusting salary in lieu of the unserved notice.</p></div>
    <div class="clause"><h3>6. Confidentiality &amp; Intellectual Property</h3><p>You shall maintain strict confidentiality of all Company and client information during and after employment. All work products, inventions, and intellectual property created during employment are the exclusive property of the Company.</p></div>
    <div class="clause"><h3>7. Conflict of Interest &amp; Non-Solicitation</h3><p>You shall not engage in any outside activity that conflicts with the Company&rsquo;s interests without prior written approval, and shall not solicit Company employees or clients for a period of twelve (12) months following separation.</p></div>
    <div class="clause"><h3>8. Background Verification</h3><p>This offer is conditional upon successful verification of your qualifications, employment history, and identity. Providing false or misleading information may result in withdrawal of this offer or termination of employment.</p></div>
    <div class="clause"><h3>9. Governing Law &amp; Offer Validity</h3><p>This offer is governed by the laws of India and ${jurisdiction}. It is valid for ${S.offer_validity_days} days from the date of issuance, after which the Company reserves the right to withdraw or modify it.</p></div>

    <div class="clause"><h3>Joining Documentation</h3><p>At the time of joining, please submit: Aadhaar &amp; PAN copies; this signed offer; relieving letter / resignation acceptance from your previous employer; last 3 payslips or salary proof; bank account details; two passport-size photographs; address proof; and educational marksheets &amp; certificates (X, XII, Graduation, Post-Graduation).</p></div>

    <div class="sign">
      <p>We look forward to welcoming you to ${COMPANY.short} and wish you a successful career with us.</p>
      <p>Yours sincerely,</p>
      <p>${signatoryWho(S)}</p>
    </div>

    <div class="accept">
      <p><strong>Employee Acceptance</strong></p>
      <p>I, ${esc(e.name)}, accept the above offer and agree to abide by the terms and conditions stated herein.</p>
      <p class="mono">Signature: ____________________ &nbsp;&nbsp;&nbsp; Date: ____________________</p>
    </div>
    ${annexure}
    <p class="muted">This is a system-generated document.</p>`, S.company_address);
}

function joining(e: Employee, settings?: DocSettings | null) {
  const S = resolve(settings);
  return shell(`Joining Letter - ${e.name}`, `
    <div class="row"><span>Date: ${today()}</span><span>Ref: BWX/JN/${esc(e.employee_code || e.id)}</span></div>
    <h1>Joining Letter</h1>
    <p>Dear ${esc(e.name)},</p>
    <p>This is to confirm that you have joined ${COMPANY.name} as <strong>${esc(e.role || "—")}</strong>${e.department ? ` in the ${esc(e.department)} department` : ""}, effective <strong>${fmtDate(e.date_of_joining)}</strong>.</p>
    <table>
      <tr><th>Employee Code</th><td>${esc(e.employee_code || "—")}</td></tr>
      <tr><th>Designation</th><td>${esc(e.role || "—")}</td></tr>
      ${e.department ? `<tr><th>Department</th><td>${esc(e.department)}</td></tr>` : ""}
      <tr><th>Work Location</th><td>${esc(S.work_location)}</td></tr>
      <tr><th>Date of Joining</th><td>${fmtDate(e.date_of_joining)}</td></tr>
    </table>
    <p>We warmly welcome you to the team and look forward to a long and mutually rewarding association.</p>
    <div class="sign"><p>Regards,</p><p>${signatoryWho(S)}</p></div>
    <p class="muted">This is a system-generated document.</p>`, S.company_address);
}

function experience(e: Employee, settings?: DocSettings | null) {
  const S = resolve(settings);
  const who = S.signatory_name
    ? `<strong>${esc(S.signatory_name)}</strong><br>${esc(S.signatory_designation || "Authorised Signatory")}`
    : `<strong>Human Resources</strong>`;
  return shell(`Experience Letter - ${e.name}`, `
    <div class="row"><span>Date: ${today()}</span><span>Ref: BWX/EXP/${esc(e.employee_code || e.id)}</span></div>
    <h1>Experience &amp; Relieving Letter</h1>
    <p>To Whomsoever It May Concern,</p>
    <p>This is to certify that <strong>${esc(e.name)}</strong> was employed with ${COMPANY.name} as <strong>${esc(e.role || "—")}</strong>${e.department ? ` in the ${esc(e.department)} department` : ""} from <strong>${fmtDate(e.date_of_joining)}</strong> to <strong>${fmtDate(e.date_of_exit)}</strong>.</p>
    <p>During the tenure with us, ${esc(e.name)} was found to be sincere, diligent, and professional in conduct. We wish ${esc(e.name)} continued success in all future endeavours.</p>
    <div class="sign"><p>For ${COMPANY.name},</p><p>${who}</p></div>
    <p class="muted">This is a system-generated document.</p>`, S.company_address);
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

// Offer / joining / experience letters (from the employee record + company settings).
export function openDocument(type: DocType, e: Employee, settings?: DocSettings | null): { ok: boolean; message?: string } {
  if (type === "experience" && e.hr_status !== "terminated") {
    return { ok: false, message: "An experience letter is only available for offboarded (alumni) employees." };
  }
  const html = type === "offer" ? offer(e, settings) : type === "joining" ? joining(e, settings) : experience(e, settings);
  return openHtml(html);
}

// A payslip from a specific payroll run.
export function openPayslip(e: Employee, run: Payslip): { ok: boolean; message?: string } {
  return openHtml(payslipHtml(e, run));
}
