import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { LayoutDashboard, FolderKanban, Users, DollarSign, Headset, ArrowLeft, LogOut } from "lucide-react";
import { authApi } from "../lib/api";

// The four OR domains from the framework. Only Project Management is built out
// in this iteration; the others are shown as upcoming so the full framework is
// visible in the navigation.
const navItems = [
  { to: "/admin/projects", label: "Project Management", icon: FolderKanban, enabled: true },
  { to: "/admin/employees", label: "Employee Management", icon: Users, enabled: true },
  { to: "/admin/financial", label: "Financial Management", icon: DollarSign, enabled: true },
  { to: "/admin/clients", label: "Client Management", icon: Headset, enabled: true },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();

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
              <p className="font-bold leading-tight">Bitwix OR</p>
              <p className="text-xs text-muted-foreground">Operations Console</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.enabled && location.pathname.startsWith(item.to);
            if (!item.enabled) {
              return (
                <div
                  key={item.label}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground/50 cursor-not-allowed"
                  title="Coming in a later iteration"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  <span className="ml-auto text-[10px] uppercase tracking-wide">Soon</span>
                </div>
              );
            }
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t space-y-1">
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
