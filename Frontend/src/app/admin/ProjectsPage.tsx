import { useEffect, useState } from "react";
import { Link } from "react-router";
import { projectsApi, type Project } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";
import { Plus, FolderKanban, ArrowRight, Loader2 } from "lucide-react";

const statusColors: Record<string, string> = {
  planning: "bg-slate-500",
  active: "bg-blue-500",
  on_hold: "bg-amber-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
};

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await projectsApi.list();
    if (res.success && res.data) setProjects(res.data);
    else setError(res.message || "Failed to load projects.");
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setError("Unable to reach the server."));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FolderKanban className="h-8 w-8 text-primary" />
            Project Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Schedule with CPM, estimate uncertainty with PERT, and control with Earned Value Management.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> New Project
            </Button>
          </DialogTrigger>
          <NewProjectDialog
            onCreated={() => {
              setOpen(false);
              load();
            }}
          />
        </Dialog>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading projects…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>
      )}

      {!loading && !error && projects.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No projects yet. Create your first project to start scheduling.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((p) => (
          <Link key={p.id} to={`/admin/projects/${p.id}`}>
            <Card className="hover:shadow-lg hover:border-primary/30 transition-all h-full">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">{p.name}</h3>
                  <Badge className={`${statusColors[p.status] || "bg-slate-500"} text-white capitalize`}>
                    {p.status.replace("_", " ")}
                  </Badge>
                </div>
                {p.client_name && (
                  <p className="text-sm text-muted-foreground mb-3">Client: {p.client_name}</p>
                )}
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{p.activity_count ?? 0} activities</span>
                  <span className="flex items-center gap-1 text-primary">
                    Open <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NewProjectDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", client_name: "", bac: "", deadline_days: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await projectsApi.create({
      name: form.name,
      client_name: form.client_name || null,
      bac: form.bac ? Number(form.bac) : null,
      deadline_days: form.deadline_days ? Number(form.deadline_days) : null,
      description: form.description || null,
    });
    setSaving(false);
    if (res.success) onCreated();
    else setErr(res.errors?.name || res.message || "Failed to create project.");
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New Project</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="np-name">Project name *</Label>
          <Input id="np-name" value={form.name} required
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Feature Delivery" />
        </div>
        <div>
          <Label htmlFor="np-client">Client</Label>
          <Input id="np-client" value={form.client_name}
            onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Client name" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="np-bac">Budget (BAC)</Label>
            <Input id="np-bac" type="number" value={form.bac}
              onChange={(e) => setForm({ ...form, bac: e.target.value })} placeholder="200000" />
          </div>
          <div>
            <Label htmlFor="np-deadline">Deadline (days)</Label>
            <Input id="np-deadline" type="number" value={form.deadline_days}
              onChange={(e) => setForm({ ...form, deadline_days: e.target.value })} placeholder="27" />
          </div>
        </div>
        <div>
          <Label htmlFor="np-desc">Description</Label>
          <Textarea id="np-desc" value={form.description} rows={2}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <DialogFooter>
          <Button type="submit" disabled={saving} className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Project
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
