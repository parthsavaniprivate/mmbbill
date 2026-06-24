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
import { Plus, FileDown, Eye, Users, Wallet, Calendar, Clock } from "lucide-react";
import { inr, downloadCSV } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/salary/")({ component: SalaryPage });

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function SalaryPage() {
  const { selected, isAll } = useCompany();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));

  const { data: slips = [] } = useQuery({
    queryKey: ["salary-slips"],
    queryFn: async () => {
      const { data } = await supabase.from("salary_slips")
        .select("*, employees(name, employee_code, designation)")
        .order("year", { ascending: false }).order("month", { ascending: false });
      return data ?? [];
    },
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-count"],
    queryFn: async () => (await supabase.from("employees").select("id, company_id, is_active")).data ?? [],
  });

  const filtered = useMemo(() => slips.filter((s) => {
    if (!isAll && s.company_id !== selected) return false;
    if (status !== "all" && s.status !== status) return false;
    if (year !== "all" && String(s.year) !== year) return false;
    if (search) {
      const emp = s.employees as { name: string; employee_code: string | null } | null;
      const q = search.toLowerCase();
      return (emp?.name || "").toLowerCase().includes(q) || (emp?.employee_code || "").toLowerCase().includes(q);
    }
    return true;
  }), [slips, isAll, selected, status, year, search]);

  const stats = useMemo(() => {
    const empCount = employees.filter((e) => (isAll || e.company_id === selected) && e.is_active).length;
    const totalPaid = slips.filter((s) => (isAll || s.company_id === selected) && s.status === "paid").reduce((a, s) => a + Number(s.net), 0);
    const currentMonth = slips.filter((s) => (isAll || s.company_id === selected) && s.year === now.getFullYear() && s.month === now.getMonth() + 1).reduce((a, s) => a + Number(s.net), 0);
    const pending = slips.filter((s) => (isAll || s.company_id === selected) && s.status === "draft").reduce((a, s) => a + Number(s.net), 0);
    return { empCount, totalPaid, currentMonth, pending };
  }, [employees, slips, isAll, selected, now]);

  const exportCSV = () => downloadCSV("salary-slips.csv", filtered.map((s) => {
    const emp = s.employees as { name: string; employee_code: string | null } | null;
    return {
      employee: emp?.name, code: emp?.employee_code, month: MONTHS[s.month - 1], year: s.year,
      gross: s.gross, deductions: s.total_deductions, net: s.net, status: s.status,
    };
  }));

  const years = Array.from(new Set(slips.map((s) => s.year))).sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Salary Slips</h1>
          <p className="text-muted-foreground">{filtered.length} slips</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><FileDown className="w-4 h-4" />Export</Button>
          <Button asChild><Link to="/salary/new"><Plus className="w-4 h-4" />New Slip</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <StatCard icon={<Users className="w-4 h-4" />} label="Employees" value={String(stats.empCount)} />
        <StatCard icon={<Wallet className="w-4 h-4" />} label="Total Salary Paid" value={inr(stats.totalPaid)} tone="success" />
        <StatCard icon={<Calendar className="w-4 h-4" />} label="Current Month" value={inr(stats.currentMonth)} tone="primary" />
        <StatCard icon={<Clock className="w-4 h-4" />} label="Pending" value={inr(stats.pending)} tone="warning" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No salary slips yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const emp = s.employees as { name: string; employee_code: string | null; designation: string | null } | null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link to="/salary/$id" params={{ id: s.id }} className="font-medium hover:underline">{emp?.name}</Link>
                        <div className="text-xs text-muted-foreground">{emp?.employee_code} • {emp?.designation}</div>
                      </TableCell>
                      <TableCell>{MONTHS[s.month - 1]} {s.year}</TableCell>
                      <TableCell className="text-right">{inr(Number(s.gross))}</TableCell>
                      <TableCell className="text-right text-destructive">{inr(Number(s.total_deductions))}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(Number(s.net))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.status === "paid" ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost"><Link to="/salary/$id" params={{ id: s.id }}><Eye className="w-4 h-4" /></Link></Button>
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

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "success" | "warning" | "primary" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <Card className="shadow-card">
      <CardContent className="p-3 sm:p-4">
        <div className={`flex items-center gap-2 text-xs ${toneCls}`}>{icon}<span className="truncate">{label}</span></div>
        <div className="mt-1 text-lg sm:text-xl font-bold truncate">{value}</div>
      </CardContent>
    </Card>
  );
}
