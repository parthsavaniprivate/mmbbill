import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { Plus, MessageCircle, Phone, Mail, ChevronRight, Building2, Trash2, Upload, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { ClientLogo, fileToLogoDataUrl } from "@/components/clients/ClientLogo";
import { useClientBehaviours } from "@/hooks/use-client-behaviours";
import { BehaviourPill, BehaviourFilter } from "@/components/clients/BehaviourBadge";
import type { PaymentBehaviour } from "@/lib/payment-behaviour";
import { useMemo } from "react";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Status = Database["public"]["Enums"]["client_status"];

export const Route = createFileRoute("/_authenticated/clients/")({
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s.q === "string" && s.q ? { q: s.q } : {},
  component: ClientsPage,
  loader: ({ context }) => {
    context.queryClient.prefetchQuery({
      queryKey: ["clients"],
      queryFn: async () => {
        const { data, error } = await supabase.from("clients").select("*").order("client_name", { ascending: true });
        if (error) throw error;
        return data;
      },
    });
  },
});

const STATUS_COLORS: Record<Status, string> = {
  active: "bg-success/15 text-success border-success/30",
  on_hold: "bg-warning/15 text-warning-foreground border-warning/30",
  completed: "bg-primary/15 text-primary border-primary/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

function ClientsPage() {
  const { q } = Route.useSearch();
  const { selected, isAll, companies } = useCompany();
  
  const [search, setSearch] = useState(q);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [behaviourFilter, setBehaviourFilter] = useState<PaymentBehaviour | "all">("all");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("client_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const overrides = useMemo(() => {
    const m: Record<string, PaymentBehaviour | null> = {};
    for (const c of clients) {
      const v = (c as unknown as { payment_behaviour_override?: PaymentBehaviour | null }).payment_behaviour_override ?? null;
      m[c.id] = v;
    }
    return m;
  }, [clients]);
  // Company scope: when "All", pass null to compute across all invoices/payments.
  const behaviours = useClientBehaviours(isAll ? null : selected, overrides);

  const filtered = clients.filter((c) => {
    if (!isAll && c.company_id !== selected) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (behaviourFilter !== "all" && behaviours.get(c.id)?.behaviour !== behaviourFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.client_name + " " + (c.business_name || "") + " " + (c.mobile || "") + " " + (c.email || ""))
        .toLowerCase().includes(s);
    }
    return true;
  }).sort((a, b) =>
    (a.business_name || a.client_name || "").localeCompare(b.business_name || b.client_name || "", undefined, { sensitivity: "base" })
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">{filtered.length} of {clients.length}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4" /> New Client</Button>
          </DialogTrigger>
          <ClientForm onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["dashboard-data"] }); }} />
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <BehaviourFilter value={behaviourFilter} onChange={setBehaviourFilter} />
      </div>

      {isLoading ? (
        <Card className="shadow-card"><CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card"><CardContent className="p-12 text-center text-muted-foreground">No clients. Create one to get started.</CardContent></Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => {
            const co = companies.find((x) => x.id === c.company_id);
            return (
              <Link
                key={c.id}
                to="/clients/$id"
                params={{ id: c.id }}
                className="group block focus:outline-none min-w-0"
              >
                <Card className="shadow-card transition-all hover:shadow-glow hover:-translate-y-0.5 hover:border-primary/40 cursor-pointer h-full overflow-hidden">
                  <CardContent className="p-3 sm:p-4 space-y-3 min-w-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <ClientLogo
                        name={c.business_name || c.client_name}
                        logoUrl={c.logo_url}
                        className="h-11 w-11 shrink-0 rounded-xl"
                        textClassName="text-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{c.business_name || c.client_name}</p>
                        {c.business_name && <p className="text-xs text-muted-foreground truncate">{c.client_name}</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <Badge className={STATUS_COLORS[c.status]} variant="outline">{c.status.replace("_", " ")}</Badge>
                      {(() => {
                        const b = behaviours.get(c.id)?.behaviour;
                        return b ? <BehaviourPill behaviour={b} short /> : null;
                      })()}
                      {co?.name && (
                        <Badge variant="outline" className="font-normal gap-1 max-w-full">
                          <Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{co.name}</span>
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground border-t border-border/60 pt-3 min-w-0">
                      {c.mobile && <div className="flex items-center gap-2 min-w-0"><Phone className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{c.mobile}</span></div>}
                      {c.email && <div className="flex items-center gap-2 min-w-0"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{c.email}</span></div>}
                      {!c.mobile && !c.email && <div className="text-xs italic">No contact info</div>}
                    </div>

                    <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="pt-1 flex items-center gap-2 flex-wrap">
                      {c.whatsapp && (
                        <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex">
                          <Button size="sm" variant="outline" className="gap-1.5 h-8">
                            <MessageCircle className="w-3.5 h-3.5 text-success" /> WhatsApp
                          </Button>
                        </a>
                      )}
                      <DeleteClientButton client={c} allClients={clients} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

      )}
    </div>
  );
}

export function ClientForm({ initial, id, onClose }: { initial?: Partial<Client>; id?: string; onClose: () => void }) {
  const { companies, selected, isAll } = useCompany();
  const [form, setForm] = useState({
    client_name: initial?.client_name ?? "",
    business_name: initial?.business_name ?? "",
    contact_person: initial?.contact_person ?? "",
    mobile: initial?.mobile ?? "",
    whatsapp: initial?.whatsapp ?? "",
    email: initial?.email ?? "",
    gst_number: initial?.gst_number ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
    status: (initial?.status ?? "active") as Status,
    company_id: initial?.company_id ?? (isAll ? companies[0]?.id ?? "" : selected),
    service_charge_type: (initial?.service_charge_type ?? "fixed_monthly") as "fixed_monthly" | "percent_of_spend" | "custom",
    service_charge_amount: String(initial?.service_charge_amount ?? ""),
    credit_limit: initial?.credit_limit != null ? String(initial.credit_limit) : "",
    billing_cycle: (initial?.billing_cycle ?? "monthly") as "monthly" | "weekly" | "custom",
    logo_url: (initial?.logo_url ?? "") as string,
  });
  const [logoBusy, setLogoBusy] = useState(false);


  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_id) throw new Error("Select a company");
      if (!form.client_name) throw new Error("Client name required");
      const payload = {
        ...form,
        service_charge_amount: Number(form.service_charge_amount || 0),
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
      };
      const { error } = id
        ? await supabase.from("clients").update(payload).eq("id", id)
        : await supabase.from("clients").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(id ? "Client updated" : "Client created"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{id ? "Edit Client" : "New Client"}</DialogTitle></DialogHeader>

      <div className="mb-2 flex items-center gap-4 rounded-xl border border-border/60 bg-muted/30 p-3">
        <ClientLogo
          name={form.business_name || form.client_name || "?"}
          logoUrl={form.logo_url || null}
          className="h-16 w-16 rounded-xl"
          textClassName="text-base"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Client Logo</p>
          <p className="text-xs text-muted-foreground">PNG / JPG / WebP. Auto-resized to 192px.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setLogoBusy(true);
                  try {
                    const url = await fileToLogoDataUrl(f);
                    setForm((s) => ({ ...s, logo_url: url }));
                  } catch (err) {
                    toast.error((err as Error).message || "Could not read image");
                  } finally {
                    setLogoBusy(false);
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={logoBusy} asChild>
                <span><Upload className="h-3.5 w-3.5" />{logoBusy ? "Processing…" : form.logo_url ? "Replace" : "Upload"}</span>
              </Button>
            </label>
            {form.logo_url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setForm((s) => ({ ...s, logo_url: "" }))}
              >
                <XIcon className="h-3.5 w-3.5" /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Company *</Label>
          <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Field label="Client Name *" value={form.client_name} onChange={(v) => setForm({ ...form, client_name: v })} />
        <Field label="Business Name" value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
        <Field label="Contact Person" value={form.contact_person} onChange={(v) => setForm({ ...form, contact_person: v })} />
        <Field label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} />
        <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} />
        <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="GST Number" value={form.gst_number} onChange={(v) => setForm({ ...form, gst_number: v })} />
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 mt-2 -mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing Settings</div>
        <div className="space-y-1.5">
          <Label>Service Charge Type</Label>
          <Select value={form.service_charge_type} onValueChange={(v) => setForm({ ...form, service_charge_type: v as typeof form.service_charge_type })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed_monthly">Fixed Monthly</SelectItem>
              <SelectItem value="percent_of_spend">Percentage on Ad Spend</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field
          label={form.service_charge_type === "percent_of_spend" ? "Service Charge (%)" : "Service Charge (₹)"}
          value={form.service_charge_amount}
          onChange={(v) => setForm({ ...form, service_charge_amount: v })}
        />
        <Field label="Credit Limit (₹)" value={form.credit_limit} onChange={(v) => setForm({ ...form, credit_limit: v })} />
        <div className="space-y-1.5">
          <Label>Billing Cycle</Label>
          <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v as typeof form.billing_cycle })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label>Address</Label>
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DeleteClientButton({ client, allClients }: { client: Client; allClients: Client[] }) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string>("");
  const qc = useQueryClient();

  const { data: counts } = useQuery({
    queryKey: ["client-refs", client.id],
    enabled: open,
    queryFn: async () => {
      const [inv, quo, pkg, files] = await Promise.all([
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("client_id", client.id),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("client_id", client.id),
        supabase.from("packages").select("id", { count: "exact", head: true }).eq("client_id", client.id),
        supabase.from("client_files").select("id", { count: "exact", head: true }).eq("client_id", client.id),
      ]);
      return {
        invoices: inv.count ?? 0,
        quotations: quo.count ?? 0,
        packages: pkg.count ?? 0,
        files: files.count ?? 0,
      };
    },
  });

  const hasInvoices = (counts?.invoices ?? 0) > 0;
  const targets = allClients.filter((c) => c.id !== client.id && c.company_id === client.company_id);

  const del = useMutation({
    mutationFn: async () => {
      if (hasInvoices && !targetId) throw new Error("Select a client to transfer invoices to");
      if (targetId) {
        // Transfer all related records to target client
        const updates = await Promise.all([
          supabase.from("invoices").update({ client_id: targetId }).eq("client_id", client.id),
          supabase.from("quotations").update({ client_id: targetId }).eq("client_id", client.id),
          supabase.from("packages").update({ client_id: targetId }).eq("client_id", client.id),
          supabase.from("client_files").update({ client_id: targetId }).eq("client_id", client.id),
        ]);
        const err = updates.find((r) => r.error)?.error;
        if (err) throw err;
      }
      const { error } = await supabase.from("clients").delete().eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(targetId ? "Client deleted and records transferred" : "Client deleted");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {client.business_name || client.client_name}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {counts ? (
            <div className="rounded-md border p-3 bg-muted/30 space-y-1">
              <div>Invoices: <b>{counts.invoices}</b></div>
              <div>Quotations: <b>{counts.quotations}</b></div>
              <div>Packages: <b>{counts.packages}</b></div>
              <div>Files: <b>{counts.files}</b></div>
            </div>
          ) : (
            <p className="text-muted-foreground">Loading related records…</p>
          )}
          <div className="space-y-1.5">
            <Label>Transfer records to {hasInvoices ? "(required)" : "(optional)"}</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue placeholder="Select target client" /></SelectTrigger>
              <SelectContent>
                {targets.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">No other clients in this company</div>
                ) : targets.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.business_name || t.client_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              All invoices, quotations, packages & files will move to the selected client. Activity log will be removed.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => del.mutate()}
            disabled={del.isPending || (hasInvoices && !targetId)}
          >
            {del.isPending ? "Deleting…" : "Delete Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

