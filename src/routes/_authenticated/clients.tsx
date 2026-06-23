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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MessageCircle, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Status = Database["public"]["Enums"]["client_status"];

export const Route = createFileRoute("/_authenticated/clients")({
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" }),
  component: ClientsPage,
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
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = clients.filter((c) => {
    if (!isAll && c.company_id !== selected) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.client_name + " " + (c.business_name || "") + " " + (c.mobile || "") + " " + (c.email || ""))
        .toLowerCase().includes(s);
    }
    return true;
  });

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
          <ClientForm onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
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
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No clients. Create one to get started.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const co = companies.find((x) => x.id === c.company_id);
                  return (
                    <TableRow key={c.id} className="cursor-pointer">
                      <TableCell>
                        <Link to="/clients/$id" params={{ id: c.id }} className="block">
                          <p className="font-medium">{c.business_name || c.client_name}</p>
                          {c.business_name && <p className="text-xs text-muted-foreground">{c.client_name}</p>}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="outline">{co?.name}</Badge></TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col gap-0.5">
                          {c.mobile && <span className="flex items-center gap-1 text-muted-foreground"><Phone className="w-3 h-3" />{c.mobile}</span>}
                          {c.email && <span className="flex items-center gap-1 text-muted-foreground"><Mail className="w-3 h-3" />{c.email}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[c.status]} variant="outline">{c.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        {c.whatsapp && (
                          <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                            <Button size="icon" variant="ghost"><MessageCircle className="w-4 h-4 text-success" /></Button>
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientForm({ initial, onClose }: { initial?: Partial<Client>; onClose: () => void }) {
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
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_id) throw new Error("Select a company");
      if (!form.client_name) throw new Error("Client name required");
      const { error } = await supabase.from("clients").insert(form);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Client created"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
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
