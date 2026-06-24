import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileDown, Eye, FileText, CheckCircle2, Clock, XCircle, Wallet } from "lucide-react";
import { inr, formatDate, downloadCSV } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["quotation_status"];
type ClientLite = { client_name: string; business_name: string | null; whatsapp: string | null; mobile: string | null } | null;

export const Route = createFileRoute("/_authenticated/quotations/")({ component: QuotationsPage });

const STATUS_COLORS: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/15 text-primary border-primary/30",
  accepted: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

function QuotationsPage() {
  const { selected, isAll, companies } = useCompany();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data: quotations = [] } = useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      const { data } = await supabase.from("quotations")
        .select("*, clients(client_name, business_name, whatsapp, mobile)")
        .order("quotation_date", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = useMemo(() => quotations.filter((q) => {
    if (!isAll && q.company_id !== selected) return false;
    if (status !== "all" && q.status !== status) return false;
    if (search) {
      const cl = q.clients as ClientLite;
      const s = search.toLowerCase();
      return (q.quotation_number + " " + (cl?.business_name || cl?.client_name || "")).toLowerCase().includes(s);
    }
    return true;
  }), [quotations, isAll, selected, status, search]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const accepted = filtered.filter((q) => q.status === "accepted").length;
    const pending = filtered.filter((q) => q.status === "draft" || q.status === "sent").length;
    const rejected = filtered.filter((q) => q.status === "rejected").length;
    const value = filtered.reduce((s, q) => s + Number(q.total || 0), 0);
    return { total, accepted, pending, rejected, value };
  }, [filtered]);

  const exportCSV = () => downloadCSV("quotations.csv", filtered.map((q) => {
    const cl = q.clients as ClientLite;
    return {
      number: q.quotation_number, date: q.quotation_date, valid_until: q.valid_until,
      client: cl?.business_name || cl?.client_name || "",
      company: companies.find((c) => c.id === q.company_id)?.name || "",
      subtotal: q.subtotal, total: q.total, status: q.status,
    };
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quotations</h1>
          <p className="text-muted-foreground">{filtered.length} quotations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><FileDown className="w-4 h-4" />Export</Button>
          <Button asChild><Link to="/quotations/new"><Plus className="w-4 h-4" />New Quotation</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        <StatCard icon={<FileText className="w-4 h-4" />} label="Total" value={String(stats.total)} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Accepted" value={String(stats.accepted)} tone="success" />
        <StatCard icon={<Clock className="w-4 h-4" />} label="Pending" value={String(stats.pending)} tone="warning" />
        <StatCard icon={<XCircle className="w-4 h-4" />} label="Rejected" value={String(stats.rejected)} tone="destructive" />
        <StatCard icon={<Wallet className="w-4 h-4" />} label="Total Value" value={inr(stats.value)} tone="primary" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search by number or client…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No quotations found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q) => {
                  const cl = q.clients as ClientLite;
                  return (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Link to="/quotations/$id" params={{ id: q.id }} className="font-medium hover:underline">{q.quotation_number}</Link>
                      </TableCell>
                      <TableCell>{cl?.business_name || cl?.client_name || "—"}</TableCell>
                      <TableCell className="text-sm">{formatDate(q.quotation_date)}</TableCell>
                      <TableCell className="text-sm">{q.valid_until ? formatDate(q.valid_until) : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{inr(Number(q.total))}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[q.status]} variant="outline">{q.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost"><Link to="/quotations/$id" params={{ id: q.id }}><Eye className="w-4 h-4" /></Link></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "success" | "warning" | "destructive" | "primary" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <Card className="shadow-card">
      <CardContent className="p-3 sm:p-4">
        <div className={`flex items-center gap-2 text-xs ${toneCls}`}>{icon}<span className="truncate">{label}</span></div>
        <div className="mt-1 text-lg sm:text-xl font-bold truncate">{value}</div>
      </CardContent>
    </Card>
  );
}
