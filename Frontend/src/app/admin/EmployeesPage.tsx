import { Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { RosterTab } from "./tabs/RosterTab";
import { AllocationTab } from "./tabs/AllocationTab";
import { RetentionTab } from "./tabs/RetentionTab";

export function EmployeesPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          Employee Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Allocate developers to tasks with the assignment problem, and forecast attrition with a Markov retention model.
        </p>
      </div>

      <Tabs defaultValue="roster">
        <TabsList className="mb-6">
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="allocation">Task Allocation</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
        </TabsList>

        <TabsContent value="roster">
          <RosterTab />
        </TabsContent>
        <TabsContent value="allocation">
          <AllocationTab />
        </TabsContent>
        <TabsContent value="retention">
          <RetentionTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
