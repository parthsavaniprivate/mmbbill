import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileDown, Trash2 } from "lucide-react";
import { inr, formatDate, downloadCSV } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Enums"]["expense_category"];

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

export const Route = createFileRoute("/_authenticated/expenses")({ component: ExpensesPage });

function ExpensesPage() {
  const { selected, isAll, companies } = useCompany();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<"all" | "month" | "year">("month");
  const [category, setCategory] = useState<string>("all");

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      return data ?? [];
    },
  });

  const now = new Date();
  const filtered = expenses.filter((e) => {
    if (!isAll && e.company_id !== selected) return false;
    if (category !== "all" && e.category !== category) return false;
    const d = new Date(e.expense_date);
    if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === "year") return d.getFullYear() === now.getFullYear();
    return true;
  });

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["expenses"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">{filtered.length} expenses · {inr(total)} total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCSV("expenses.csv", filtered.map((e) => ({
            date: e.expense_date,
            company: companies.find((c) => c.id === e.company_id)?.name,
            category: e.category, amount: e.amount, vendor: e.vendor, description: e.description,
          })))}><FileDown className="w-4 h-4" />Export</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4" />Add Expense</Button></DialogTrigger>
            <ExpenseForm onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["expenses"] }); }} />
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as "all" | "month" | "year")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No expenses for this period.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Vendor</TableHead>
              <TableHead>Company</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDate(e.expense_date)}</TableCell>
                  <TableCell><Badge variant="outline">{CATEGORIES.find((c) => c.value === e.category)?.label}</Badge></TableCell>
                  <TableCell>{e.vendor || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{companies.find((c) => c.id === e.company_id)?.name}</TableCell>
                  <TableCell className="text-right font-medium">{inr(Number(e.amount))}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const { companies, selected, isAll } = useCompany();
  const [form, setForm] = useState({
    company_id: isAll ? companies[0]?.id ?? "" : selected,
    category: "other" as Category, amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    vendor: "", description: "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_id || !form.amount) throw new Error("Company and amount required");
      const { error } = await supabase.from("expenses").insert({
        company_id: form.company_id, category: form.category,
        amount: Number(form.amount), expense_date: form.expense_date,
        vendor: form.vendor || null, description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Expense added"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
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
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
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
