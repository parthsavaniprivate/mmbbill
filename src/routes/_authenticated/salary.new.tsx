import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { inr } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/salary/new")({ component: NewSalarySlip });

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function NewSalarySlip() {
  const navigate = useNavigate();
  const { companies, selected, isAll } = useCompany();
  const now = new Date();
  const [companyId, setCompanyId] = useState(isAll ? companies[0]?.id ?? "" : selected);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const [form, setForm] = useState({
    basic: 0, hra: 0, conveyance: 0, medical: 0, bonus: 0, incentives: 0, overtime: 0,
    pf: 0, esi: 0, prof_tax: 0, tds: 0, other_deductions: 0,
  });
  const u = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  useEffect(() => { if (!companyId && companies[0]) setCompanyId(companies[0].id); }, [companies, companyId]);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("*").eq("company_id", companyId).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const selectedEmp = employees.find((e) => e.id === employeeId);
  useEffect(() => {
    if (selectedEmp) {
      setForm((f) => ({
        ...f,
        basic: Number(selectedEmp.basic),
        hra: Number(selectedEmp.hra),
        conveyance: Number(selectedEmp.conveyance),
        medical: Number(selectedEmp.medical),
      }));
    }
  }, [selectedEmp]);

  const totals = useMemo(() => {
    const gross = form.basic + form.hra + form.conveyance + form.medical + form.bonus + form.incentives + form.overtime;
    const ded = form.pf + form.esi + form.prof_tax + form.tds + form.other_deductions;
    return { gross, ded, net: gross - ded };
  }, [form]);

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId || !employeeId) throw new Error("Select employee");
      const { data, error } = await supabase.from("salary_slips").insert({
        company_id: companyId, employee_id: employeeId,
        month: Number(month), year: Number(year), ...form, status: "draft",
      }).select().single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => { toast.success("Salary slip created"); navigate({ to: "/salary/$id", params: { id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-4xl">
      <Link to="/salary" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">New Salary Slip</h1>

      <Card><CardContent className="p-5 grid md:grid-cols-3 gap-3">
        <Field label="Company">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Employee">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} {e.employee_code ? `(${e.employee_code})` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Month">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Year"><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Earnings</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <Money label="Basic" value={form.basic} onChange={(v) => u({ basic: v })} />
          <Money label="HRA" value={form.hra} onChange={(v) => u({ hra: v })} />
          <Money label="Conveyance" value={form.conveyance} onChange={(v) => u({ conveyance: v })} />
          <Money label="Medical" value={form.medical} onChange={(v) => u({ medical: v })} />
          <Money label="Bonus" value={form.bonus} onChange={(v) => u({ bonus: v })} />
          <Money label="Incentives" value={form.incentives} onChange={(v) => u({ incentives: v })} />
          <Money label="Overtime" value={form.overtime} onChange={(v) => u({ overtime: v })} />
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Deductions</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <Money label="PF" value={form.pf} onChange={(v) => u({ pf: v })} />
          <Money label="ESI" value={form.esi} onChange={(v) => u({ esi: v })} />
          <Money label="Professional Tax" value={form.prof_tax} onChange={(v) => u({ prof_tax: v })} />
          <Money label="TDS" value={form.tds} onChange={(v) => u({ tds: v })} />
          <Money label="Other" value={form.other_deductions} onChange={(v) => u({ other_deductions: v })} />
        </CardContent>
      </Card>

      <Card><CardContent className="p-5 grid grid-cols-3 gap-4 text-center">
        <div><div className="text-xs text-muted-foreground">Gross</div><div className="text-xl font-bold text-success">{inr(totals.gross)}</div></div>
        <div><div className="text-xs text-muted-foreground">Deductions</div><div className="text-xl font-bold text-destructive">{inr(totals.ded)}</div></div>
        <div><div className="text-xs text-muted-foreground">Net Salary</div><div className="text-xl font-bold text-primary">{inr(totals.net)}</div></div>
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link to="/salary">Cancel</Link></Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Create Slip"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function Money({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} />
    </div>
  );
}
