import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Plus, FileDown, Eye, MessageCircle, Bell, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { inr, formatDate, downloadCSV } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";
import { SendReminderDialog, MarkAsPaidButton } from "@/components/invoices/SendReminderDialog";
import { daysBetween } from "@/lib/reminders";
import { toast } from "sonner";

type Status = Database["public"]["Enums"]["invoice_status"];
type ClientLite = { client_name: string; business_name: string | null; whatsapp: string | null; mobile: string | null };

export const Route = createFileRoute("/_authenticated/invoices/")({ component: InvoicesPage });

const STATUS_COLORS: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning/15 text-warning-foreground border-warning/30",
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

  const filtered = invoices.filter((i) => {
    if (!isAll && i.company_id !== selected) return false;
    if (companyFilter !== "all" && i.company_id !== companyFilter) return false;
    if (status !== "all" && i.status !== status) return false;
    if (search) {
      const cl = i.clients as ClientLite | null;
      const s = search.toLowerCase();
      return (i.invoice_number + " " + (cl?.business_name || cl?.client_name || "")).toLowerCase().includes(s);
    }
    return true;
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
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No invoices found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => {
                  const cl = i.clients as ClientLite | null;
                  const pending = Number(i.total) - Number(i.amount_paid);
                  const canRemind = REMINDABLE.includes(i.status);
                  const overdueDays = i.due_date && pending > 0 ? daysBetween(i.due_date) : 0;
                  return (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link to="/invoices/$id" params={{ id: i.id }} className="font-medium hover:underline">{i.invoice_number}</Link>
                      </TableCell>
                      <TableCell>{cl?.business_name || cl?.client_name}</TableCell>
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
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="ghost" title="View">
                            <Link to="/invoices/$id" params={{ id: i.id }}><Eye className="w-4 h-4" /></Link>
                          </Button>
                          {canRemind && (
                            <Button size="sm" variant="outline" onClick={() => setReminderFor(i.id)} title="Send Reminder">
                              <Bell className="w-4 h-4" />
                            </Button>
                          )}
                          {canRemind && (cl?.whatsapp || cl?.mobile) && (
                            <Button size="sm" variant="ghost" title="Open WhatsApp"
                              onClick={() => {
                                const url = `https://wa.me/${(cl.whatsapp || cl.mobile || "").replace(/\D/g, "")}`;
                                const a = document.createElement("a");
                                a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
                                document.body.appendChild(a); a.click(); a.remove();
                              }}
                            ><MessageCircle className="w-4 h-4" /></Button>
                          )}
                          {pending > 0 && i.status !== "cancelled" && (
                            <MarkAsPaidButton invoiceId={i.id} pending={pending} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
    </div>
  );
}
