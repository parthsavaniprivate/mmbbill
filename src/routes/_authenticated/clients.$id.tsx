import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Upload, Trash2, MessageCircle, FileDown, Pencil, Download } from "lucide-react";
import { ClientForm } from "./clients.index";
import { BillingConfigCard } from "@/components/billing/BillingConfigCard";
import { computeBehaviour, BEHAVIOUR_LABEL, BEHAVIOUR_ORDER, behaviourDescription, type PaymentBehaviour } from "@/lib/payment-behaviour";
import { BehaviourPill } from "@/components/clients/BehaviourBadge";

import { inr, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
  loader: ({ context, params }) => {
    // Prime cache on viewport preload so the page opens instantly on click.
    context.queryClient.prefetchQuery({
      queryKey: ["client", params.id],
      queryFn: async () => {
        const { data, error } = await supabase.from("clients").select("*, companies(name)").eq("id", params.id).maybeSingle();
        if (error) throw error;
        return data;
      },
    });
    context.queryClient.prefetchQuery({
      queryKey: ["client-invoices", params.id],
      queryFn: async () => {
        const { data } = await supabase.from("invoices").select("*").eq("client_id", params.id).order("invoice_date", { ascending: false });
        return data ?? [];
      },
    });
  },
});

function ClientDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);


  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*, companies(name)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["client-packages", id],
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("*, deliverables(*)").eq("client_id", id);
      return data ?? [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["client-invoices", id],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("*").eq("client_id", id).order("invoice_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: files = [] } = useQuery({
    queryKey: ["client-files", id],
    queryFn: async () => {
      const { data } = await supabase.from("client_files").select("*").eq("client_id", id).order("uploaded_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["client-payments", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("*, invoices!inner(invoice_number, client_id, company_id)")
        .eq("invoices.client_id", id)
        .order("payment_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: quotations = [] } = useQuery({
    queryKey: ["client-quotations", id],
    queryFn: async () => {
      const { data } = await supabase.from("quotations").select("*").eq("client_id", id).order("quotation_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["client-activity", id],
    queryFn: async () => {
      const { data } = await supabase.from("client_activity").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const { data: ledger = [] } = useQuery({
    queryKey: ["client-ledger", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_ledger", { _client_id: id });
      if (error) throw error;
      return (data ?? []) as Array<{ entry_date: string; kind: string; ref: string; description: string; debit: number; credit: number; balance: number }>;
    },
  });


  const exportLedgerCSV = () => {
    const rows = [
      ["Date", "Type", "Ref", "Description", "Debit", "Credit", "Balance"],
      ...ledger.map(r => [r.entry_date, r.kind, r.ref, r.description, r.debit, r.credit, r.balance]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ledger-${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };


  const uploadFile = async (file: File, category: string): Promise<void> => {
    const path = `${id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("client-files").upload(path, file);
    if (upErr) { toast.error(upErr.message); return; }
    const { error } = await supabase.from("client_files").insert({
      client_id: id, file_name: file.name, storage_path: path,
      category: category as "agreement" | "invoice" | "branding" | "content" | "other",
      file_size: file.size, mime_type: file.type,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("File uploaded");
    qc.invalidateQueries({ queryKey: ["client-files", id] });
  };

  const downloadFile = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("client-files").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
    void name;
  };

  const deleteFile = async (fileId: string, path: string) => {
    await supabase.storage.from("client-files").remove([path]);
    await supabase.from("client_files").delete().eq("id", fileId);
    qc.invalidateQueries({ queryKey: ["client-files", id] });
  };

  if (!client) {
    return (
      <div className="space-y-4">
        <Link to="/clients" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Clients
        </Link>
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="h-4 w-96 rounded bg-muted animate-pulse" />
        <div className="grid md:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const co = client.companies as { name: string } | null;

  return (
    <div className="space-y-4">
      <Link to="/clients" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Clients
      </Link>

      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client.client_name}</h1>
          <p className="text-muted-foreground">{[client.business_name, client.contact_person, co?.name].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2">
          {client.whatsapp && (
            <a href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
              <Button variant="outline"><MessageCircle className="w-4 h-4" />WhatsApp</Button>
            </a>
          )}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Pencil className="w-4 h-4" />Edit</Button>
            </DialogTrigger>
            <ClientForm
              id={id}
              initial={client}
              onClose={() => { setEditOpen(false); qc.invalidateQueries({ queryKey: ["client", id] }); qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["dashboard-data"] }); }}
            />
          </Dialog>
          <Button asChild><Link to="/invoices/new" search={{ client: id } as never}><Plus className="w-4 h-4" />New Invoice</Link></Button>
        </div>
      </div>


      <div className="grid md:grid-cols-3 gap-4">
        <InfoCard label="Mobile" value={client.mobile} />
        <InfoCard label="Email" value={client.email} />
        <InfoCard label="GST" value={client.gst_number} />
        <InfoCard label="Status" value={client.status.replace("_", " ")} />
        <InfoCard label="Address" value={client.address} className="md:col-span-2" />
        {client.notes && <InfoCard label="Notes" value={client.notes} className="md:col-span-3" />}
      </div>

      {/* Billing Settings */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Billing Settings</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Service Charge" value={
            client.service_charge_type === "percent_of_spend"
              ? `${Number(client.service_charge_amount ?? 0)}% of ad spend`
              : client.service_charge_type === "fixed_monthly"
                ? `${inr(Number(client.service_charge_amount ?? 0))} / month`
                : `${inr(Number(client.service_charge_amount ?? 0))} (custom)`
          } />
          <Stat label="Billing Cycle" value={(client.billing_cycle ?? "monthly").replace(/_/g, " ")} />
          <Stat label="Credit Limit" value={client.credit_limit != null ? inr(Number(client.credit_limit)) : "—"} />
        </CardContent>
      </Card>

      {client.company_id && <BillingConfigCard clientId={id} companyId={client.company_id} />}

      <PaymentBehaviourCard
        clientId={id}
        invoices={invoices}
        payments={payments}
        override={(client as unknown as { payment_behaviour_override: PaymentBehaviour | null }).payment_behaviour_override ?? null}
        onChanged={() => qc.invalidateQueries({ queryKey: ["client", id] })}
      />

      {/* Billing Summary */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Billing Summary</p>
          {(() => {
            const total = invoices.length;
            const paid = invoices.filter(i => i.status === "paid").length;
            const pending = invoices.filter(i => i.status === "pending" || i.status === "partially_paid").length;
            const overdue = invoices.filter(i => i.status === "overdue").length;
            return (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <Stat label="Total Invoices" value={String(total)} />
                <Stat label="Paid" value={String(paid)} />
                <Stat label="Pending" value={String(pending)} />
                <Stat label="Overdue" value={String(overdue)} />
              </div>
            );
          })()}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Money</p>
          {(() => {
            const collected = invoices.reduce((a, i) => a + Number(i.amount_paid ?? 0), 0);
            const billed = invoices.reduce((a, i) => a + Number(i.total ?? 0), 0);
            const outstanding = Math.max(0, billed - collected);
            return (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <Stat label="Total Billed" value={inr(billed)} />
                <Stat label="Collected" value={inr(collected)} />
                <Stat label="Outstanding" value={inr(outstanding)} />
                <Stat label="Credit Limit" value={client.credit_limit != null ? inr(Number(client.credit_limit)) : "—"} />
              </div>
            );
          })()}
        </CardContent></Card>
      </div>



      <Tabs defaultValue="packages">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="quotations">Quotations ({quotations.length})</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
          
        </TabsList>

        <TabsContent value="packages" className="space-y-3">
          <div className="flex justify-end">
            <PackageDialog clientId={id} onSaved={() => qc.invalidateQueries({ queryKey: ["client-packages", id] })} />
          </div>
          {packages.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No packages yet.</CardContent></Card>
          ) : packages.map((p) => {
            const dels = (p.deliverables as Array<{ id: string; name: string; monthly_target: number; completed: number }>) ?? [];
            return (
              <Card key={p.id} className="shadow-card">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{p.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {inr(Number(p.monthly_amount))}/mo · Renews {formatDate(p.renewal_date)}
                      </p>
                    </div>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DeliverableForm packageId={p.id} onSaved={() => qc.invalidateQueries({ queryKey: ["client-packages", id] })} />
                  {dels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No deliverables tracked.</p>
                  ) : dels.map((d) => {
                    const pct = d.monthly_target ? Math.min(100, (d.completed / d.monthly_target) * 100) : 0;
                    return (
                      <div key={d.id} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{d.name}</span>
                          <span className="text-muted-foreground">{d.completed}/{d.monthly_target}</span>
                        </div>
                        <Progress value={pct} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="p-0">
              {invoices.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No invoices yet.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Number</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {invoices.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell><Link to="/invoices/$id" params={{ id: i.id }} className="font-medium hover:underline">{i.invoice_number}</Link></TableCell>
                        <TableCell>{formatDate(i.invoice_date)}</TableCell>
                        <TableCell>{inr(Number(i.total))}</TableCell>
                        <TableCell>{inr(Number(i.amount_paid))}</TableCell>
                        <TableCell><Badge variant="outline">{i.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="space-y-3">
          <FileUpload onUpload={uploadFile} />
          <Card>
            <CardContent className="p-0">
              {files.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No files uploaded.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Uploaded</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {files.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.file_name}</TableCell>
                        <TableCell><Badge variant="outline">{f.category}</Badge></TableCell>
                        <TableCell>{formatDate(f.uploaded_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => downloadFile(f.storage_path, f.file_name)}>
                            <FileDown className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteFile(f.id, f.storage_path)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card><CardContent className="p-0">
            {payments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No payments recorded.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {payments.map((p) => {
                    const inv = p.invoices as { invoice_number: string } | null;
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.payment_date)}</TableCell>
                        <TableCell className="font-medium">{inv?.invoice_number ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{p.method}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{p.reference ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">{inr(Number(p.amount))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="quotations">
          <Card><CardContent className="p-0">
            {quotations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No quotations yet.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Number</TableHead><TableHead>Date</TableHead><TableHead>Valid Until</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {quotations.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell><Link to="/quotations/$id" params={{ id: q.id }} className="font-medium hover:underline">{q.quotation_number}</Link></TableCell>
                      <TableCell>{formatDate(q.quotation_date)}</TableCell>
                      <TableCell>{q.valid_until ? formatDate(q.valid_until) : "—"}</TableCell>
                      <TableCell>{inr(Number(q.total))}</TableCell>
                      <TableCell><Badge variant="outline">{q.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportLedgerCSV} disabled={ledger.length === 0}>
              <Download className="w-4 h-4" />Export CSV
            </Button>
          </div>
          <Card><CardContent className="p-0">
            {ledger.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No ledger entries.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Ref</TableHead><TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ledger.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{formatDate(r.entry_date)}</TableCell>
                      <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
                      <TableCell className="font-medium">{r.ref}</TableCell>
                      <TableCell className="text-muted-foreground">{r.description}</TableCell>
                      <TableCell className="text-right">{r.debit ? inr(Number(r.debit)) : "—"}</TableCell>
                      <TableCell className="text-right">{r.credit ? inr(Number(r.credit)) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(Number(r.balance))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card><CardContent className="p-4">
            {activity.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No activity yet.</div>
            ) : (
              <ol className="relative border-l border-border pl-6 space-y-4">
                {activity.map((a) => {
                  const s = (a.summary as Record<string, unknown>) ?? {};
                  return (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[29px] top-1.5 w-3 h-3 rounded-full bg-primary" />
                      <div className="flex justify-between items-baseline gap-3">
                        <p className="font-medium">{a.kind.replace(/_/g, " ")}</p>
                        <span className="text-xs text-muted-foreground">{formatDate(a.created_at)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {Object.entries(s).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") || "—"}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent></Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function InfoCard({ label, value, className }: { label: string; value: string | null; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 font-medium">{value || "—"}</p>
      </CardContent>
    </Card>
  );
}

function PackageDialog({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", monthly_amount: "", start_date: new Date().toISOString().slice(0, 10), renewal_date: "" });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("packages").insert({
        client_id: clientId, name: form.name,
        monthly_amount: Number(form.monthly_amount || 0),
        start_date: form.start_date,
        renewal_date: form.renewal_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Package added"); setOpen(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4" />Add Package</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Package</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Social Media – Gold" /></div>
          <div className="space-y-1.5"><Label>Monthly Amount (₹)</Label><Input type="number" value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Renewal Date</Label><Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliverableForm({ packageId, onSaved }: { packageId: string; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [completed, setCompleted] = useState("0");

  const add = async () => {
    if (!name) return;
    const { error } = await supabase.from("deliverables").insert({
      package_id: packageId, name, monthly_target: Number(target || 0), completed: Number(completed || 0),
    });
    if (error) return toast.error(error.message);
    setName(""); setTarget(""); setCompleted("0");
    onSaved();
  };

  return (
    <div className="flex flex-wrap gap-2 items-end p-3 rounded-lg bg-muted/40">
      <div className="space-y-1 flex-1 min-w-[160px]"><Label className="text-xs">Deliverable</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reels" /></div>
      <div className="space-y-1 w-24"><Label className="text-xs">Target</Label><Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
      <div className="space-y-1 w-24"><Label className="text-xs">Done</Label><Input type="number" value={completed} onChange={(e) => setCompleted(e.target.value)} /></div>
      <Button size="sm" onClick={add}><Plus className="w-4 h-4" /></Button>
    </div>
  );
}

function FileUpload({ onUpload }: { onUpload: (file: File, category: string) => Promise<void> }) {
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap gap-2 items-center">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="agreement">Agreement</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="branding">Branding</SelectItem>
            <SelectItem value="content">Content</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Label className="cursor-pointer">
          <input type="file" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setBusy(true); await onUpload(f, category); setBusy(false);
            e.target.value = "";
          }} />
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
            <Upload className="w-4 h-4" />{busy ? "Uploading…" : "Upload File"}
          </span>
        </Label>
      </CardContent>
    </Card>
  );
}
