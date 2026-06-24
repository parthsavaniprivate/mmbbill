import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, MessageCircle, Mail, Trash2, Pencil } from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import mmbLogo from "@/assets/make-me-brand-logo.png.asset.json";

type Status = Database["public"]["Enums"]["salary_status"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export const Route = createFileRoute("/_authenticated/salary/$id")({ component: SalarySlipDetail });

function SalarySlipDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["salary-slip", id],
    queryFn: async () => {
      const { data: s } = await supabase.from("salary_slips")
        .select("*, employees(*), companies(*)").eq("id", id).maybeSingle();
      return s;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: Status) => {
      const { error } = await supabase.from("salary_slips").update({ status, paid_on: status === "paid" ? new Date().toISOString().slice(0, 10) : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["salary-slip", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("salary_slips").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); navigate({ to: "/salary" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <div className="text-muted-foreground">Loading…</div>;
  const s = data;
  const emp = s.employees as { name: string; mobile: string | null; email: string | null } | null;
  const co = s.companies as { name: string; address: string | null; logo_url: string | null } | null;

  const empName = s.employee_name || emp?.name || "—";
  const period = `${MONTHS[s.month - 1]} ${s.year}`;
  const totalEarnings = Number(s.basic) + Number(s.incentives);
  const totalDed = Number(s.pf) + Number(s.prof_tax) + Number(s.loan);
  const net = totalEarnings - totalDed;

  const waMsg = `Hi ${empName},\n\nYour salary slip for ${period}:\nTotal Earnings: ${inr(totalEarnings)}\nDeductions: ${inr(totalDed)}\n*Net Pay: ${inr(net)}*\n\n${co?.name ?? ""}`;
  const waNum = (emp?.mobile || "").replace(/\D/g, "");
  const waLink = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}` : null;
  const mailLink = emp?.email ? `mailto:${emp.email}?subject=${encodeURIComponent(`Salary Slip - ${period}`)}&body=${encodeURIComponent(waMsg)}` : null;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4; margin: 14mm; } }`}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/salary" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Link>
        <div className="flex flex-wrap gap-2">
          <Select value={s.status} onValueChange={(v) => setStatus.mutate(v as Status)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" asChild><Link to="/salary/$id/edit" params={{ id }}><Pencil className="w-4 h-4" />Edit</Link></Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" />Print / PDF</Button>
          {waLink && <Button variant="outline" onClick={() => window.open(waLink, "_blank")}><MessageCircle className="w-4 h-4" />WhatsApp</Button>}
          {mailLink && <Button variant="outline" onClick={() => { window.location.href = mailLink; }}><Mail className="w-4 h-4" />Email</Button>}
          <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this slip?")) del.mutate(); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </div>
      </div>

      <Card className="shadow-card print:shadow-none overflow-hidden">
        <div className="p-10 bg-white text-black text-[13px]">
          {/* Top: title left, logo + address right */}
          <div className="flex items-start justify-between mb-8">
            <h2 className="text-3xl font-bold">Salary Slip</h2>
            <div className="text-right">
              <img src={co?.logo_url || mmbLogo.url} alt="" className="h-14 ml-auto object-contain mb-1" />
              <div className="text-xs text-gray-700 whitespace-pre-line max-w-[260px]">{co?.address}</div>
            </div>
          </div>

          {/* Two-column meta */}
          <div className="grid grid-cols-2 gap-x-10 gap-y-1.5 mb-6 text-sm">
            <MetaRow k="Pay Period" v={period} />
            <MetaRow k="Employee Name" v={empName} />
            <MetaRow k="Pay Date" v={s.pay_date ? formatDate(s.pay_date) : "—"} />
            <MetaRow k="Designation" v={s.designation || "—"} />
            <MetaRow k="Worked Days" v={s.worked_days != null ? String(s.worked_days) : "—"} />
            <MetaRow k="Department" v={s.department || "—"} />
          </div>

          {/* Single combined table: Earnings | Amount | Deductions | Amount */}
          <table className="w-full border border-gray-800 border-collapse text-sm">
            <thead>
              <tr className="bg-gray-200">
                <Th>Earnings</Th><Th className="text-right">Amount</Th>
                <Th>Deductions</Th><Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Basic Pay</Td><Td className="text-right">{inr(Number(s.basic))}</Td>
                <Td>Provident Fund</Td><Td className="text-right">{Number(s.pf) ? inr(Number(s.pf)) : "—"}</Td>
              </tr>
              <tr>
                <Td>Incentive Pay</Td><Td className="text-right">{Number(s.incentives) ? inr(Number(s.incentives)) : "—"}</Td>
                <Td>Professional Tax</Td><Td className="text-right">{Number(s.prof_tax) ? inr(Number(s.prof_tax)) : "—"}</Td>
              </tr>
              <tr>
                <Td>&nbsp;</Td><Td></Td>
                <Td>Loan</Td><Td className="text-right">{Number(s.loan) ? inr(Number(s.loan)) : "—"}</Td>
              </tr>
              <tr>
                <Td>&nbsp;</Td><Td></Td>
                <Td className="font-semibold">Total Deductions</Td><Td className="text-right font-semibold">{totalDed ? inr(totalDed) : "—"}</Td>
              </tr>
              <tr className="bg-gray-50">
                <Td className="font-semibold">Total Earnings</Td>
                <Td className="text-right font-semibold">{inr(totalEarnings)}</Td>
                <Td className="font-semibold">Net Pay</Td>
                <Td className="text-right font-bold">{inr(net)}</Td>
              </tr>
            </tbody>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-10 pt-20">
            <div className="text-sm"><div className="border-t border-gray-800 pt-1">Employer Signature</div></div>
            <div className="text-sm text-right"><div className="border-t border-gray-800 pt-1">Employee Signature</div></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex">
      <span className="w-36 text-gray-700">{k}</span>
      <span className="mr-2">:</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`border border-gray-800 px-3 py-2 font-semibold text-left ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-gray-800 px-3 py-2 align-top ${className}`}>{children}</td>;
}

