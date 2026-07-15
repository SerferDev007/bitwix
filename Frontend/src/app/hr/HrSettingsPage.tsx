import { useEffect, useState } from "react";
import { hrApi, type HrSettings } from "../lib/hrApi";
import { useHrAuth } from "./HrRequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, AlertCircle, CheckCircle2, Save, Settings2 } from "lucide-react";

// String-form of the settings so inputs are controlled; blanks map back to null/defaults.
type Form = Record<keyof Omit<HrSettings, "updated_at">, string>;

const EMPTY: Form = {
  signatory_name: "", signatory_designation: "", probation_months: "", notice_probation_days: "",
  notice_confirmed_days: "", work_location: "", work_hours: "", governing_city: "",
  offer_validity_days: "", company_address: "", basic_pct: "", hra_pct: "", pf_rate_pct: "",
  pf_wage_ceiling: "", professional_tax: "", gratuity_pct: "",
};

export function HrSettingsPage() {
  const { can } = useHrAuth();
  const canEdit = can("user.role.assign");
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    hrApi.getSettings()
      .then((r) => {
        if (r.success && r.data) {
          const d = r.data;
          setForm({
            signatory_name: d.signatory_name ?? "",
            signatory_designation: d.signatory_designation ?? "",
            probation_months: d.probation_months?.toString() ?? "",
            notice_probation_days: d.notice_probation_days?.toString() ?? "",
            notice_confirmed_days: d.notice_confirmed_days?.toString() ?? "",
            work_location: d.work_location ?? "",
            work_hours: d.work_hours ?? "",
            governing_city: d.governing_city ?? "",
            offer_validity_days: d.offer_validity_days?.toString() ?? "",
            company_address: d.company_address ?? "",
            basic_pct: d.basic_pct?.toString() ?? "",
            hra_pct: d.hra_pct?.toString() ?? "",
            pf_rate_pct: d.pf_rate_pct?.toString() ?? "",
            pf_wage_ceiling: d.pf_wage_ceiling?.toString() ?? "",
            professional_tax: d.professional_tax?.toString() ?? "",
            gratuity_pct: d.gratuity_pct?.toString() ?? "",
          });
        } else setError(r.message || "Could not load settings.");
      })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null); setSaving(true);
    try {
      const body: Partial<HrSettings> = {
        signatory_name: form.signatory_name.trim() || null,
        signatory_designation: form.signatory_designation.trim() || null,
        probation_months: form.probation_months === "" ? undefined : Number(form.probation_months),
        notice_probation_days: form.notice_probation_days === "" ? undefined : Number(form.notice_probation_days),
        notice_confirmed_days: form.notice_confirmed_days === "" ? undefined : Number(form.notice_confirmed_days),
        work_location: form.work_location.trim() || null,
        work_hours: form.work_hours.trim() || null,
        governing_city: form.governing_city.trim() || null,
        offer_validity_days: form.offer_validity_days === "" ? undefined : Number(form.offer_validity_days),
        company_address: form.company_address.trim() || null,
        basic_pct: form.basic_pct === "" ? undefined : Number(form.basic_pct),
        hra_pct: form.hra_pct === "" ? undefined : Number(form.hra_pct),
        pf_rate_pct: form.pf_rate_pct === "" ? undefined : Number(form.pf_rate_pct),
        pf_wage_ceiling: form.pf_wage_ceiling === "" ? undefined : Number(form.pf_wage_ceiling),
        professional_tax: form.professional_tax === "" ? undefined : Number(form.professional_tax),
        gratuity_pct: form.gratuity_pct === "" ? undefined : Number(form.gratuity_pct),
      };
      const r = await hrApi.updateSettings(body);
      if (r.success) setNotice(r.message || "Settings saved. New documents use these terms.");
      else setError(r.message || "Could not save settings.");
    } catch { setError("Unable to reach the server."); } finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const field = (k: keyof Form, label: string, opts: { type?: string; placeholder?: string; hint?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} type={opts.type || "text"} value={form[k]} onChange={set(k)} placeholder={opts.placeholder} disabled={!canEdit} min={opts.type === "number" ? 0 : undefined} step={opts.type === "number" ? "any" : undefined} />
      {opts.hint && <p className="text-xs text-muted-foreground">{opts.hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings2 className="h-6 w-6" /> Document settings</h1>
        <p className="text-muted-foreground text-sm">These terms populate every generated offer letter (and the signatory block on all letters). Blank fields fall back to sensible defaults.</p>
      </div>

      {!canEdit && <div className="flex items-start gap-2 rounded-md bg-amber-500/10 text-amber-800 p-3 text-sm"><AlertCircle className="h-5 w-5 mt-0.5" /><span>You can view these settings, but only an HR Admin or Super Admin can change them.</span></div>}
      {error && <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm"><AlertCircle className="h-5 w-5 mt-0.5" /><span>{error}</span></div>}
      {notice && <div className="flex items-start gap-2 rounded-md bg-green-500/10 text-green-700 p-3 text-sm"><CheckCircle2 className="h-5 w-5 mt-0.5" /><span>{notice}</span></div>}

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Authorised signatory</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {field("signatory_name", "Name", { placeholder: "e.g. Amruta Shejul", hint: "Leave blank to sign letters as “Human Resources”." })}
            {field("signatory_designation", "Designation", { placeholder: "e.g. Managing Director" })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Offer terms</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {field("probation_months", "Probation (months)", { type: "number", placeholder: "3" })}
            {field("offer_validity_days", "Offer validity (days)", { type: "number", placeholder: "7" })}
            {field("notice_probation_days", "Notice during probation (days)", { type: "number", placeholder: "15" })}
            {field("notice_confirmed_days", "Notice after confirmation (days)", { type: "number", placeholder: "60" })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compensation &amp; deductions</CardTitle>
            <p className="text-sm text-muted-foreground">Drives the offer letter&rsquo;s Annexure&nbsp;A salary breakdown and deductions. Special Allowance is the balancing figure so the components always total the CTC.</p>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {field("basic_pct", "Basic salary (% of CTC)", { type: "number", placeholder: "46" })}
            {field("hra_pct", "HRA (% of Basic)", { type: "number", placeholder: "40" })}
            {field("pf_rate_pct", "Provident Fund rate (%)", { type: "number", placeholder: "12", hint: "Applied to both employer and employee PF." })}
            {field("pf_wage_ceiling", "PF wage ceiling (₹/month)", { type: "number", placeholder: "15000", hint: "PF is charged on Basic up to this cap. Set 0 to charge PF on full Basic." })}
            {field("professional_tax", "Professional Tax (₹/month)", { type: "number", placeholder: "200" })}
            {field("gratuity_pct", "Gratuity (% of Basic)", { type: "number", placeholder: "4.81", hint: "Retiral benefit shown in CTC (not deducted). Set 0 to omit the gratuity line." })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Work &amp; legal</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {field("work_location", "Work location", { placeholder: "Remote / Pune office" })}
            {field("work_hours", "Working hours", { placeholder: "9 hours per day, Mon–Fri" })}
            {field("governing_city", "Governing-law city", { placeholder: "e.g. Nagpur", hint: "Sets the jurisdiction clause; blank ⇒ “courts of competent jurisdiction in India”." })}
            {field("company_address", "Company address", { placeholder: "Shown on the letterhead (optional)" })}
          </CardContent>
        </Card>

        {canEdit && (
          <Button type="submit" disabled={saving} className="flex items-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
          </Button>
        )}
      </form>
    </div>
  );
}
