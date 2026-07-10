import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, FileDown, Trash2, Pencil, RefreshCw, Wallet, Repeat, TrendingUp,
  Layers, Calendar, CheckCircle2, XCircle,
} from "lucide-react";
import { inr, formatDate, downloadCSV } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Enums"]["expense_category"];
type Cycle = Database["public"]["Enums"]["recurring_cycle"];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "facebook_ads", label: "Facebook Ads" },
  { value: "instagram_ads", label: "Instagram Ads" },
  { value: "google_ads", label: "Google Ads" },
  { value: "employee_salary", label: "Employee Salary" },
  { value: "software_subscriptions", label: "Software Subscriptions" },
  { value: "internet", label: "Internet" },
  { value: "office", label: "Office" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Other" },
];

const FIXED_CATEGORIES: Category[] = ["employee_salary", "office", "internet", "software_subscriptions"];

const CYCLES: { value: Cycle; label: string; months: number }[] = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "quarterly", label: "Quarterly", months: 3 },
  { value: "half_yearly", label: "Half Yearly", months: 6 },
  { value: "yearly", label: "Yearly", months: 12 },
];

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
  loader: ({ context }) => {
    context.queryClient.prefetchQuery({
      queryKey: ["expenses"],
      queryFn: async () => {
        const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
        return data ?? [];
      },
    });
    context.queryClient.prefetchQuery({
      queryKey: ["recurring_expenses"],
      queryFn: async () => {
        const { data } = await supabase.from("recurring_expenses").select("*").order("next_due_date", { ascending: true });
        return data ?? [];
      },
    });
  },
});

