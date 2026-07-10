import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, FileDown, Eye, MessageCircle, Bell, MoreHorizontal, Pencil, Trash2, Receipt, IndianRupee, AlertCircle } from "lucide-react";
import { inr, formatDate, downloadCSV } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";
import { SendReminderDialog, MarkAsPaidButton } from "@/components/invoices/SendReminderDialog";
import { daysBetween } from "@/lib/reminders";
import { toast } from "sonner";

type Status = Database["public"]["Enums"]["invoice_status"];
type ClientLite = { client_name: string; business_name: string | null; whatsapp: string | null; mobile: string | null };

export const Route = createFileRoute("/_authenticated/invoices/")({
  component: InvoicesPage,
  loader: ({ context }) => {
    context.queryClient.prefetchQuery({
      queryKey: ["invoices"],
      queryFn: async () => {
        const { data } = await supabase.from("invoices")
          .select("*, clients(client_name, business_name, whatsapp, mobile)")
          .order("invoice_date", { ascending: false });
        return data ?? [];
      },
    });
  },
});

const STATUS_COLORS: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning/15 text-warning border-warning/30",
  partially_paid: "bg-primary/15 text-primary border-primary/30",
  paid: "bg-success/15 text-success border-success/30",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground",
};

const REMINDABLE: Status[] = ["pending", "partially_paid", "overdue"];

