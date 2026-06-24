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
        <div className="p-8 bg-white text-black text-[13px]">
          {/* Title */}
          <div className="text-center text-2xl font-semibold tracking-wide mb-5">Salary Slip</div>

          {/* Pay meta + Company block */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <Row k="Pay Period" v={period} />
              <Row k="Pay Date" v={s.pay_date ? formatDate(s.pay_date) : "—"} />
              <Row k="Worked Days" v={s.worked_days != null ? String(s.worked_days) : "—"} />
            </div>
            <div className="text-right">
              {co?.logo_url && <img src={co.logo_url} alt="" className="h-10 ml-auto mb-1 object-contain" />}
              <div className="font-bold">{co?.name}</div>
              <div className="text-xs text-gray-600 whitespace-pre-line">{co?.address}</div>
            </div>
          </div>

          {/* Employee block */}
          <div className="grid grid-cols-[140px_1fr] gap-y-1 mb-4 text-sm">
            <div className="text-gray-600">Employee Name</div><div className="font-medium">{empName}</div>
            <div className="text-gray-600">Designation</div><div>{s.designation || "—"}</div>
            <div className="text-gray-600">Department</div><div>{s.department || "—"}</div>
          </div>

          {/* Earnings + Deductions tables */}
          <div className="grid grid-cols-2 gap-0 border border-gray-800">
            <div className="border-r border-gray-800">
              <HeaderRow left="Earnings" right="Amount" />
              <LineRow left="Basic Pay" right={inr(Number(s.basic))} />
              <LineRow left="Incentive Pay" right={inr(Number(s.incentives))} />
              <LineRow left="" right="" />
              <LineRow left="" right="" />
              <TotalRow left="Total Earnings" right={inr(totalEarnings)} />
            </div>
            <div>
              <HeaderRow left="Deductions" right="Amount" />
              <LineRow left="Provident Fund" right={inr(Number(s.pf))} />
              <LineRow left="Professional Tax" right={inr(Number(s.prof_tax))} />
              <LineRow left="Loan" right={inr(Number(s.loan))} />
              <LineRow left="" right="" />
              <TotalRow left="Total Deductions" right={inr(totalDed)} />
            </div>
          </div>

          {/* Net Pay */}
          <div className="border border-t-0 border-gray-800 bg-gray-100 flex justify-between px-3 py-2 font-bold">
            <span>Net Pay</span><span>{inr(net)}</span>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-14">
            <div className="text-center text-xs">
              <div className="border-t border-gray-500 pt-1">Employer Signature</div>
            </div>
            <div className="text-center text-xs">
              <div className="border-t border-gray-500 pt-1">Employee Signature</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2 text-sm"><span className="text-gray-600 w-24">{k}</span><span className="font-medium">{v}</span></div>;
}
function HeaderRow({ left, right }: { left: string; right: string }) {
  return <div className="flex justify-between bg-gray-200 px-3 py-1.5 font-semibold border-b border-gray-800"><span>{left}</span><span>{right}</span></div>;
}
function LineRow({ left, right }: { left: string; right: string }) {
  return <div className="flex justify-between px-3 py-1.5 border-b border-gray-300 min-h-[30px]"><span>{left}</span><span>{right}</span></div>;
}
function TotalRow({ left, right }: { left: string; right: string }) {
  return <div className="flex justify-between px-3 py-1.5 font-semibold bg-gray-50"><span>{left}</span><span>{right}</span></div>;
}
