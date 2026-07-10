import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
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

  useEffect(() => {
    const mmb = companies.find((c) => c.name.toLowerCase().includes("make me"));
    if (mmb) setCompanyId(mmb.id);
    else if (!companyId && companies[0]) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  const [form, setForm] = useState({
    employee_name: "",
    designation: "",
    department: "",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    pay_date: new Date().toISOString().slice(0, 10),
    worked_days: 26,
    basic: 0,
    incentives: 0,
    pf: 0,
    prof_tax: 0,
    loan: 0,
  });
  const u = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm({ ...form, [k]: v });

  const totals = useMemo(() => {
    const gross = Number(form.basic) + Number(form.incentives);
    const ded = Number(form.pf) + Number(form.prof_tax) + Number(form.loan);
    return { gross, ded, net: gross - ded };
  }, [form]);

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select company");
      if (!form.employee_name.trim()) throw new Error("Enter employee name");
      const { data, error } = await supabase.from("salary_slips").insert({
        company_id: companyId,
        employee_id: null,
        employee_name: form.employee_name.trim(),
        designation: form.designation.trim() || null,
        department: form.department.trim() || null,
        month: Number(form.month),
        year: Number(form.year),
        pay_date: form.pay_date || null,
        worked_days: Number(form.worked_days),
        basic: Number(form.basic),
        incentives: Number(form.incentives),
        pf: Number(form.pf),
        prof_tax: Number(form.prof_tax),
        loan: Number(form.loan),
        status: "draft",
      }).select().single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => { toast.success("Salary slip generated"); navigate({ to: "/salary/$id", params: { id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/salary" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">New Salary Slip</h1>

      <Card><CardHeader><CardTitle>Employee & Period</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <Field label="Employee Name"><Input value={form.employee_name} onChange={(e) => u("employee_name", e.target.value)} /></Field>
          <Field label="Designation"><Input value={form.designation} onChange={(e) => u("designation", e.target.value)} /></Field>
          <Field label="Department"><Input value={form.department} onChange={(e) => u("department", e.target.value)} /></Field>
          <Field label="Pay Period — Month">
            <Select value={String(form.month)} onValueChange={(v) => u("month", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Year"><Input type="number" value={form.year} onChange={(e) => u("year", Number(e.target.value))} /></Field>
          <Field label="Pay Date"><Input type="date" value={form.pay_date} onChange={(e) => u("pay_date", e.target.value)} /></Field>
          <Field label="Worked Days"><Input type="number" step="0.5" value={form.worked_days} onChange={(e) => u("worked_days", Number(e.target.value))} /></Field>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Earnings</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Money label="Basic Pay" value={form.basic} onChange={(v) => u("basic", v)} />
          <Money label="Incentive Pay" value={form.incentives} onChange={(v) => u("incentives", v)} />
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Deductions</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <Money label="Provident Fund" value={form.pf} onChange={(v) => u("pf", v)} />
          <Money label="Professional Tax" value={form.prof_tax} onChange={(v) => u("prof_tax", v)} />
          <Money label="Loan" value={form.loan} onChange={(v) => u("loan", v)} />
        </CardContent>
      </Card>

      <Card><CardContent className="p-5 grid grid-cols-3 gap-4 text-center">
        <div><div className="text-xs text-muted-foreground">Total Earnings</div><div className="text-xl font-bold text-success">{inr(totals.gross)}</div></div>
        <div><div className="text-xs text-muted-foreground">Total Deductions</div><div className="text-xl font-bold text-destructive">{inr(totals.ded)}</div></div>
        <div><div className="text-xs text-muted-foreground">Net Pay</div><div className="text-xl font-bold text-primary">{inr(totals.net)}</div></div>
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link to="/salary">Cancel</Link></Button>
        <Button data-shortcut="save" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Generating…" : "Generate Slip"}</Button>
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