function InvoicesPage() {
  const { selected, isAll, companies } = useCompany();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [period, setPeriod] = useState("all"); // all | this_month | last_month | YYYY-MM | custom
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reminderFor, setReminderFor] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("invoice_items").delete().eq("invoice_id", id);
      await supabase.from("payments").delete().eq("invoice_id", id);
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Invoice deleted"); qc.invalidateQueries({ queryKey: ["invoices"] }); setDeleteFor(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data } = await supabase.from("invoices")
        .select("*, clients(client_name, business_name, whatsapp, mobile)")
        .order("invoice_date", { ascending: false });
      return data ?? [];
    },
  });

  const monthOptions = (() => {
    const set = new Set<string>();
    invoices.forEach((i) => { if (i.invoice_date) set.add(i.invoice_date.slice(0, 7)); });
    return Array.from(set).sort().reverse();
  })();

  const periodRange = (): { from: string; to: string } | null => {
    if (period === "all") return null;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (period === "this_month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: ymd(s), to: ymd(e) };
    }
    if (period === "last_month") {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: ymd(s), to: ymd(e) };
    }
    if (period === "custom") {
      if (!from && !to) return null;
      return { from: from || "0000-01-01", to: to || "9999-12-31" };
    }
    // YYYY-MM
    const [y, m] = period.split("-").map(Number);
    const s = new Date(y, m - 1, 1);
    const e = new Date(y, m, 0);
    return { from: ymd(s), to: ymd(e) };
  };

  const range = periodRange();

  const filtered = invoices.filter((i) => {
    if (!isAll && i.company_id !== selected) return false;
    if (companyFilter !== "all" && i.company_id !== companyFilter) return false;
    if (status !== "all" && i.status !== status) return false;
    if (range && i.invoice_date) {
      if (i.invoice_date < range.from || i.invoice_date > range.to) return false;
    }
    if (search) {
      const cl = i.clients as ClientLite | null;
      const s = search.toLowerCase();
      return (i.invoice_number + " " + (cl?.business_name || cl?.client_name || "")).toLowerCase().includes(s);
    }
    return true;
  }).sort((a, b) => {
    // Group by company (alphabetical), then latest invoice number first within each company
    const ca = companies.find((c) => c.id === a.company_id)?.name || "";
    const cb = companies.find((c) => c.id === b.company_id)?.name || "";
    if (ca !== cb) return ca.localeCompare(cb);
    return b.invoice_number.localeCompare(a.invoice_number, undefined, { numeric: true });
  });

  const exportCSV = () => downloadCSV("invoices.csv", filtered.map((i) => {
    const cl = i.clients as ClientLite | null;
    return {
      number: i.invoice_number, date: i.invoice_date,
      client: cl?.business_name || cl?.client_name || "",
      company: companies.find((c) => c.id === i.company_id)?.name || "",
      subtotal: i.subtotal, total: i.total, paid: i.amount_paid, status: i.status,
      reminders_sent: i.reminders_sent ?? 0,
    };
  }));

  const reminderInv = filtered.find((i) => i.id === reminderFor) ?? null;

  const stats = filtered.reduce(
    (a, i) => {
      if (i.status === "cancelled") return a;
      a.total += Number(i.total || 0);
      a.paid += Number(i.amount_paid || 0);
      return a;
    },
    { total: 0, paid: 0 },
  );
  const unpaid = Math.max(0, stats.total - stats.paid);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">{filtered.length} invoices</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><FileDown className="w-4 h-4" />Export</Button>
          <Button asChild><Link to="/invoices/new"><Plus className="w-4 h-4" />New Invoice</Link></Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Sales" value={inr(stats.total)} icon={<Receipt className="w-4 h-4" />} tone="primary" />
        <StatCard label="Paid" value={inr(stats.paid)} icon={<IndianRupee className="w-4 h-4" />} tone="success" />
        <StatCard label="Unpaid" value={inr(unpaid)} icon={<AlertCircle className="w-4 h-4" />} tone="destructive" />
      </div>


      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search by number or client…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partially_paid">Partially Paid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Period" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
            {monthOptions.length > 0 && monthOptions.map((m) => {
              const [y, mm] = m.split("-");
              const label = new Date(Number(y), Number(mm) - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
              return <SelectItem key={m} value={m}>{label}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </>
        )}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No invoices found.</div>
          ) : (
            <>
            {/* Mobile card list */}
            <div className="lg:hidden divide-y">
              {filtered.map((i, idx) => {
                const cl = i.clients as ClientLite | null;
                const pending = Number(i.total) - Number(i.amount_paid);
                const canRemind = REMINDABLE.includes(i.status);
                const overdueDays = i.due_date && pending > 0 ? daysBetween(i.due_date) : 0;
                const companyName = companies.find((c) => c.id === i.company_id)?.name || "—";
                const prevCompanyName = idx > 0
                  ? (companies.find((c) => c.id === filtered[idx - 1].company_id)?.name || "—")
                  : null;
                const showGroup = companyName !== prevCompanyName;
                return (
                  <Fragment key={i.id}>
                    {showGroup && (
                      <div className="px-3 py-2 bg-muted/40 text-xs font-semibold uppercase tracking-wide">{companyName}</div>
                    )}
                    <div className="p-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <Link to="/invoices/$id" params={{ id: i.id }} className="font-semibold text-sm hover:underline block truncate">{i.invoice_number}</Link>
                          <p className="text-xs text-muted-foreground truncate">{cl?.business_name || cl?.client_name}</p>
                        </div>
                        <Badge className={`${STATUS_COLORS[i.status]} shrink-0 text-[10px]`} variant="outline">{i.status.replace("_", " ")}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Total</p>
                          <p className="font-semibold">{inr(Number(i.total))}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Pending</p>
                          <p className={`font-semibold ${pending > 0 ? "text-destructive" : ""}`}>{inr(pending)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Date</p>
                          <p>{i.invoice_date ? formatDate(i.invoice_date) : "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Due</p>
                          <p>{pending <= 0 ? "—" : (i.due_date ? formatDate(i.due_date) : "—")}
                          {pending > 0 && overdueDays > 0 && <span className="text-destructive"> · {overdueDays}d</span>}</p>
                        </div>
                      </div>
                      <div className="flex justify-end items-center gap-1 pt-1">
                        {pending > 0 && i.status !== "cancelled" && (
                          <MarkAsPaidButton invoiceId={i.id} pending={pending} />
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem asChild><Link to="/invoices/$id" params={{ id: i.id }}><Eye className="w-4 h-4" /> View</Link></DropdownMenuItem>
                            <DropdownMenuItem asChild><Link to="/invoices/$id/edit" params={{ id: i.id }}><Pencil className="w-4 h-4" /> Edit</Link></DropdownMenuItem>
                            {canRemind && <DropdownMenuItem onSelect={() => setReminderFor(i.id)}><Bell className="w-4 h-4" /> Send Reminder</DropdownMenuItem>}
                            {canRemind && (cl?.whatsapp || cl?.mobile) && (
                              <DropdownMenuItem onSelect={() => {
                                const url = `https://wa.me/${(cl.whatsapp || cl.mobile || "").replace(/\D/g, "")}`;
                                const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
                                document.body.appendChild(a); a.click(); a.remove();
                              }}><MessageCircle className="w-4 h-4" /> WhatsApp</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteFor(i.id)}><Trash2 className="w-4 h-4" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i, idx) => {
                  const cl = i.clients as ClientLite | null;
                  const pending = Number(i.total) - Number(i.amount_paid);
                  const canRemind = REMINDABLE.includes(i.status);
                  const overdueDays = i.due_date && pending > 0 ? daysBetween(i.due_date) : 0;
                  const companyName = companies.find((c) => c.id === i.company_id)?.name || "—";
                  const prevCompanyName = idx > 0
                    ? (companies.find((c) => c.id === filtered[idx - 1].company_id)?.name || "—")
                    : null;
                  const showGroup = companyName !== prevCompanyName;
                  const groupCount = filtered.filter((x) => x.company_id === i.company_id).length;
                  return (
                    <Fragment key={i.id}>
                      {showGroup && (
                        <TableRow key={`group-${i.company_id}`} className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={8} className="py-2 font-sf-display text-sm uppercase tracking-wide">
                            {companyName} <span className="text-muted-foreground normal-case font-normal">· {groupCount} invoice{groupCount === 1 ? "" : "s"}</span>
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow key={i.id}>
                        <TableCell>
                          <Link to="/invoices/$id" params={{ id: i.id }} className="font-medium hover:underline">{i.invoice_number}</Link>
                        </TableCell>
                        <TableCell>{cl?.business_name || cl?.client_name}</TableCell>
                        <TableCell className="text-sm">{i.invoice_date ? formatDate(i.invoice_date) : "—"}</TableCell>
                        <TableCell className="text-sm">
                          {pending <= 0 ? "—" : (i.due_date ? formatDate(i.due_date) : "—")}
                          {pending > 0 && overdueDays > 0 && (
                            <div className="text-xs text-destructive">{overdueDays}d overdue</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{inr(Number(i.total))}</TableCell>
                        <TableCell className="text-right">{inr(pending)}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[i.status]} variant="outline">{i.status.replace("_", " ")}</Badge>
                          {(i.reminders_sent ?? 0) > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">{i.reminders_sent} reminder{i.reminders_sent === 1 ? "" : "s"}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-1">
                            {pending > 0 && i.status !== "cancelled" && (
                              <MarkAsPaidButton invoiceId={i.id} pending={pending} />
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" title="More actions">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem asChild>
                                  <Link to="/invoices/$id" params={{ id: i.id }}>
                                    <Eye className="w-4 h-4" /> View
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to="/invoices/$id/edit" params={{ id: i.id }}>
                                    <Pencil className="w-4 h-4" /> Edit
                                  </Link>
                                </DropdownMenuItem>
                                {canRemind && (
                                  <DropdownMenuItem onSelect={() => setReminderFor(i.id)}>
                                    <Bell className="w-4 h-4" /> Send Reminder
                                  </DropdownMenuItem>
                                )}
                                {canRemind && (cl?.whatsapp || cl?.mobile) && (
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      const url = `https://wa.me/${(cl.whatsapp || cl.mobile || "").replace(/\D/g, "")}`;
                                      const a = document.createElement("a");
                                      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
                                      document.body.appendChild(a); a.click(); a.remove();
                                    }}
                                  >
                                    <MessageCircle className="w-4 h-4" /> WhatsApp
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => setDeleteFor(i.id)}
                                >
                                  <Trash2 className="w-4 h-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>


      {reminderInv && (
        <SendReminderDialog
          open={!!reminderFor}
          onOpenChange={(v) => !v && setReminderFor(null)}
          invoice={{
            id: reminderInv.id,
            invoice_number: reminderInv.invoice_number,
            total: Number(reminderInv.total),
            amount_paid: Number(reminderInv.amount_paid),
            due_date: reminderInv.due_date,
            status: reminderInv.status,
            reminders_sent: reminderInv.reminders_sent,
          }}
          client={reminderInv.clients as ClientLite | null}
          companyName={companies.find((c) => c.id === reminderInv.company_id)?.name}
        />
      )}

      <AlertDialog open={!!deleteFor} onOpenChange={(v) => !v && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the invoice, its line items, and any recorded payments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteFor) del.mutate(deleteFor); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "primary" | "success" | "destructive" }) {
  const toneMap = {
    primary: "border-primary/40 bg-primary/5 text-primary",
    success: "border-success/40 bg-success/5 text-success",
    destructive: "border-destructive/40 bg-destructive/5 text-destructive",
  } as const;
  return (
    <Card className={`border ${toneMap[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium">{icon}{label}</div>
        <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
