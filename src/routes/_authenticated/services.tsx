import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/lib/format";
import { BILLING_TYPE_OPTIONS } from "@/lib/billing/cycle";

export const Route = createFileRoute("/_authenticated/services")({ component: ServiceMasterPage });

type Service = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  category: string | null;
  billing_type: string | null;
  hsn_sac: string | null;
  service_code: string | null;
  default_price: number | null;
  default_gst_rate: number | null;
  default_quantity: number | null;
  default_unit: string | null;
  is_active: boolean;
  usage_count: number;
};

type FormState = Partial<Service>;

const emptyForm = (companyId: string): FormState => ({
  company_id: companyId,
  name: "",
  description: "",
  category: "",
  billing_type: "monthly",
  hsn_sac: "",
  service_code: "",
  default_price: 0,
  default_gst_rate: 18,
  default_quantity: 1,
  default_unit: "nos",
  is_active: true,
});

function ServiceMasterPage() {
  const { selected, companies, isAll } = useCompany();
  const companyId = isAll ? companies[0]?.id ?? "" : selected;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [billingType, setBillingType] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(companyId));

  const { data: services = [] } = useQuery({
    queryKey: ["services-master", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("*")
        .eq("company_id", companyId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => s.category && set.add(s.category));
    return Array.from(set).sort();
  }, [services]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (status === "active" && !s.is_active) return false;
      if (status === "inactive" && s.is_active) return false;
      if (category !== "all" && (s.category ?? "") !== category) return false;
      if (billingType !== "all" && (s.billing_type ?? "") !== billingType) return false;
      if (q && !`${s.name} ${s.service_code ?? ""} ${s.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [services, search, category, billingType, status]);

  const upsert = useMutation({
    mutationFn: async (f: FormState) => {
      if (!f.name?.trim()) throw new Error("Name is required");
      const payload = {
        company_id: companyId,
        name: f.name!.trim(),
        description: f.description || null,
        category: f.category || null,
        billing_type: f.billing_type || null,
        hsn_sac: f.hsn_sac || null,
        service_code: f.service_code?.trim() || null,
        default_price: f.default_price != null ? Number(f.default_price) : null,
        default_gst_rate: f.default_gst_rate != null ? Number(f.default_gst_rate) : null,
        default_quantity: f.default_quantity != null ? Number(f.default_quantity) : 1,
        default_unit: f.default_unit || "nos",
        is_active: f.is_active ?? true,
      };
      if (f.id) {
        const { error } = await supabase.from("service_catalog").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_catalog").insert(payload);
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

  const openNew = () => { setForm(emptyForm(companyId)); setDialogOpen(true); };
  const openEdit = (s: Service) => { setForm(s); setDialogOpen(true); };

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Package className="w-7 h-7" /> Service Master</h1>
          <p className="text-sm text-muted-foreground mt-1">Central repository of services offered by your company.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4" /> New Service</Button>
      </div>

      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, code, description…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={billingType} onValueChange={setBillingType}>
            <SelectTrigger><SelectValue placeholder="Billing Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Billing Types</SelectItem>
              {BILLING_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="md:col-span-4 flex items-center gap-2">
            {(["all", "active", "inactive"] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
                {s === "all" ? "All" : s === "active" ? "Active" : "Inactive"}
              </Button>
            ))}
            <div className="ml-auto text-xs text-muted-foreground">{filtered.length} service{filtered.length !== 1 ? "s" : ""}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <Card key={s.id} className={s.is_active ? "" : "opacity-60"}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.service_code && <span className="mr-2">Code: {s.service_code}</span>}
                    {s.hsn_sac && <span>HSN/SAC: {s.hsn_sac}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="hover:text-destructive" onClick={() => { if (confirm(`Delete "${s.name}"?`)) del.mutate(s.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {s.description && <div className="text-xs text-muted-foreground line-clamp-2">{s.description}</div>}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {s.category && <Badge variant="secondary">{s.category}</Badge>}
                {s.billing_type && <Badge variant="outline">{BILLING_TYPE_OPTIONS.find((o) => o.value === s.billing_type)?.label ?? s.billing_type}</Badge>}
                {!s.is_active && <Badge variant="destructive">Inactive</Badge>}
              </div>
              <div className="flex items-center justify-between pt-1 border-t text-sm">
                <div>
                  <div className="font-semibold">{s.default_price != null ? inr(Number(s.default_price)) : "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.default_quantity ?? 1} {s.default_unit ?? "nos"}
                    {s.default_gst_rate != null && ` · GST ${s.default_gst_rate}%`}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">Used {s.usage_count ?? 0}×</div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12">
            No services match. <button className="underline" onClick={openNew}>Create the first one</button>.
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit Service" : "New Service"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 space-y-1.5">
              <Label>Service Name *</Label>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Service Code</Label>
              <Input value={form.service_code ?? ""} onChange={(e) => setForm({ ...form, service_code: e.target.value })} placeholder="e.g. SEO-M" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input list="svc-cats" value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Digital Marketing" />
              <datalist id="svc-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Billing Type</Label>
              <Select value={form.billing_type ?? "monthly"} onValueChange={(v) => setForm({ ...form, billing_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>HSN / SAC</Label>
              <Input value={form.hsn_sac ?? ""} onChange={(e) => setForm({ ...form, hsn_sac: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Default Price (₹)</Label>
              <Input type="number" value={form.default_price ?? 0} onChange={(e) => setForm({ ...form, default_price: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>GST %</Label>
              <Input type="number" value={form.default_gst_rate ?? 0} onChange={(e) => setForm({ ...form, default_gst_rate: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Default Quantity</Label>
              <Input type="number" value={form.default_quantity ?? 1} onChange={(e) => setForm({ ...form, default_quantity: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Default Unit</Label>
              <Input value={form.default_unit ?? "nos"} onChange={(e) => setForm({ ...form, default_unit: e.target.value })} placeholder="nos, hrs, month" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-muted-foreground">Inactive services are hidden from invoice suggestions.</div>
              </div>
              <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => upsert.mutate(form)} disabled={upsert.isPending}>{upsert.isPending ? "Saving…" : "Save Service"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