function ExpensesPage() {
  const { selected, isAll, companies } = useCompany();
  const qc = useQueryClient();
  const [openVar, setOpenVar] = useState(false);
  const [openFix, setOpenFix] = useState(false);
  const [editingFix, setEditingFix] = useState<RecurringRow | null>(null);
  const [editingVar, setEditingVar] = useState<ExpenseRow | null>(null);
  const [period, setPeriod] = useState<"all" | "month" | "year">("month");

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: recurring = [] } = useQuery({
    queryKey: ["recurring_expenses"],
    queryFn: async () => {
      const { data } = await supabase.from("recurring_expenses").select("*").order("next_due_date", { ascending: true });
      return data ?? [];
    },
  });

  const now = new Date();
  const inPeriod = (dateStr: string) => {
    const d = new Date(dateStr);
    if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === "year") return d.getFullYear() === now.getFullYear();
    return true;
  };
  const inCompany = (cid: string) => isAll || cid === selected;

  const scopedExpenses = expenses.filter((e) => inCompany(e.company_id) && inPeriod(e.expense_date));
  const scopedRecurring = recurring.filter((r) => inCompany(r.company_id));

  const fixedTotal = scopedExpenses.filter((e) => e.expense_kind === "fixed").reduce((s, e) => s + Number(e.amount), 0);
  const fixedCount = scopedExpenses.filter((e) => e.expense_kind === "fixed").length;
  const variableExpenses = scopedExpenses.filter((e) => e.expense_kind === "variable");
  const variableTotal = variableExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const recurringActive = scopedRecurring.filter((r) => r.is_active);
  const recurringMonthly = recurringActive.reduce((s, r) => {
    const months = CYCLES.find((c) => c.value === r.cycle)?.months ?? 1;
    return s + Number(r.amount) / months;
  }, 0);
  const totalExpenses = fixedTotal + variableTotal;

  const upcoming = useMemo(
    () => recurringActive
      .filter((r) => r.next_due_date)
      .sort((a, b) => (a.next_due_date! < b.next_due_date! ? -1 : 1))
      .slice(0, 5),
    [recurringActive],
  );

  const delExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["expenses"] }); },
  });

  const delRecurring = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["recurring_expenses"] }); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("recurring_expenses").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_expenses"] }),
  });

  const runGenerator = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_recurring_expenses");
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      toast.success(`Generated ${n ?? 0} due expense${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["recurring_expenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Manage fixed, recurring, and variable expenses</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => runGenerator.mutate()} disabled={runGenerator.isPending}>
            <RefreshCw className="w-4 h-4" />Run Due
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Wallet className="w-5 h-5" />}
          label="Fixed Expenses"
          value={inr(fixedTotal)}
          sub={`${fixedCount} item${fixedCount === 1 ? "" : "s"}`}
          gradient="from-blue-500/15 to-blue-500/0"
        />
        <SummaryCard
          icon={<Repeat className="w-5 h-5" />}
          label="Recurring (monthly run-rate)"
          value={inr(recurringMonthly)}
          sub={`${recurringActive.length} active`}
          gradient="from-violet-500/15 to-violet-500/0"
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Variable Expenses"
          value={inr(variableTotal)}
          sub={`${variableExpenses.length} item${variableExpenses.length === 1 ? "" : "s"}`}
          gradient="from-amber-500/15 to-amber-500/0"
        />
        <SummaryCard
          icon={<Layers className="w-5 h-5" />}
          label="Total Expenses"
          value={inr(totalExpenses)}
          sub="Fixed + Variable"
          gradient="from-rose-500/15 to-rose-500/0"
        />
      </div>

      {/* Fixed Expenses Management + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Fixed Expenses Management</CardTitle>
              <CardDescription>Salaries, rent, subscriptions and other recurring fixed costs</CardDescription>
            </div>
            <Dialog open={openFix} onOpenChange={(o) => { setOpenFix(o); if (!o) setEditingFix(null); }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4" />Add Fixed</Button></DialogTrigger>
              <RecurringForm
                key={editingFix?.id ?? "new"}
                initial={editingFix}
                onClose={() => { setOpenFix(false); setEditingFix(null); qc.invalidateQueries({ queryKey: ["recurring_expenses"] }); }}
              />
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            {scopedRecurring.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm">No fixed expenses yet.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Company</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Cycle</TableHead><TableHead>Next Due</TableHead>
                  <TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {scopedRecurring.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{companies.find((c) => c.id === r.company_id)?.name}</TableCell>
                      <TableCell className="text-right font-medium">{inr(Number(r.amount))}</TableCell>
                      <TableCell><Badge variant="outline">{CYCLES.find((c) => c.value === r.cycle)?.label}</Badge></TableCell>
                      <TableCell>{r.next_due_date ? formatDate(r.next_due_date) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.is_active}
                            onCheckedChange={(v) => toggleActive.mutate({ id: r.id, value: v })}
                          />
                          {r.is_active
                            ? <span className="text-xs text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Active</span>
                            : <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><XCircle className="w-3 h-3" />Inactive</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditingFix(r); setOpenFix(true); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => delRecurring.mutate(r.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4" />Upcoming Recurring</CardTitle>
            <CardDescription>Next due dates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing upcoming.</p>
            ) : upcoming.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div>
                  <div className="font-medium text-sm">{r.title}</div>
                  <div className="text-xs text-muted-foreground">Next due: {r.next_due_date ? formatDate(r.next_due_date) : "—"}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{inr(Number(r.amount))}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{CYCLES.find((c) => c.value === r.cycle)?.label}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Variable Expenses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Variable Expenses Management</CardTitle>
            <CardDescription>Ads, travel and one-off costs</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV("expenses.csv", scopedExpenses.map((e) => ({
              date: e.expense_date, company: companies.find((c) => c.id === e.company_id)?.name,
              kind: e.expense_kind, category: e.category, amount: e.amount, vendor: e.vendor, description: e.description,
            })))}><FileDown className="w-4 h-4" />Export</Button>
            <Dialog open={openVar} onOpenChange={(o) => { setOpenVar(o); if (!o) setEditingVar(null); }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4" />Add Variable</Button></DialogTrigger>
              <VariableForm
                key={editingVar?.id ?? "new"}
                initial={editingVar}
                onClose={() => { setOpenVar(false); setEditingVar(null); qc.invalidateQueries({ queryKey: ["expenses"] }); }}
              />
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {variableExpenses.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">No variable expenses for this period.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Category</TableHead>
                <TableHead>Vendor</TableHead><TableHead>Company</TableHead>
                <TableHead className="text-right">Amount</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {variableExpenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.expense_date)}</TableCell>
                    <TableCell><Badge variant="outline">{CATEGORIES.find((c) => c.value === e.category)?.label}</Badge></TableCell>
                    <TableCell>{e.vendor || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{companies.find((c) => c.id === e.company_id)?.name}</TableCell>
                    <TableCell className="text-right font-medium">{inr(Number(e.amount))}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingVar(e); setOpenVar(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => delExpense.mutate(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon, label, value, sub, gradient,
}: { icon: React.ReactNode; label: string; value: string; sub: string; gradient: string }) {
  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br ${gradient}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="rounded-md bg-background/70 border p-1.5 shadow-sm">{icon}</span>
        </div>
        <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

type RecurringRow = Database["public"]["Tables"]["recurring_expenses"]["Row"];
type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];

function RecurringForm({ initial, onClose }: { initial: RecurringRow | null; onClose: () => void }) {
  const { companies, selected, isAll } = useCompany();
  const [form, setForm] = useState({
    company_id: initial?.company_id ?? (isAll ? companies[0]?.id ?? "" : selected),
    title: initial?.title ?? "",
    category: (initial?.category ?? "employee_salary") as Category,
    amount: initial ? String(initial.amount) : "",
    cycle: (initial?.cycle ?? "monthly") as Cycle,
    start_date: initial?.start_date ?? new Date().toISOString().slice(0, 10),
    next_due_date: initial?.next_due_date ?? new Date().toISOString().slice(0, 10),
    is_active: initial?.is_active ?? true,
    notes: initial?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_id || !form.title || !form.amount) throw new Error("Name, company and amount are required");
      const payload = {
        company_id: form.company_id, title: form.title, category: form.category,
        amount: Number(form.amount), cycle: form.cycle,
        start_date: form.start_date, next_due_date: form.next_due_date,
        is_active: form.is_active, notes: form.notes || null,
      };
      if (initial) {
        const { error } = await supabase.from("recurring_expenses").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recurring_expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(initial ? "Updated" : "Added"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Edit" : "New"} Fixed Expense</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Expense Name</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Office Rent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Company</Label>
            <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.filter((c) => FIXED_CATEGORIES.includes(c.value) || c.value === "other").map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Amount (₹)</Label>
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="space-y-1.5"><Label>Cycle</Label>
            <Select value={form.cycle} onValueChange={(v) => setForm({ ...form, cycle: v as Cycle })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Start Date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div className="space-y-1.5"><Label>Next Due Date</Label>
            <Input type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Active</div>
            <div className="text-xs text-muted-foreground">Recurring entries will be auto-generated on the due date</div>
          </div>
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
        </div>
        <div className="space-y-1.5"><Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
      </div>
      <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

function VariableForm({ initial, onClose }: { initial: ExpenseRow | null; onClose: () => void }) {
  const { companies, selected, isAll } = useCompany();
  const [form, setForm] = useState({
    company_id: initial?.company_id ?? (isAll ? companies[0]?.id ?? "" : selected),
    category: (initial?.category ?? "facebook_ads") as Category,
    amount: initial ? String(initial.amount) : "",
    expense_date: initial?.expense_date ?? new Date().toISOString().slice(0, 10),
    vendor: initial?.vendor ?? "",
    description: initial?.description ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_id || !form.amount) throw new Error("Company and amount required");
      const payload = {
        company_id: form.company_id, category: form.category, expense_kind: "variable" as const,
        amount: Number(form.amount), expense_date: form.expense_date,
        vendor: form.vendor || null, description: form.description || null,
      };
      if (initial) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(initial ? "Updated" : "Expense added"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const variableCats = CATEGORIES.filter((c) => !FIXED_CATEGORIES.includes(c.value));
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Edit" : "New"} Variable Expense</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Company</Label>
          <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{variableCats.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
      </div>
      <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
    </DialogContent>
  );
}
