import { DollarSign } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { CapacityTab } from "./tabs/CapacityTab";
import { InvestmentsTab } from "./tabs/InvestmentsTab";
import { BreakEvenTab } from "./tabs/BreakEvenTab";

export function FinancialPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-primary" />
          Financial Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Allocate capacity with linear programming, rank investments by NPV, and find the break-even for a service line.
        </p>
      </div>

      <Tabs defaultValue="capacity">
        <TabsList className="mb-6">
          <TabsTrigger value="capacity">Capacity (LP)</TabsTrigger>
          <TabsTrigger value="investments">Investments (NPV)</TabsTrigger>
          <TabsTrigger value="breakeven">Break-even</TabsTrigger>
        </TabsList>
        <TabsContent value="capacity"><CapacityTab /></TabsContent>
        <TabsContent value="investments"><InvestmentsTab /></TabsContent>
        <TabsContent value="breakeven"><BreakEvenTab /></TabsContent>
      </Tabs>
    </div>
  );
}
