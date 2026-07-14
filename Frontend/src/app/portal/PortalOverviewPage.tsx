import { Link } from "react-router";
import { usePortal } from "./PortalRequireAuth";
import { Card, CardContent } from "../components/ui/card";
import { Ticket, FileText, Bell, UserPlus, ArrowRight } from "lucide-react";

export function PortalOverviewPage() {
  const { account, role, can } = usePortal();

  const tiles = [
    { to: "/portal/tickets", label: "Support tickets", desc: "Raise and track requests", icon: Ticket, show: can("ticket.create") || can("ticket.read.self") },
    { to: "/portal/invoices", label: "Invoices", desc: "Billing and payment history", icon: FileText, show: can("invoice.read") },
    { to: "/portal/consent", label: "Communication preferences", desc: "Manage how we contact you", icon: Bell, show: can("consent.manage.self") },
    { to: "/portal/users", label: "Portal users", desc: "Request access for a colleague", icon: UserPlus, show: can("portal.user.request") },
  ].filter((t) => t.show);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Welcome</h1>
      <p className="text-muted-foreground mb-8">
        You're signed in to the <strong>{account?.name}</strong> portal as {role.replace("CLIENT_", "").toLowerCase()}.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to}>
              <Card className="hover:shadow-lg hover:border-primary/30 transition-all h-full">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="bg-primary/10 p-3 rounded-lg"><Icon className="h-6 w-6 text-primary" /></div>
                  <div className="flex-1">
                    <p className="font-semibold">{t.label}</p>
                    <p className="text-sm text-muted-foreground">{t.desc}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
