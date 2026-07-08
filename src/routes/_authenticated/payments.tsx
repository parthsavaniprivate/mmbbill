import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown } from "lucide-react";
import { inr, formatDate, downloadCSV } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
  loader: ({ context }) => {
    context.queryClient.prefetchQuery({
      queryKey: ["payments-all"],
      queryFn: async () => {
        const { data } = await supabase.from("payments")
          .select("*, invoices(invoice_number, company_id, clients(client_name, business_name))")
          .order("payment_date", { ascending: false });
        return data ?? [];
      },
    });
  },
});

function PaymentsPage() {
  const { selected, isAll } = useCompany();
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");

  const { data: payments = [] } = useQuery({
    queryKey: ["payments-all"],
    queryFn: async () => {
      const { data } = await supabase.from("payments")
        .select("*, invoices(invoice_number, company_id, clients(client_name, business_name))")
        .order("payment_date", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = payments.filter((p) => {
    const inv = p.invoices as { invoice_number: string; company_id: string; clients: { client_name: string; business_name: string | null } | null } | null;
    if (!isAll && inv?.company_id !== selected) return false;
    if (method !== "all" && p.method !== method) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = inv?.clients?.business_name || inv?.clients?.client_name || "";
      return ((inv?.invoice_number || "") + " " + name).toLowerCase().includes(s);
    }
    return true;
  });

  const total = filtered.reduce((s, p) => s + Number(p.amount), 0);

  const exportCSV = () => downloadCSV("payments.csv", filtered.map((p) => {
    const inv = p.invoices as { invoice_number: string; clients: { client_name: string; business_name: string | null } | null } | null;
    return {
      date: p.payment_date, invoice: inv?.invoice_number,
      client: inv?.clients?.business_name || inv?.clients?.client_name,
      amount: p.amount, method: p.method, reference: p.reference,
    };
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">{filtered.length} payments · {inr(total)} total</p>
        </div>
        <Button variant="outline" onClick={exportCSV}><FileDown className="w-4 h-4" />Export</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            <SelectItem value="upi">UPI</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No payments.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Client</TableHead>
              <TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const inv = p.invoices as { invoice_number: string; clients: { client_name: string; business_name: string | null } | null } | null;
                return (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.payment_date)}</TableCell>
                    <TableCell><Link to="/invoices/$id" params={{ id: p.invoice_id }} className="font-medium hover:underline">{inv?.invoice_number}</Link></TableCell>
                    <TableCell>{inv?.clients?.business_name || inv?.clients?.client_name}</TableCell>
                    <TableCell><Badge variant="outline">{p.method.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{inr(Number(p.amount))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
