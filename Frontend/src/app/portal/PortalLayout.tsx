import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { LayoutGrid, Ticket, FileText, Bell, UserPlus, LogOut } from "lucide-react";
import { portalApi } from "./portalApi";
import { usePortal } from "./PortalRequireAuth";

export function PortalLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { account, can } = usePortal();
  const logout = () => { portalApi.logout(); navigate("/portal/login", { replace: true }); };

  // Nav adapts to the portal user's permissions (role-differentiated view).
  const nav = [
    { to: "/portal/overview", label: "Overview", icon: LayoutGrid, show: true },
    { to: "/portal/tickets", label: "Support", icon: Ticket, show: can("ticket.create") || can("ticket.read.self") },
    { to: "/portal/invoices", label: "Invoices", icon: FileText, show: can("invoice.read") },
    { to: "/portal/consent", label: "Preferences", icon: Bell, show: can("consent.manage.self") },
    { to: "/portal/users", label: "Users", icon: UserPlus, show: can("portal.user.request") },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-primary text-primary-foreground">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="font-bold">{account?.name || "Client Portal"}</p>
            <p className="text-xs opacity-80">Bitwix Client Portal</p>
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-sm opacity-90 hover:opacity-100">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 whitespace-nowrap ${active ? "border-primary-foreground font-medium" : "border-transparent opacity-80 hover:opacity-100"}`}>
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto p-4 md:p-8"><Outlet /></main>
    </div>
  );
}
