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
import { ArrowLeft, Plus, Upload, Trash2, MessageCircle, FileDown } from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients/$id")({ component: ClientDetail });

function ClientDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

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
  const { data: metaSummary } = useQuery({
    queryKey: ["client-meta-summary", id],
    queryFn: async () => {
      const { data: account } = await supabase
        .from("meta_accounts")
        .select("id, ad_account_id, ad_account_name, business_name, currency, last_synced_at, status")
        .eq("client_id", id).maybeSingle();
      if (!account) return null;
      const [{ count: campCount }, { count: activeCount }, { data: ins }, { data: hist }] = await Promise.all([
        supabase.from("meta_campaigns").select("id", { count: "exact", head: true }).eq("meta_account_id", account.id),
        supabase.from("meta_campaigns").select("id", { count: "exact", head: true }).eq("meta_account_id", account.id).eq("status", "ACTIVE"),
        supabase.from("meta_campaign_insights").select("spend, leads, reach, impressions, clicks").eq("meta_account_id", account.id),
        supabase.from("meta_ad_spend_history").select("spend, leads, reach, impressions, clicks, date").eq("meta_account_id", account.id),
      ]);
      const sum = (arr: { [k: string]: unknown }[] | null, k: string) =>
        (arr ?? []).reduce((a, r) => a + Number((r as Record<string, unknown>)[k] ?? 0), 0);
      const insightsHave = (ins ?? []).length > 0;
      const today = new Date().toISOString().slice(0, 10);
      const last7Cut = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const last30Cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const todaySpend = (hist ?? []).filter(r => r.date === today).reduce((a, r) => a + Number(r.spend ?? 0), 0);
      const last7 = (hist ?? []).filter(r => r.date >= last7Cut).reduce((a, r) => a + Number(r.spend ?? 0), 0);
      const last30 = (hist ?? []).filter(r => r.date >= last30Cut).reduce((a, r) => a + Number(r.spend ?? 0), 0);
      return {
        account,
        totalCampaigns: campCount ?? 0,
        activeCampaigns: activeCount ?? 0,
        spend: insightsHave ? sum(ins, "spend") : sum(hist, "spend"),
        leads: insightsHave ? sum(ins, "leads") : sum(hist, "leads"),
        reach: insightsHave ? sum(ins, "reach") : sum(hist, "reach"),
        impressions: insightsHave ? sum(ins, "impressions") : sum(hist, "impressions"),
        clicks: insightsHave ? sum(ins, "clicks") : sum(hist, "clicks"),
        todaySpend, last7, last30,
      };
    },
  });


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

  if (!client) return <div className="text-muted-foreground">Loading…</div>;

  const co = client.companies as { name: string } | null;

  return (
    <div className="space-y-4">
      <Link to="/clients" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Clients
      </Link>

      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client.business_name || client.client_name}</h1>
          <p className="text-muted-foreground">{client.contact_person || client.client_name} · {co?.name}</p>
        </div>
        <div className="flex gap-2">
          {client.whatsapp && (
            <a href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
              <Button variant="outline"><MessageCircle className="w-4 h-4" />WhatsApp</Button>
            </a>
          )}
          <Button asChild><Link to="/invoices/new" search={{ client: id } as never}><Plus className="w-4 h-4" />New Invoice</Link></Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <InfoCard label="Mobile" value={client.mobile} />
        <InfoCard label="Email" value={client.email} />
        
        <InfoCard label="Status" value={client.status.replace("_", " ")} />
        <InfoCard label="Address" value={client.address} className="md:col-span-2" />
        {client.notes && <InfoCard label="Notes" value={client.notes} className="md:col-span-3" />}
      </div>

      <Tabs defaultValue="packages">
        <TabsList>
          <TabsTrigger value="packages">Packages & Deliverables</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
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
      </Tabs>
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
