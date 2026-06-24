import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, MessageCircle, Mail, Trash2 } from "lucide-react";
import { inr, formatDate, amountInWords } from "@/lib/format";
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
  const emp = s.employees as { name: string; employee_code: string | null; designation: string | null; department: string | null; mobile: string | null; email: string | null; pan: string | null; bank_account: string | null; uan: string | null; joining_date: string | null } | null;
  const co = s.companies as { name: string; address: string | null; logo_url: string | null; signature_url: string | null; phone: string | null; email: string | null } | null;

  const earnings = [
    ["Basic", s.basic], ["HRA", s.hra], ["Conveyance", s.conveyance], ["Medical", s.medical],
    ["Bonus", s.bonus], ["Incentives", s.incentives], ["Overtime", s.overtime],
  ] as const;
  const deductions = [
    ["PF", s.pf], ["ESI", s.esi], ["Professional Tax", s.prof_tax], ["TDS", s.tds], ["Other", s.other_deductions],
  ] as const;

  const waMsg = `Hi ${emp?.name ?? ""},\n\nYour salary slip for ${MONTHS[s.month - 1]} ${s.year}:\nGross: ${inr(Number(s.gross))}\nDeductions: ${inr(Number(s.total_deductions))}\n*Net: ${inr(Number(s.net))}*\n\n${co?.name ?? ""}`;
  const waNum = (emp?.mobile || "").replace(/\D/g, "");
  const waLink = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}` : null;
  const mailLink = emp?.email ? `mailto:${emp.email}?subject=${encodeURIComponent(`Salary Slip - ${MONTHS[s.month - 1]} ${s.year}`)}&body=${encodeURIComponent(waMsg)}` : null;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
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
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" />Print / PDF</Button>
          {waLink && <Button variant="outline" onClick={() => window.open(waLink, "_blank")}><MessageCircle className="w-4 h-4" />WhatsApp</Button>}
          {mailLink && <Button variant="outline" onClick={() => { window.location.href = mailLink; }}><Mail className="w-4 h-4" />Email</Button>}
          <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this slip?")) del.mutate(); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </div>
      </div>

      <Card className="shadow-card print:shadow-none overflow-hidden">
        <div className="p-10 bg-white text-black space-y-5">
          <div className="flex justify-between items-start gap-4 border-b pb-4">
            <div>
              {co?.logo_url && <img src={co.logo_url} alt="" className="h-14 mb-2 object-contain" />}
              <div className="font-bold text-lg">{co?.name}</div>
              <div className="text-xs text-gray-600 whitespace-pre-line">{co?.address}</div>
              <div className="text-xs text-gray-600">{co?.phone} • {co?.email}</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold tracking-tight">SALARY SLIP</div>
              <div className="text-sm mt-1">{MONTHS[s.month - 1]} {s.year}</div>
              <Badge className="mt-2" variant="outline">{s.status}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm border p-3 rounded">
            <Info label="Employee Name" value={emp?.name ?? "—"} />
            <Info label="Employee ID" value={emp?.employee_code ?? "—"} />
            <Info label="Designation" value={emp?.designation ?? "—"} />
            <Info label="Department" value={emp?.department ?? "—"} />
            <Info label="Joining Date" value={emp?.joining_date ? formatDate(emp.joining_date) : "—"} />
            <Info label="UAN" value={emp?.uan ?? "—"} />
            <Info label="PAN" value={emp?.pan ?? "—"} />
            <Info label="Bank A/C" value={emp?.bank_account ?? "—"} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="bg-gray-100 px-3 py-1.5 font-semibold text-sm border">Earnings</div>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {earnings.map(([label, val]) => (
                    <tr key={label} className="border-b">
                      <td className="p-2">{label}</td>
                      <td className="p-2 text-right">{inr(Number(val))}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-gray-50">
                    <td className="p-2">Gross Salary</td>
                    <td className="p-2 text-right">{inr(Number(s.gross))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <div className="bg-gray-100 px-3 py-1.5 font-semibold text-sm border">Deductions</div>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {deductions.map(([label, val]) => (
                    <tr key={label} className="border-b">
                      <td className="p-2">{label}</td>
                      <td className="p-2 text-right">{inr(Number(val))}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-gray-50">
                    <td className="p-2">Total Deductions</td>
                    <td className="p-2 text-right">{inr(Number(s.total_deductions))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-2 border-gray-800 p-3 flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-600">NET SALARY</div>
              <div className="text-xs italic">{amountInWords(Math.round(Number(s.net)))} Rupees Only</div>
            </div>
            <div className="text-2xl font-bold">{inr(Number(s.net))}</div>
          </div>

          <div className="flex justify-between pt-8">
            <div className="text-xs text-gray-500">This is a computer-generated salary slip and does not require a physical signature.</div>
            <div className="text-center">
              {co?.signature_url && <img src={co.signature_url} alt="" className="h-12 mx-auto object-contain" />}
              <div className="border-t border-gray-400 pt-1 mt-1 text-xs">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span className="text-gray-500 text-xs">{label}: </span><span className="font-medium">{value}</span></div>;
}
