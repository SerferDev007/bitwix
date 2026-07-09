import { Headset } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { PortfolioTab } from "./tabs/PortfolioTab";
import { SupportDeskTab } from "./tabs/SupportDeskTab";

export function ClientsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Headset className="h-8 w-8 text-primary" />
          Client Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Value accounts by lifetime value and segment the portfolio, and staff the support desk with M/M/c queuing.
        </p>
      </div>

      <Tabs defaultValue="portfolio">
        <TabsList className="mb-6">
          <TabsTrigger value="portfolio">Clients & CLV</TabsTrigger>
          <TabsTrigger value="support">Support Desk</TabsTrigger>
        </TabsList>
        <TabsContent value="portfolio"><PortfolioTab /></TabsContent>
        <TabsContent value="support"><SupportDeskTab /></TabsContent>
      </Tabs>
    </div>
  );
}
