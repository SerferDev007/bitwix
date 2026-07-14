import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { LayoutDashboard, FolderKanban, Users, DollarSign, Headset, ArrowLeft, LogOut, Landmark, BarChart3 } from "lucide-react";
import { authApi } from "../lib/api";
import { useCurrency, CURRENCIES, type CurrencyCode } from "../lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { SuiteNav } from "../components/SuiteNav";

// The four OR domains from the framework. Only Project Management is built out
// in this iteration; the others are shown as upcoming so the full framework is
// visible in the navigation.
// Primary: the Financial Management system (the double-entry ledger).
const financeNav = [
  { to: "/admin/ledger", label: "Ledger", icon: Landmark },
  { to: "/admin/reports", label: "Financial Reports", icon: BarChart3 },
];

// Secondary: Operations Research decision-analytics. These are modeling tools,
// not the operational systems — relabelled so they no longer collide with the
// Employee Management (HR) and Financial Management (ledger) systems.
const orNav = [
  { to: "/admin/projects", label: "Projects (CPM/PERT/EVM)", icon: FolderKanban },
  { to: "/admin/employees", label: "Assignment & Attrition", icon: Users },
  { to: "/admin/financial", label: "LP / NPV / Break-even", icon: DollarSign },
  { to: "/admin/clients", label: "Queuing & CLV", icon: Headset },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currency, setCurrency } = useCurrency();

  const logout = () => {
    authApi.logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r bg-background flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            <div>
              <p className="font-bold leading-tight">Bitwix Admin</p>
              <p className="text-xs text-muted-foreground">Finance &amp; operations</p>
            </div>
          </div>
        </div>

        <SuiteNav />

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Financial Management</p>
          {financeNav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
          <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Operations Research</p>
          {orNav.map((item) => {
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
          <div className="px-3 py-2">
            <label className="text-xs text-muted-foreground">Currency</label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(CURRENCIES).map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to website
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-x-auto">
        <div className="max-w-6xl mx-auto p-6 md:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
