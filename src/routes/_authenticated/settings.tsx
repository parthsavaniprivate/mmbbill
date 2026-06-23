import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

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
        <p className="text-muted-foreground">Configure company info, GST details, invoice settings, and WhatsApp templates.</p>
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

  const upd = (k: keyof Company, v: string) => setForm({ ...form, [k]: v || null });

  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <F label="Name" value={form.name} onChange={(v) => upd("name", v)} />
          <F label="Legal Name" value={form.legal_name ?? ""} onChange={(v) => upd("legal_name", v)} />
          <F label="Phone" value={form.phone ?? ""} onChange={(v) => upd("phone", v)} />
          <F label="Email" value={form.email ?? ""} onChange={(v) => upd("email", v)} />
          <F label="Website" value={form.website ?? ""} onChange={(v) => upd("website", v)} />
          <F label="Logo URL" value={form.logo_url ?? ""} onChange={(v) => upd("logo_url", v)} />
          <div className="space-y-1.5 md:col-span-2"><Label>Address</Label>
            <Textarea value={form.address ?? ""} onChange={(e) => upd("address", e.target.value)} rows={2} />
          </div>
          <F label="City" value={form.city ?? ""} onChange={(v) => upd("city", v)} />
          <F label="State" value={form.state ?? ""} onChange={(v) => upd("state", v)} />
          <F label="Pincode" value={form.pincode ?? ""} onChange={(v) => upd("pincode", v)} />
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>GST & Invoice</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <F label="GST Number" value={form.gst_number ?? ""} onChange={(v) => upd("gst_number", v)} />
          <F label="PAN" value={form.pan_number ?? ""} onChange={(v) => upd("pan_number", v)} />
          <F label="Invoice Prefix" value={form.invoice_prefix} onChange={(v) => upd("invoice_prefix", v)} />
          <div className="space-y-1.5 md:col-span-2"><Label>Default Invoice Terms</Label>
            <Textarea value={form.invoice_terms ?? ""} onChange={(e) => upd("invoice_terms", e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Bank Details</CardTitle><CardDescription>Shown on invoices</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <F label="Bank Name" value={form.bank_name ?? ""} onChange={(v) => upd("bank_name", v)} />
          <F label="Account Number" value={form.bank_account ?? ""} onChange={(v) => upd("bank_account", v)} />
          <F label="IFSC" value={form.bank_ifsc ?? ""} onChange={(v) => upd("bank_ifsc", v)} />
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>WhatsApp Reminder Template</CardTitle>
        <CardDescription>Used for renewal reminders. Variables: {`{client_name}, {package_name}, {renewal_date}, {amount}`}</CardDescription>
      </CardHeader>
        <CardContent>
          <Textarea value={form.whatsapp_template ?? ""} onChange={(e) => upd("whatsapp_template", e.target.value)} rows={5}
            placeholder="Hi {client_name}, your {package_name} is up for renewal on {renewal_date}." />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save Changes"}</Button>
      </div>
    </div>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5"><Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
