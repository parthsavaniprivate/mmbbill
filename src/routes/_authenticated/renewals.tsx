import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertCircle, Clock, FileText, RefreshCw, Receipt } from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/renewals")({ component: RenewalsPage });

const todayStr = () => new Date().toLocaleDateString("en-CA");
const addMonthStr = (s: string, months: number) => {
  const d = new Date(s); d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-CA");
};
const monthsBetween = (from: string, to: string) => {
  const a = new Date(from), b = new Date(to);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
};

function RenewalsPage() {
  const { selected, isAll } = useCompany();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // --- Invoices (pending / overdue / upcoming) ---
  const { data: invoices = [] } = useQuery({
    queryKey: ["renewal-invoices", selected, isAll],
    queryFn: async () => {
      let q = supabase.from("invoices")
        .select("id, invoice_number, invoice_date, due_date, total, amount_paid, status, company_id, client_id, clients(id, client_name, business_name)")
        .in("status", ["pending", "partially_paid", "overdue"])
        .order("due_date", { ascending: true });
      if (!isAll && selected) q = q.eq("company_id", selected);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = todayStr();
  const in30 = addMonthStr(today, 0);
  const in30Date = new Date(); in30Date.setDate(in30Date.getDate() + 30);
  const in30Str = in30Date.toLocaleDateString("en-CA");

  const overdueInv = invoices.filter((i) => (i.due_date ?? today) < today);
  const upcomingInv = invoices.filter((i) => (i.due_date ?? today) >= today && (i.due_date ?? today) <= in30Str);
  const laterInv = invoices.filter((i) => (i.due_date ?? today) > in30Str);

  // --- Packages with unbilled months ---
  const { data: packages = [] } = useQuery({
    queryKey: ["renewal-packages", selected, isAll],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages")
        .select("*, clients(id, client_name, business_name, company_id)")
        .eq("status", "active");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Track last billed date per package (using invoice notes match or last invoice_date per client+package_name)
  const { data: lastBills = [] } = useQuery({
    queryKey: ["renewal-lastbills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices")
        .select("client_id, invoice_date, notes")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const packageRows = packages
    .filter((p) => {
      const cl = p.clients as { company_id: string } | null;
      return isAll || cl?.company_id === selected;
    })
    .map((p) => {
      const cl = p.clients as { id: string; client_name: string; business_name: string | null; company_id: string } | null;
      // find most recent invoice for this client whose notes reference this package name
      const marker = `[pkg:${p.id}]`;
      const lastPkgInv = lastBills.find((b) => b.client_id === cl?.id && (b.notes ?? "").includes(marker));
      const anchor = lastPkgInv?.invoice_date ?? p.start_date ?? today;
      const unbilledMonths = monthsBetween(anchor, today);
      const dueAmount = unbilledMonths * Number(p.monthly_amount ?? 0);
      return { pkg: p, cl, anchor, unbilledMonths, dueAmount };
    })
    .sort((a, b) => b.unbilledMonths - a.unbilledMonths);

  const packagesOverdue = packageRows.filter((r) => r.unbilledMonths >= 1);
  const packagesOk = packageRows.filter((r) => r.unbilledMonths === 0);

  const generateBill = useMutation({
    mutationFn: async (row: (typeof packageRows)[number]) => {
      if (!row.cl) throw new Error("Client missing");
      const companyId = row.cl.company_id;
      const { data: num, error: nErr } = await supabase.rpc("next_invoice_number", { _company_id: companyId, _type: "gst" });
      if (nErr) throw nErr;
      const months = row.unbilledMonths;
      const rate = Number(row.pkg.monthly_amount ?? 0);
      const { data: inv, error } = await supabase.from("invoices").insert({
        company_id: companyId,
        client_id: row.cl.id,
        invoice_number: num as string,
        invoice_type: "gst",
        invoice_date: today,
        due_date: addMonthStr(today, 1),
        gst_rate: 18,
        discount: 0,
        notes: `Package renewal: ${row.pkg.name} [pkg:${row.pkg.id}]`,
        terms: "Payment due within 30 days.",
        status: "pending",
      }).select("id").single();
      if (error) throw error;
      const { error: itemErr } = await supabase.from("invoice_items").insert({
        invoice_id: inv!.id,
        description: `${row.pkg.name} — ${months} month${months > 1 ? "s" : ""}`,
        quantity: months,
        rate,
        amount: months * rate,
      });
      if (itemErr) throw itemErr;
      return inv!.id;
    },
    onSuccess: (id) => {
      toast.success("Invoice generated");
      qc.invalidateQueries({ queryKey: ["renewal-invoices"] });
      qc.invalidateQueries({ queryKey: ["renewal-lastbills"] });
      navigate({ to: "/invoices/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusBadge = (s: string) => {
    const v = s === "overdue" ? "destructive" : s === "partially_paid" ? "secondary" : "outline";
    return <Badge variant={v}>{s.replace("_", " ")}</Badge>;
  };

  const invoiceTable = (rows: typeof invoices, empty: string) => (
    rows.length === 0 ? <div className="p-8 text-center text-muted-foreground text-sm">{empty}</div> : (
      <Table>
        <TableHeader><TableRow>
          <TableHead>Invoice</TableHead><TableHead>Client</TableHead><TableHead>Due Date</TableHead>
          <TableHead>Total</TableHead><TableHead>Balance</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((i) => {
            const cl = i.clients as { id: string; client_name: string; business_name: string | null } | null;
            const balance = Number(i.total ?? 0) - Number(i.amount_paid ?? 0);
            return (
              <TableRow key={i.id}>
                <TableCell><Link to="/invoices/$id" params={{ id: i.id }} className="font-medium hover:underline">{i.invoice_number}</Link></TableCell>
                <TableCell>{cl?.business_name || cl?.client_name || "—"}</TableCell>
                <TableCell>{formatDate(i.due_date)}</TableCell>
                <TableCell>{inr(Number(i.total))}</TableCell>
                <TableCell className="font-semibold">{inr(balance)}</TableCell>
                <TableCell>{statusBadge(i.status as string)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/invoices/$id" params={{ id: i.id }}><FileText className="w-4 h-4" />Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    )
  );

  const packageTable = (rows: typeof packageRows, empty: string) => (
    rows.length === 0 ? <div className="p-8 text-center text-muted-foreground text-sm">{empty}</div> : (
      <Table>
        <TableHeader><TableRow>
          <TableHead>Client</TableHead><TableHead>Package</TableHead><TableHead>Monthly</TableHead>
          <TableHead>Last Billed</TableHead><TableHead>Unbilled Months</TableHead><TableHead>Amount Due</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.pkg.id}>
              <TableCell>
                <Link to="/clients/$id" params={{ id: r.cl?.id ?? "" }} className="font-medium hover:underline">
                  {r.cl?.business_name || r.cl?.client_name}
                </Link>
              </TableCell>
              <TableCell>{r.pkg.name}</TableCell>
              <TableCell>{inr(Number(r.pkg.monthly_amount))}</TableCell>
              <TableCell>{formatDate(r.anchor)}</TableCell>
              <TableCell>
                <Badge variant={r.unbilledMonths >= 2 ? "destructive" : r.unbilledMonths >= 1 ? "secondary" : "outline"}>
                  {r.unbilledMonths} month{r.unbilledMonths === 1 ? "" : "s"}
                </Badge>
              </TableCell>
              <TableCell className="font-semibold">{inr(r.dueAmount)}</TableCell>
              <TableCell className="text-right">
                {r.unbilledMonths >= 1 ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm"><Receipt className="w-4 h-4" />Generate Bill</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Generate invoice for {r.unbilledMonths} month{r.unbilledMonths > 1 ? "s" : ""}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {r.cl?.business_name || r.cl?.client_name} — {r.pkg.name} × {r.unbilledMonths} @ {inr(Number(r.pkg.monthly_amount))}/mo = <strong>{inr(r.dueAmount)}</strong> (before GST).
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => generateBill.mutate(r)}>Generate</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : <span className="text-xs text-muted-foreground">Up to date</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Renewals & Dues</h1>
        <p className="text-muted-foreground">Overdue invoices, upcoming dues, and package billing</p>
      </div>

      <Card className="border-destructive/40">
        <CardContent className="p-0">
          <div className="p-4 border-b font-semibold flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />Overdue Invoices ({overdueInv.length})
          </div>
          {invoiceTable(overdueInv, "No overdue invoices.")}
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardContent className="p-0">
          <div className="p-4 border-b font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4" />Due in next 30 days ({upcomingInv.length})
          </div>
          {invoiceTable(upcomingInv, "Nothing due in the next 30 days.")}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardContent className="p-0">
          <div className="p-4 border-b font-semibold flex items-center gap-2 text-destructive">
            <RefreshCw className="w-4 h-4" />Package Bills Pending ({packagesOverdue.length})
          </div>
          {packageTable(packagesOverdue, "All packages are billed up to date.")}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b font-semibold text-muted-foreground">Later invoices ({laterInv.length})</div>
          {invoiceTable(laterInv, "No future dues.")}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b font-semibold text-muted-foreground">Packages up to date ({packagesOk.length})</div>
          {packageTable(packagesOk, "No active packages.")}
        </CardContent>
      </Card>
    </div>
  );
}
