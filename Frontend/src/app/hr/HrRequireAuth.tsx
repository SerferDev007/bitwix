import { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { hrApi, hrToken, type HrUser } from "../lib/hrApi";
import { Loader2 } from "lucide-react";

interface HrAuth {
  user: HrUser;
  permissions: string[];
  can: (permission: string) => boolean;
}

const HrAuthContext = createContext<HrAuth | null>(null);

// Effective identity + permissions for the HR console. Pages read this to
// show/hide actions — the backend still enforces every permission server-side.
export function useHrAuth(): HrAuth {
  const ctx = useContext(HrAuthContext);
  if (!ctx) throw new Error("useHrAuth must be used inside HrRequireAuth");
  return ctx;
}

export function HrRequireAuth({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ status: "checking" | "ok" | "denied"; auth?: HrAuth }>(
    { status: hrToken.get() ? "checking" : "denied" }
  );

  useEffect(() => {
    if (!hrToken.get()) { setState({ status: "denied" }); return; }
    let active = true;
    hrApi.me()
      .then((res) => {
        if (!active) return;
        if (res.success && res.user) {
          const permissions = res.permissions || [];
          setState({
            status: "ok",
            auth: { user: res.user, permissions, can: (p) => permissions.includes(p) },
          });
        } else {
          hrToken.clear();
          setState({ status: "denied" });
        }
      })
      .catch(() => { if (active) setState({ status: "denied" }); });
    return () => { active = false; };
  }, []);

  if (state.status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (state.status === "denied" || !state.auth) return <Navigate to="/hr/login" replace />;
  return <HrAuthContext.Provider value={state.auth}>{children}</HrAuthContext.Provider>;
}
