import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, FileDown, Trash2, Pencil, Eye, Printer, FileSpreadsheet, Search, Repeat,
  TrendingUp, Wallet, PieChart as PieIcon, BarChart3,
} from "lucide-react";
import { inr, formatDate, downloadCSV, monthKey } from "@/lib/format";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  CATEGORIES, CATEGORY_LABEL, PAYMENT_METHODS, PAYMENT_METHOD_LABEL,
  type Category, type PaymentMethod, type ExpenseKind,
} from "@/lib/expense-constants";
import type { Database } from "@/integrations/supabase/types";

type Expense = Database["public"]["Tables"]["expenses"]["Row"];
type Recurring = Database["public"]["Tables"]["recurring_expenses"]["Row"];

export const Route = createFileRoute("/_authenticated/expenses")({ component: ExpensesPage });

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];

function ExpensesPage() {
  const { selected, isAll, companies } = useCompany();
  const qc = useQueryClient();

  // Auto-generate recurring expenses on mount
  useEffect(() => {
    supabase.rpc("generate_recurring_expenses").then(({ data }) => {
      if (data && data > 0) {
        toast.success(`${data} recurring expense${data > 1 ? "s" : ""} auto-generated for this month`);
        qc.invalidateQueries({ queryKey: ["expenses"] });
      }
    });
  }, [qc]);

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });

  const { data: recurring = [] } = useQuery({
    queryKey: ["recurring_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recurring_expenses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Recurring[];
    },
  });

  // ---------- Filters ----------
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [method, setMethod] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (!isAll && e.company_id !== selected) return false;
      if (category !== "all" && e.category !== category) return false;
      if (method !== "all" && e.method !== method) return false;
      if (fromDate && e.expense_date < fromDate) return false;
      if (toDate && e.expense_date > toDate) return false;
      if (q) {
        const hay = `${e.title ?? ""} ${e.description ?? ""} ${CATEGORY_LABEL[e.category] ?? ""} ${companyName(e.company_id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, isAll, selected, category, method, fromDate, toDate, search, companies]);

  const totals = useMemo(() => {
    const fixed = filtered.filter((e) => e.expense_kind === "fixed").reduce((s, e) => s + Number(e.amount), 0);
    const variable = filtered.filter((e) => e.expense_kind === "variable").reduce((s, e) => s + Number(e.amount), 0);
    return { total: fixed + variable, fixed, variable, count: filtered.length };
  }, [filtered]);

  // ---------- Dialogs ----------
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; editing?: Expense; kind?: ExpenseKind }>({ open: false });
  const [recurringDialog, setRecurringDialog] = useState<{ open: boolean; editing?: Recurring }>({ open: false });
  const [viewing, setViewing] = useState<Expense | null>(null);

  const delExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense deleted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard-data"] });
    },
  });

  const delRecurring = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recurring rule deleted");
      qc.invalidateQueries({ queryKey: ["recurring_expenses"] });
    },
  });

  const toggleRecurring = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("recurring_expenses").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_expenses"] }),
  });

  // ---------- Exports ----------
  const exportRows = () => filtered.map((e) => ({
    Date: e.expense_date,
    Company: companyName(e.company_id),
    Kind: e.expense_kind,
    Category: CATEGORY_LABEL[e.category] ?? e.category,
    Title: e.title ?? "",
    Amount: Number(e.amount),
    "Payment Method": e.method ? PAYMENT_METHOD_LABEL[e.method] : "",
    Notes: e.description ?? "",
  }));

  const exportExcel = () => {
    const rows = exportRows();
    if (!rows.length) return toast.error("Nothing to export");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `expenses-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expense Management</h1>
          <p className="text-muted-foreground">
            {totals.count} expenses · Total {inr(totals.total)} · Fixed {inr(totals.fixed)} · Variable {inr(totals.variable)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`expenses-${Date.now()}.csv`, exportRows())}>
            <FileDown className="w-4 h-4" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="w-4 h-4" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />Print / PDF
          </Button>
          <Button size="sm" onClick={() => setExpenseDialog({ open: true, kind: "variable" })}>
            <Plus className="w-4 h-4" />Add Expense
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard icon={Wallet} label="Total Expenses" value={inr(totals.total)} accent="from-primary/15 to-primary/5" />
        <SummaryCard icon={Repeat} label="Fixed Expenses" value={inr(totals.fixed)} accent="from-emerald-500/15 to-emerald-500/5" />
        <SummaryCard icon={TrendingUp} label="Variable Expenses" value={inr(totals.variable)} accent="from-amber-500/15 to-amber-500/5" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 grid gap-2 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search title, category, company…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue placeholder="Payment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              {PAYMENT_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} placeholder="From" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} placeholder="To" />
        </CardContent>
      </Card>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
          <TabsTrigger value="fixed">Fixed ({filtered.filter((e) => e.expense_kind === "fixed").length})</TabsTrigger>
          <TabsTrigger value="variable">Variable ({filtered.filter((e) => e.expense_kind === "variable").length})</TabsTrigger>
          <TabsTrigger value="recurring">Recurring Rules ({recurring.length})</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-3">
          <ExpenseTable rows={filtered} companyName={companyName}
            onView={setViewing}
            onEdit={(e) => setExpenseDialog({ open: true, editing: e })}
            onDelete={(id) => delExpense.mutate(id)} />
        </TabsContent>
        <TabsContent value="fixed" className="mt-3">
          <div className="flex justify-end mb-2">
            <Button size="sm" variant="outline" onClick={() => setExpenseDialog({ open: true, kind: "fixed" })}>
              <Plus className="w-4 h-4" />Add Fixed Expense
            </Button>
          </div>
          <ExpenseTable rows={filtered.filter((e) => e.expense_kind === "fixed")} companyName={companyName}
            onView={setViewing}
            onEdit={(e) => setExpenseDialog({ open: true, editing: e })}
            onDelete={(id) => delExpense.mutate(id)} />
        </TabsContent>
        <TabsContent value="variable" className="mt-3">
          <div className="flex justify-end mb-2">
            <Button size="sm" variant="outline" onClick={() => setExpenseDialog({ open: true, kind: "variable" })}>
              <Plus className="w-4 h-4" />Add Variable Expense
            </Button>
          </div>
          <ExpenseTable rows={filtered.filter((e) => e.expense_kind === "variable")} companyName={companyName}
            onView={setViewing}
            onEdit={(e) => setExpenseDialog({ open: true, editing: e })}
            onDelete={(id) => delExpense.mutate(id)} />
        </TabsContent>
        <TabsContent value="recurring" className="mt-3">
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={() => setRecurringDialog({ open: true })}>
              <Plus className="w-4 h-4" />New Recurring Rule
            </Button>
          </div>
          <RecurringTable rows={recurring} companyName={companyName}
            onEdit={(r) => setRecurringDialog({ open: true, editing: r })}
            onDelete={(id) => delRecurring.mutate(id)}
            onToggle={(id, v) => toggleRecurring.mutate({ id, is_active: v })} />
        </TabsContent>
        <TabsContent value="analytics" className="mt-3">
          <Analytics rows={filtered} companies={companies} />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Expense */}
      <Dialog open={expenseDialog.open} onOpenChange={(o) => !o && setExpenseDialog({ open: false })}>
        <ExpenseForm
          key={expenseDialog.editing?.id ?? expenseDialog.kind ?? "new"}
          editing={expenseDialog.editing}
          defaultKind={expenseDialog.kind ?? "variable"}
          onClose={() => setExpenseDialog({ open: false })}
        />
      </Dialog>

      {/* Add/Edit Recurring */}
      <Dialog open={recurringDialog.open} onOpenChange={(o) => !o && setRecurringDialog({ open: false })}>
        <RecurringForm
          key={recurringDialog.editing?.id ?? "new"}
          editing={recurringDialog.editing}
          onClose={() => setRecurringDialog({ open: false })}
        />
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        {viewing && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{viewing.title || CATEGORY_LABEL[viewing.category]}</DialogTitle>
              <DialogDescription>{formatDate(viewing.expense_date)} · {companyName(viewing.company_id)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <Row label="Amount" value={inr(Number(viewing.amount))} />
              <Row label="Kind" value={viewing.expense_kind} />
              <Row label="Category" value={CATEGORY_LABEL[viewing.category] ?? viewing.category} />
              <Row label="Payment" value={viewing.method ? PAYMENT_METHOD_LABEL[viewing.method] : "—"} />
              <Row label="Notes" value={viewing.description || "—"} />
              {viewing.recurring_id && <Badge variant="secondary">Auto-generated</Badge>}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: string; accent: string;
}) {
  return (
    <Card className={`bg-gradient-to-br ${accent} border-border/60`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-lg bg-background/80 border p-2.5 shadow-sm">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseTable({ rows, companyName, onView, onEdit, onDelete }: {
  rows: Expense[]; companyName: (id: string) => string;
  onView: (e: Expense) => void; onEdit: (e: Expense) => void; onDelete: (id: string) => void;
}) {
  if (!rows.length) {
    return <Card><CardContent className="p-12 text-center text-muted-foreground">No expenses found.</CardContent></Card>;
  }
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Date</TableHead><TableHead>Company</TableHead><TableHead>Category</TableHead>
          <TableHead>Title</TableHead><TableHead>Payment</TableHead><TableHead>Notes</TableHead>
          <TableHead className="text-right">Amount</TableHead><TableHead className="w-32"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">{formatDate(e.expense_date)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{companyName(e.company_id)}</TableCell>
              <TableCell><Badge variant="outline">{CATEGORY_LABEL[e.category] ?? e.category}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {e.title || "—"}
                  {e.recurring_id && <Badge variant="secondary" className="text-[10px]">auto</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-sm">{e.method ? PAYMENT_METHOD_LABEL[e.method] : "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{e.description || "—"}</TableCell>
              <TableCell className="text-right font-medium">{inr(Number(e.amount))}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" onClick={() => onView(e)}><Eye className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => onEdit(e)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete this expense?")) onDelete(e.id); }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function RecurringTable({ rows, companyName, onEdit, onDelete, onToggle }: {
  rows: Recurring[]; companyName: (id: string) => string;
  onEdit: (r: Recurring) => void; onDelete: (id: string) => void; onToggle: (id: string, v: boolean) => void;
}) {
  if (!rows.length) {
    return <Card><CardContent className="p-12 text-center text-muted-foreground">No recurring rules yet. Add one to auto-generate fixed expenses every month.</CardContent></Card>;
  }
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Title</TableHead><TableHead>Company</TableHead><TableHead>Category</TableHead>
          <TableHead>Day</TableHead><TableHead>Last Run</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Active</TableHead><TableHead className="w-24"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.title}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{companyName(r.company_id)}</TableCell>
              <TableCell><Badge variant="outline">{CATEGORY_LABEL[r.category] ?? r.category}</Badge></TableCell>
              <TableCell>{r.day_of_month}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.last_generated_on ? formatDate(r.last_generated_on) : "—"}</TableCell>
              <TableCell className="text-right font-medium">{inr(Number(r.amount))}</TableCell>
              <TableCell><Switch checked={r.is_active} onCheckedChange={(v) => onToggle(r.id, v)} /></TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(r)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete this rule?")) onDelete(r.id); }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function Analytics({ rows, companies }: { rows: Expense[]; companies: { id: string; name: string }[] }) {
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((e) => {
      const k = monthKey(e.expense_date);
      map.set(k, (map.get(k) ?? 0) + Number(e.amount));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, total]) => ({ month, total }));
  }, [rows]);

  const byCompany = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((e) => map.set(e.company_id, (map.get(e.company_id) ?? 0) + Number(e.amount)));
    return Array.from(map.entries()).map(([id, total]) => ({
      name: companies.find((c) => c.id === id)?.name ?? "—", total,
    }));
  }, [rows, companies]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount)));
    return Array.from(map.entries()).map(([cat, value]) => ({ name: CATEGORY_LABEL[cat] ?? cat, value }));
  }, [rows]);

  const fixedVar = useMemo(() => {
    const fixed = rows.filter((e) => e.expense_kind === "fixed").reduce((s, e) => s + Number(e.amount), 0);
    const variable = rows.filter((e) => e.expense_kind === "variable").reduce((s, e) => s + Number(e.amount), 0);
    return [{ name: "Fixed", value: fixed }, { name: "Variable", value: variable }];
  }, [rows]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ChartCard title="Monthly Expense Trend" icon={TrendingUp}>
        <LineChart data={monthly}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: number) => inr(v)} />
          <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>
      <ChartCard title="Company-wise Comparison" icon={BarChart3}>
        <BarChart data={byCompany}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="name" fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: number) => inr(v)} />
          <Bar dataKey="total" fill="#22c55e" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Category Breakdown" icon={PieIcon}>
        <PieChart>
          <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={90} label>
            {byCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => inr(v)} />
          <Legend />
        </PieChart>
      </ChartCard>
      <ChartCard title="Fixed vs Variable" icon={PieIcon}>
        <PieChart>
          <Pie data={fixedVar} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
            <Cell fill="#22c55e" /><Cell fill="#f59e0b" />
          </Pie>
          <Tooltip formatter={(v: number) => inr(v)} />
          <Legend />
        </PieChart>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4" />{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============= Forms =============

