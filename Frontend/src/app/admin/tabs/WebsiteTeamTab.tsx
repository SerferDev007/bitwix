import { useEffect, useRef, useState } from "react";
import { teamAdminApi, type AdminTeamMember } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Loader2, Plus, Trash2, Upload, X, AlertCircle, ImageOff } from "lucide-react";

// Initials avatar shown when a member has no photo.
function Avatar({ name, url, size = 56 }: { name: string; url: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  if (url) {
    return <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "?"}
    </div>
  );
}

export function WebsiteTeamTab() {
  const [members, setMembers] = useState<AdminTeamMember[]>([]);
  const [uploadsEnabled, setUploadsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "", description: "", skills: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    const res = await teamAdminApi.listAll();
    if (res.success && res.data) {
      setMembers(res.data);
      setUploadsEnabled(res.uploadsEnabled !== false);
    } else setError(res.message || "Failed to load team.");
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => {
      setError("Unable to reach the server.");
      setLoading(false);
    });
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await teamAdminApi.create({
      name: form.name,
      role: form.role,
      description: form.description || null,
      skills: form.skills,
      phone: form.phone || null,
      email: form.email || null,
    });
    setSaving(false);
    if (res.success) {
      setForm({ name: "", role: "", description: "", skills: "", phone: "", email: "" });
      load();
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    await teamAdminApi.remove(id);
    await load();
    setBusyId(null);
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading team…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        These are the members shown in the <strong>Team</strong> section of the public website. Photos are optional —
        members without one show their initials.
      </p>

      {!uploadsEnabled && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 text-amber-700 p-3 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          Photo uploads aren't configured on the server yet (set <code>MEDIA_BUCKET</code>). You can still add members; they'll display initials.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add team member</CardTitle>
          <p className="text-sm text-muted-foreground">Skills are comma-separated. You can upload a photo after adding.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label htmlFor="tm-name">Name *</Label><Input id="tm-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="tm-role">Role *</Label><Input id="tm-role" required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            <div><Label htmlFor="tm-skills">Skills</Label><Input id="tm-skills" placeholder="React, Node.js" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></div>
            <div><Label htmlFor="tm-phone">Phone</Label><Input id="tm-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label htmlFor="tm-email">Email</Label><Input id="tm-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="col-span-2 md:col-span-3">
              <Label htmlFor="tm-desc">Description</Label>
              <Textarea id="tm-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Button type="submit" disabled={saving} className="flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add member
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No team members yet.</CardContent></Card>
        )}
        {members.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            uploadsEnabled={uploadsEnabled}
            busy={busyId === m.id}
            onChange={load}
            onRemove={() => remove(m.id)}
            setBusy={(b) => setBusyId(b ? m.id : null)}
          />
        ))}
      </div>
    </div>
  );
}

function MemberCard({
  member, uploadsEnabled, busy, onChange, onRemove, setBusy,
}: {
  member: AdminTeamMember;
  uploadsEnabled: boolean;
  busy: boolean;
  onChange: () => void;
  onRemove: () => void;
  setBusy: (b: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    const res = await teamAdminApi.uploadPhoto(member.id, file);
    setBusy(false);
    if (res.success) onChange();
    else setErr(res.message || "Upload failed.");
  };

  const clearPhoto = async () => {
    setBusy(true);
    await teamAdminApi.deletePhoto(member.id);
    setBusy(false);
    onChange();
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Avatar name={member.name} url={member.image_url} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{member.name}</p>
            <p className="text-sm text-primary">{member.role}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {(member.skills || []).map((s) => (
                <span key={s} className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">{s}</span>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy} title="Delete member">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-500" />}
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <Button variant="outline" size="sm" onClick={pick} disabled={busy || !uploadsEnabled} className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> {member.image_url ? "Replace photo" : "Upload photo"}
          </Button>
          {member.image_url && (
            <Button variant="ghost" size="sm" onClick={clearPhoto} disabled={busy} className="flex items-center gap-1 text-muted-foreground">
              <ImageOff className="h-4 w-4" /> Remove photo
            </Button>
          )}
        </div>
        {err && (
          <p className="text-sm text-red-600 mt-2 flex items-center gap-1"><X className="h-4 w-4" /> {err}</p>
        )}
      </CardContent>
    </Card>
  );
}
