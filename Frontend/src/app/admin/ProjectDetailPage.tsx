import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { projectsApi, type Activity, type Project } from "../lib/api";
import { useCurrency } from "../lib/currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ActivitiesTab } from "./tabs/ActivitiesTab";
import { ScheduleTab } from "./tabs/ScheduleTab";
import { PertTab } from "./tabs/PertTab";
import { EvmTab } from "./tabs/EvmTab";

type FullProject = Project & { activities: Activity[]; snapshots: unknown[] };

export function ProjectDetailPage() {
  const { format } = useCurrency();
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<FullProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await projectsApi.get(projectId);
    if (res.success && res.data) setProject(res.data as FullProject);
    else setError(res.message || "Failed to load project.");
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load().catch(() => {
      setError("Unable to reach the server.");
      setLoading(false);
    });
  }, [load]);

  if (loading)
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading project…
      </div>
    );
  if (error || !project)
    return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error || "Not found"}</div>;

  return (
    <div>
      <Link to="/admin/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> All projects
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground mt-1">
            {project.client_name && <>Client: {project.client_name} · </>}
            {project.bac != null && <>Budget: {format(project.bac)} · </>}
            {project.deadline_days != null && <>Deadline: {project.deadline_days} days</>}
          </p>
        </div>
        <Badge className="capitalize">{project.status.replace("_", " ")}</Badge>
      </div>

      <Tabs defaultValue="activities">
        <TabsList className="mb-6">
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="schedule">Schedule (CPM)</TabsTrigger>
          <TabsTrigger value="pert">PERT</TabsTrigger>
          <TabsTrigger value="evm">Earned Value</TabsTrigger>
        </TabsList>

        <TabsContent value="activities">
          <ActivitiesTab project={project} onChange={load} />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="pert">
          <PertTab projectId={projectId} deadline={project.deadline_days} />
        </TabsContent>
        <TabsContent value="evm">
          <EvmTab projectId={projectId} bac={project.bac} onChange={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
