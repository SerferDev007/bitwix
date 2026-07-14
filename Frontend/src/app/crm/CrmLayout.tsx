import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { Building2, Users2, GitBranch, TrendingUp, Ticket, LogOut, ArrowLeft, Filter, FileSignature } from "lucide-react";
import { crmApi } from "../lib/crmApi";

const nav = [
  { to: "/crm/accounts", label: "Accounts", icon: Users2 },
  { to: "/crm/leads", label: "Leads", icon: Filter },
  { to: "/crm/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/crm/quotes", label: "Quotes", icon: FileSignature },
  { to: "/crm/forecast", label: "Forecast", icon: TrendingUp },
  { to: "/crm/tickets", label: "Tickets", icon: Ticket },
];

export function CrmLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = () => { crmApi.logout(); navigate("/crm/login", { replace: true }); };

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 flex-shrink-0 border-r bg-background flex flex-col">
        <div className="p-6 border-b flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <div><p className="font-bold leading-tight">Bitwix CRM</p><p className="text-xs text-muted-foreground">Staff console</p></div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-1">
          <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /> Website</Link>
          <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"><LogOut className="h-4 w-4" /> Log out</button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto"><div className="max-w-6xl mx-auto p-6 md:p-10"><Outlet /></div></main>
    </div>
  );
}
