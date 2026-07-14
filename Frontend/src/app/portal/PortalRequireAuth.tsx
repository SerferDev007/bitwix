import { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { portalApi, portalToken, type PortalResult } from "./portalApi";
import { Loader2 } from "lucide-react";

interface PortalCtx {
  account: PortalResult["account"];
  role: string;
  permissions: string[];
  can: (p: string) => boolean;
}
const Ctx = createContext<PortalCtx | null>(null);
export const usePortal = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePortal must be used within the portal");
  return c;
};

export function PortalRequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "denied">(portalToken.get() ? "checking" : "denied");
  const [ctx, setCtx] = useState<PortalCtx | null>(null);

  useEffect(() => {
    if (!portalToken.get()) { setStatus("denied"); return; }
    let active = true;
    portalApi.me()
      .then((res) => {
        if (!active) return;
        if (res.success) {
          const permissions = res.permissions || [];
          setCtx({
            account: res.account,
            role: res.actor?.role || "",
            permissions,
            can: (p: string) => permissions.includes(p),
          });
          setStatus("ok");
        } else { portalToken.clear(); setStatus("denied"); }
      })
      .catch(() => active && setStatus("denied"));
    return () => { active = false; };
  }, []);

  if (status === "checking") return <div className="min-h-screen flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (status === "denied" || !ctx) return <Navigate to="/portal/login" replace />;
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}
