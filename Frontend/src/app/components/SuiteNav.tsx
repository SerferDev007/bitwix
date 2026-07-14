import { Link, useLocation } from "react-router";
import { IdCard, Building2, Landmark } from "lucide-react";

// The three interlinked systems. Rendered at the top of every console sidebar so
// you can jump between Employee Management, CRM, and Financial Management from
// anywhere. Each has its own login plane, so following a link lands on that
// system (or its sign-in if you're not authenticated there yet).
const SUITE = [
  { key: "hr", to: "/hr", label: "Employee", icon: IdCard, match: "/hr" },
  { key: "crm", to: "/crm", label: "CRM", icon: Building2, match: "/crm" },
  { key: "fms", to: "/admin", label: "Financial", icon: Landmark, match: "/admin" },
];

export function SuiteNav() {
  const { pathname } = useLocation();
  return (
    <div className="px-3 py-3 border-b bg-muted/30">
      <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bitwix Suite</p>
      <div className="grid grid-cols-3 gap-1">
        {SUITE.map((s) => {
          const Icon = s.icon;
          const active = pathname.startsWith(s.match);
          return (
            <Link
              key={s.key}
              to={s.to}
              title={`${s.label} Management`}
              className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] text-center transition-colors ${
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="leading-tight">{s.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
