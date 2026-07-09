import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { authApi, authToken } from "../lib/api";
import { Loader2 } from "lucide-react";

// Gate for the admin area: requires a token, and validates it against the
// backend once on mount so a stale/expired token can't slip through.
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<"checking" | "ok" | "denied">(
    authToken.get() ? "checking" : "denied"
  );

  useEffect(() => {
    if (!authToken.get()) {
      setStatus("denied");
      return;
    }
    let active = true;
    authApi.me()
      .then((res) => {
        if (!active) return;
        if (res.success) setStatus("ok");
        else { authToken.clear(); setStatus("denied"); }
      })
      .catch(() => { if (active) setStatus("denied"); });
    return () => { active = false; };
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (status === "denied") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
