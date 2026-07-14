import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { crmApi, crmToken } from "../lib/crmApi";
import { Loader2 } from "lucide-react";

export function CrmRequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "denied">(crmToken.get() ? "checking" : "denied");

  useEffect(() => {
    if (!crmToken.get()) { setStatus("denied"); return; }
    let active = true;
    crmApi.me()
      .then((res) => { if (active) { if (res.success) setStatus("ok"); else { crmToken.clear(); setStatus("denied"); } } })
      .catch(() => active && setStatus("denied"));
    return () => { active = false; };
  }, []);

  if (status === "checking") return <div className="min-h-screen flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (status === "denied") return <Navigate to="/crm/login" replace />;
  return <>{children}</>;
}
