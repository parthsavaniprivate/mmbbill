import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/services")({ component: ServiceMasterPage });

type Service = {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
};

type FormState = { id?: string; name: string };

function ServiceMasterPage() {
  const { selected, companies, isAll } = useCompany();
  const companyId = isAll ? companies[0]?.id ?? "" : selected;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ name: "" });

  const { data: services = [] } = useQuery({
    queryKey: ["services-master", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("id, company_id, name, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, search]);

  const upsert = useMutation({
    mutationFn: async (f: FormState) => {
      const name = f.name.trim();
      if (!name) throw new Error("Name is required");
      if (f.id) {
        const { error } = await supabase.from("service_catalog").update({ name }).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_catalog").insert({ company_id: companyId, name, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Service saved");
      qc.invalidateQueries({ queryKey: ["services-master", companyId] });
      qc.invalidateQueries({ queryKey: ["service-catalog-v2"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_catalog").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service deleted");
      qc.invalidateQueries({ queryKey: ["services-master", companyId] });
      qc.invalidateQueries({ queryKey: ["service-catalog-v2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setForm({ name: "" }); setDialogOpen(true); };
  const openEdit = (s: Service) => { setForm({ id: s.id, name: s.name }); setDialogOpen(true); };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Package className="w-7 h-7" /> Service Master</h1>
          <p className="text-sm text-muted-foreground mt-1">List of services offered by your company.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4" /> New Service</Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {filtered.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="font-medium truncate">{s.name}</div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="hover:text-destructive" onClick={() => { if (confirm(`Delete "${s.name}"?`)) del.mutate(s.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-center text-sm text-muted-foreground py-12">
                No services. <button className="underline" onClick={openNew}>Create the first one</button>.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? "Edit Service" : "New Service"}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Service Name</Label>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") upsert.mutate(form); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => upsert.mutate(form)} disabled={upsert.isPending}>{upsert.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
