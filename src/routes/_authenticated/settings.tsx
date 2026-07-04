import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { Upload, X } from "lucide-react";

type Company = Database["public"]["Tables"]["companies"]["Row"];

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { data: companies = [] } = useQuery({
    queryKey: ["companies-full"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("*").order("name");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure company info, invoice defaults, branding, and WhatsApp templates.</p>
      </div>

      <Tabs defaultValue={companies[0]?.id ?? ""}>
        <TabsList>
          {companies.map((c) => <TabsTrigger key={c.id} value={c.id}>{c.name}</TabsTrigger>)}
        </TabsList>
        {companies.map((c) => (
          <TabsContent key={c.id} value={c.id}>
            <CompanyForm company={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CompanyForm({ company }: { company: Company }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(company);
  useEffect(() => setForm(company), [company]);

  const save = useMutation({
    mutationFn: async () => {
      const { id, created_at, updated_at, ...patch } = form;
      void created_at; void updated_at;
      const { error } = await supabase.from("companies").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["companies-full"] }); qc.invalidateQueries({ queryKey: ["companies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd = (patch: Partial<Company>) => setForm({ ...form, ...patch });
  const updStr = (k: keyof Company, v: string) => setForm({ ...form, [k]: (v || null) });

  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <F label="Name" value={form.name} onChange={(v) => updStr("name", v)} />
          <F label="Legal Name" value={form.legal_name ?? ""} onChange={(v) => updStr("legal_name", v)} />
          <F label="Phone" value={form.phone ?? ""} onChange={(v) => updStr("phone", v)} />
          <F label="Email" value={form.email ?? ""} onChange={(v) => updStr("email", v)} />
          <F label="Website" value={form.website ?? ""} onChange={(v) => updStr("website", v)} />
          <F label="GSTIN" value={form.gst_number ?? ""} onChange={(v) => updStr("gst_number", v)} />
          <F label="PAN" value={form.pan_number ?? ""} onChange={(v) => updStr("pan_number", v)} />
          <div />
          <div className="space-y-1.5 md:col-span-2"><Label>Address</Label>
            <Textarea value={form.address ?? ""} onChange={(e) => updStr("address", e.target.value)} rows={2} />
          </div>
          <F label="City" value={form.city ?? ""} onChange={(v) => updStr("city", v)} />
          <F label="State" value={form.state ?? ""} onChange={(v) => updStr("state", v)} />
          <F label="Pincode" value={form.pincode ?? ""} onChange={(v) => updStr("pincode", v)} />
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Branding</CardTitle><CardDescription>Logo & authorised signature appear on invoices and quotations.</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <AssetUpload label="Logo" companyId={form.id} url={form.logo_url} onChange={(u) => upd({ logo_url: u })} />
          <AssetUpload label="Signature" companyId={form.id} url={form.signature_url} onChange={(u) => upd({ signature_url: u })} />
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Invoice Defaults</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <F label="Invoice Prefix" value={form.invoice_prefix} onChange={(v) => updStr("invoice_prefix", v)} />
          <F label="Default GST Rate (%)" type="number" value={String(form.default_gst_rate ?? "")} onChange={(v) => upd({ default_gst_rate: v === "" ? null : Number(v) })} />
          <F label="Default Due Days" type="number" value={String(form.default_due_days ?? "")} onChange={(v) => upd({ default_due_days: v === "" ? null : Number(v) })} />
          <div className="space-y-1.5"><Label>Currency</Label>
            <Select value={form.currency ?? "INR"} onValueChange={(v) => updStr("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR (₹)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="GBP">GBP (£)</SelectItem>
                <SelectItem value="AED">AED (د.إ)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Date Format</Label>
            <Select value={form.date_format ?? "dd-MM-yyyy"} onValueChange={(v) => updStr("date_format", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dd-MM-yyyy">DD-MM-YYYY</SelectItem>
                <SelectItem value="MM/dd/yyyy">MM/DD/YYYY</SelectItem>
                <SelectItem value="yyyy-MM-dd">YYYY-MM-DD</SelectItem>
                <SelectItem value="dd MMM yyyy">DD MMM YYYY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <F label="Reminder Days Before Renewal" type="number" value={String(form.renewal_reminder_days ?? "")} onChange={(v) => upd({ renewal_reminder_days: v === "" ? 0 : Number(v) })} />
          <div className="space-y-1.5 md:col-span-3"><Label>Default Invoice Terms</Label>
            <Textarea value={form.invoice_terms ?? ""} onChange={(e) => updStr("invoice_terms", e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5 md:col-span-3"><Label>Invoice Footer Note</Label>
            <Textarea value={form.invoice_footer_note ?? ""} onChange={(e) => updStr("invoice_footer_note", e.target.value)} rows={2} placeholder="Thank you for your business!" />
          </div>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Bank Details</CardTitle><CardDescription>Shown on invoices</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <F label="Bank Name" value={form.bank_name ?? ""} onChange={(v) => updStr("bank_name", v)} />
          <F label="Account Number" value={form.bank_account ?? ""} onChange={(v) => updStr("bank_account", v)} />
          <F label="IFSC" value={form.bank_ifsc ?? ""} onChange={(v) => updStr("bank_ifsc", v)} />
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Email & WhatsApp Templates</CardTitle>
        <CardDescription>Variables: {`{client_name}, {package_name}, {renewal_date}, {amount}, {invoice_number}`}</CardDescription>
      </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5"><Label>Invoice Email Template</Label>
            <Textarea value={form.invoice_email_template ?? ""} onChange={(e) => updStr("invoice_email_template", e.target.value)} rows={5}
              placeholder={"Hi {client_name},\n\nPlease find attached invoice {invoice_number} for ₹{amount}.\n\nRegards"} />
          </div>
          <div className="space-y-1.5"><Label>WhatsApp Reminder Template</Label>
            <Textarea value={form.whatsapp_template ?? ""} onChange={(e) => updStr("whatsapp_template", e.target.value)} rows={4}
              placeholder="Hi {client_name}, your {package_name} is up for renewal on {renewal_date}." />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save Changes"}</Button>
      </div>
    </div>
  );
}

function F({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5"><Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AssetUpload({ label, companyId, url, onChange }: { label: string; companyId: string; url: string | null; onChange: (u: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!url) { setSigned(null); return; }
    if (url.startsWith("http")) { setSigned(url); return; }
    supabase.storage.from("company-assets").createSignedUrl(url, 3600).then(({ data }) => setSigned(data?.signedUrl ?? null));
  }, [url]);

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${companyId}/${label.toLowerCase()}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      onChange(path);
      toast.success(`${label} uploaded`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="border rounded-md p-3 flex items-center gap-3">
        <div className="w-24 h-24 bg-muted rounded flex items-center justify-center overflow-hidden shrink-0">
          {signed ? <img src={signed} alt={label} className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-muted-foreground">No {label.toLowerCase()}</span>}
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : url ? "Replace" : "Upload"}
          </Button>
          {url && <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}><X className="w-4 h-4" /> Remove</Button>}
        </div>
      </div>
    </div>
  );
}
