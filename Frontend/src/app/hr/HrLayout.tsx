import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { Users2, CalendarDays, ScrollText, LogOut, ArrowLeft, IdCard, Banknote, FileText, Settings2 } from "lucide-react";
import { hrApi } from "../lib/hrApi";
import { useHrAuth } from "./HrRequireAuth";
import { SuiteNav } from "../components/SuiteNav";

export function HrLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, can } = useHrAuth();

  const logout = async () => { await hrApi.logout(); navigate("/hr/login", { replace: true }); };

  const nav = [
    { to: "/hr/employees", label: "Employees", icon: Users2, show: true },
    { to: "/hr/leave", label: "Leave", icon: CalendarDays, show: true },
    { to: "/hr/my-documents", label: "My documents", icon: FileText, show: true },
    { to: "/hr/payroll", label: "Payroll", icon: Banknote, show: can("payroll.run") || can("payroll.read.all") },
    { to: "/hr/settings", label: "Document settings", icon: Settings2, show: can("user.role.assign") },
    { to: "/hr/audit", label: "Audit log", icon: ScrollText, show: can("audit.read") },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 flex-shrink-0 border-r bg-background flex flex-col">
        <div className="p-6 border-b flex items-center gap-2">
          <IdCard className="h-6 w-6 text-primary" />
          <div>
            <p className="font-bold leading-tight">Bitwix People</p>
            <p className="text-xs text-muted-foreground">Employee management</p>
          </div>
        </div>
        <SuiteNav />
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-1">
          <p className="px-3 pb-1 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.role}</span>
          </p>
          <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">
            <ArrowLeft className="h-4 w-4" /> Website
          </Link>
          <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto"><div className="max-w-6xl mx-auto p-6 md:p-10"><Outlet /></div></main>
    </div>
  );
}