function ExpenseForm({ editing, defaultKind, onClose }: {
  editing?: Expense; defaultKind: ExpenseKind; onClose: () => void;
}) {
  const { companies, selected, isAll } = useCompany();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    company_id: editing?.company_id ?? (isAll ? companies[0]?.id ?? "" : selected),
    expense_kind: editing?.expense_kind ?? defaultKind,
    category: (editing?.category ?? (defaultKind === "fixed" ? "employee_salary" : "other")) as Category,
    title: editing?.title ?? "",
    amount: editing ? String(editing.amount) : "",
    expense_date: editing?.expense_date ?? new Date().toISOString().slice(0, 10),
    method: (editing?.method ?? "cash") as PaymentMethod,
    description: editing?.description ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_id) throw new Error("Company is required");
      if (!form.amount || Number(form.amount) <= 0) throw new Error("Amount must be greater than 0");
      const payload = {
        company_id: form.company_id, category: form.category, expense_kind: form.expense_kind,
        title: form.title || null, amount: Number(form.amount),
        expense_date: form.expense_date, method: form.method,
        description: form.description || null,
      };
      if (editing) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Expense updated" : "Expense added");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredCats = CATEGORIES.filter((c) => c.kind === form.expense_kind);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle>
        <DialogDescription>Track a business expense and link it to a company.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Kind">
            <Select value={form.expense_kind} onValueChange={(v) => setForm({ ...form, expense_kind: v as ExpenseKind, category: (v === "fixed" ? "employee_salary" : "other") as Category })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="variable">Variable</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Category">
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{filteredCats.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Expense Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Office rent — November" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Payment Method">
          <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as PaymentMethod })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{editing ? "Update" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RecurringForm({ editing, onClose }: { editing?: Recurring; onClose: () => void }) {
  const { companies, selected, isAll } = useCompany();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    company_id: editing?.company_id ?? (isAll ? companies[0]?.id ?? "" : selected),
    category: (editing?.category ?? "employee_salary") as Category,
    title: editing?.title ?? "",
    amount: editing ? String(editing.amount) : "",
    method: (editing?.method ?? "bank_transfer") as PaymentMethod,
    notes: editing?.notes ?? "",
    day_of_month: editing?.day_of_month ?? 1,
    start_date: editing?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: editing?.end_date ?? "",
    is_active: editing?.is_active ?? true,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_id || !form.title || !form.amount) throw new Error("Company, title and amount are required");
      const payload = {
        company_id: form.company_id, category: form.category, title: form.title,
        amount: Number(form.amount), method: form.method, notes: form.notes || null,
        day_of_month: form.day_of_month, start_date: form.start_date,
        end_date: form.end_date || null, is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("recurring_expenses").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recurring_expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Rule updated" : "Recurring rule added");
      qc.invalidateQueries({ queryKey: ["recurring_expenses"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Recurring Rule" : "New Recurring Expense"}</DialogTitle>
        <DialogDescription>A fixed expense row will be auto-created every month.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.filter((c) => c.kind === "fixed").map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Office Rent" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amount (₹)">
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Day of Month">
            <Input type="number" min="1" max="28" value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
          </Field>
          <Field label="Payment">
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as PaymentMethod })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date">
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Field>
          <Field label="End Date (optional)">
            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </Field>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Active</Label>
            <p className="text-xs text-muted-foreground">Auto-generate this expense every month</p>
          </div>
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{editing ? "Update" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
