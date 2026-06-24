import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, MessageCircle, Mail, FileText, Trash2 } from "lucide-react";
import { inr, formatDate, amountInWords } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["quotation_status"];

export const Route = createFileRoute("/_authenticated/quotations/$id")({ component: QuotationDetail });

function QuotationDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["quotation", id],
    queryFn: async () => {
      const { data: q } = await supabase.from("quotations")
        .select("*, clients(*), companies(*)").eq("id", id).maybeSingle();
      const { data: items } = await supabase.from("quotation_items").select("*").eq("quotation_id", id).order("position");
      return { q, items: items ?? [] };
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: Status) => {
      const { error } = await supabase.from("quotations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["quotation", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!data?.q) throw new Error("Loading");
      const q = data.q;
      const { data: num, error: nErr } = await supabase.rpc("next_invoice_number", { _company_id: q.company_id, _type: "gst" });
      if (nErr) throw nErr;
      if (!q.client_id) throw new Error("Quotation has no client — add one first");
      const { data: inv, error } = await supabase.from("invoices").insert({
        company_id: q.company_id, client_id: q.client_id,
        invoice_number: num as string, invoice_type: "gst",
        invoice_date: new Date().toISOString().slice(0, 10),
        gst_rate: Number(q.gst_rate), discount: Number(q.discount),
        notes: q.notes, terms: q.terms,
      }).select().single();
      if (error) throw error;
      const { error: itErr } = await supabase.from("invoice_items").insert(
        data.items.map((it, idx) => ({
          invoice_id: inv.id, description: it.item_name + (it.description ? ` — ${it.description}` : ""),
          quantity: Number(it.quantity), rate: Number(it.unit_price),
          amount: Number(it.amount), position: idx,
        }))
      );
      if (itErr) throw itErr;
      await supabase.from("quotations").update({ converted_invoice_id: inv.id, status: "accepted" }).eq("id", id);
      return inv.id;
    },
    onSuccess: (invId) => { toast.success("Converted to invoice"); navigate({ to: "/invoices/$id", params: { id: invId } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("quotations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); navigate({ to: "/quotations" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.q) return <div className="text-muted-foreground">Loading…</div>;
  const q = data.q;
  const cl = q.clients as { client_name: string; business_name: string | null; gst_number: string | null; address: string | null; email: string | null; mobile: string | null; whatsapp: string | null } | null;
  const co = q.companies as { name: string; address: string | null; gst_number: string | null; phone: string | null; email: string | null; logo_url: string | null; signature_url: string | null } | null;

  const clientDisplay = cl?.business_name || cl?.client_name || (q as { custom_client_name?: string | null }).custom_client_name || "—";
  const waNum = (cl?.whatsapp || cl?.mobile || "").replace(/\D/g, "");
  const waMsg = `Hi ${cl?.client_name ?? clientDisplay},\n\nPlease find quotation *${q.quotation_number}* for ${inr(Number(q.total))}.\n\nThanks,\n${co?.name ?? ""}`;
  const waLink = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}` : null;
  const mailLink = cl?.email ? `mailto:${cl.email}?subject=${encodeURIComponent(`Quotation ${q.quotation_number}`)}&body=${encodeURIComponent(waMsg)}` : null;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/quotations" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Link>
        <div className="flex flex-wrap gap-2">
          <Select value={q.status} onValueChange={(v) => setStatus.mutate(v as Status)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" />Print / PDF</Button>
          {waLink && <Button variant="outline" onClick={() => window.open(waLink, "_blank")}><MessageCircle className="w-4 h-4" />WhatsApp</Button>}
          {mailLink && <Button variant="outline" onClick={() => { window.location.href = mailLink; }}><Mail className="w-4 h-4" />Email</Button>}
          {!q.converted_invoice_id && (
            <Button onClick={() => convert.mutate()} disabled={convert.isPending}><FileText className="w-4 h-4" />Convert to Invoice</Button>
          )}
          {q.converted_invoice_id && (
            <Button asChild variant="secondary"><Link to="/invoices/$id" params={{ id: q.converted_invoice_id }}>View Invoice</Link></Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this quotation?")) del.mutate(); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </div>
      </div>

      <style>{`@media print { @page { size: A4 portrait; margin: 0; } body { background: white; } .no-print { display: none !important; } .q-doc { box-shadow: none !important; } } .q-accent { color: #c8962d; } .q-bar { background: #c8962d; } .q-h { position: relative; display: inline-block; padding-bottom: 4px; } .q-h::after { content: ""; position: absolute; left: 0; bottom: 0; width: 42px; height: 2px; background: #c8962d; border-radius: 2px; }`}</style>

      <Card className="shadow-card print:shadow-none overflow-hidden q-doc">
        <div className="bg-white text-black px-10 py-8 mx-auto" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", width: "210mm", minHeight: "297mm", fontSize: "11px", lineHeight: 1.45 }}>
          {/* HEADER */}
          <div className="flex items-start justify-between pb-4 border-b-2" style={{ borderColor: "#c8962d" }}>
            <div className="flex items-start gap-3">
              {co?.logo_url && <img src={co.logo_url} alt="" className="h-14 w-14 object-contain" />}
              <div>
                <div className="text-xl font-bold tracking-tight">{co?.name}</div>
                <div className="text-[10px] text-gray-600 mt-0.5 space-y-0.5">
                  {co?.address && <div>{co.address}</div>}
                  <div className="flex flex-wrap gap-x-3">
                    {co?.phone && <span>📱 {co.phone}</span>}
                    {co?.email && <span>✉ {co.email}</span>}
                  </div>
                  {co?.gst_number && <div>GSTIN: {co.gst_number}</div>}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold q-accent tracking-wider">QUOTATION</div>
              <div className="text-[10px] text-gray-700 mt-1 space-y-0.5">
                <div><span className="text-gray-500">Quote #:</span> <span className="font-semibold">{q.quotation_number}</span></div>
                <div><span className="text-gray-500">Date:</span> {formatDate(q.quotation_date)}</div>
                {q.valid_until && <div><span className="text-gray-500">Valid Until:</span> {formatDate(q.valid_until)}</div>}
              </div>
            </div>
          </div>

          {/* CLIENT */}
          <div className="grid grid-cols-2 gap-4 mt-4 mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Quotation For</div>
              <div className="font-bold text-sm">{clientDisplay}</div>
              {cl?.business_name && cl?.client_name && cl.business_name !== cl.client_name && (
                <div className="text-[11px] text-gray-700">{cl.client_name}</div>
              )}
              {cl?.address && <div className="text-[10px] text-gray-600 mt-0.5">{cl.address}</div>}
              {cl?.gst_number && <div className="text-[10px] text-gray-600">GSTIN: {cl.gst_number}</div>}
            </div>
          </div>

          {/* TITLE */}
          <div className="mb-3">
            <h2 className="text-base font-bold leading-snug">
              Quote for <span className="q-accent">{q.notes?.split("\n")[0] || "Social Media Marketing Services"}</span> for {clientDisplay}
            </h2>
          </div>

          {/* SERVICES TABLE */}
          <table className="w-full border-collapse mb-4" style={{ fontSize: "10.5px" }}>
            <thead>
              <tr className="q-bar text-white">
                <th className="text-left p-2 font-semibold w-10">#</th>
                <th className="text-left p-2 font-semibold">Package / Deliverables</th>
                <th className="text-right p-2 font-semibold w-24">Fees</th>
                <th className="text-right p-2 font-semibold w-24">Ad Spend</th>
                <th className="text-right p-2 font-semibold w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, idx) => {
                const fee = Number(it.unit_price);
                const adSpend = Number(it.quantity) > 1 ? Number(it.amount) - fee : 0;
                return (
                  <tr key={it.id} className="border-b border-gray-200 align-top">
                    <td className="p-2 text-gray-600">{idx + 1}</td>
                    <td className="p-2">
                      <div className="font-semibold">{it.item_name}</div>
                      {it.description && (
                        <div className="text-[10px] text-gray-600 whitespace-pre-line mt-0.5">{it.description}</div>
                      )}
                    </td>
                    <td className="p-2 text-right">{inr(fee)}</td>
                    <td className="p-2 text-right">{adSpend > 0 ? inr(adSpend) : "—"}</td>
                    <td className="p-2 text-right font-semibold">{inr(Number(it.amount))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* SUMMARY + SERVICES INCLUDED */}
          <div className="grid grid-cols-5 gap-4 mb-4">
            <div className="col-span-3">
              <div className="q-h text-[11px] font-bold uppercase tracking-wider mb-2">Services Included</div>
              {q.terms ? (
                <ul className="space-y-1 text-[10.5px]">
                  {q.terms.split("\n").filter(Boolean).map((line, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="q-accent">▪</span>
                      <span>{line.replace(/^[-•*]\s*/, "")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-1 text-[10.5px] text-gray-700">
                  {["Content Design", "Content Publishing", "Profile Management", "Instagram Management", "Facebook Management", "Google Business Profile Management", "WhatsApp Marketing Support"].map((s) => (
                    <li key={s} className="flex gap-1.5"><span className="q-accent">▪</span><span>{s}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div className="col-span-2">
              <div className="border border-gray-300 rounded">
                <div className="p-3 space-y-1.5 text-[11px]">
                  <Row label="Subtotal" value={inr(Number(q.subtotal))} />
                  {Number(q.gst_rate) > 0 && <Row label={`GST (${q.gst_rate}%)`} value={inr(Number(q.gst_amount))} />}
                  {Number(q.discount) > 0 && <Row label="Discount" value={`- ${inr(Number(q.discount))}`} />}
                </div>
                <div className="q-bar text-white p-3 flex justify-between font-bold text-sm">
                  <span>Grand Total</span><span>{inr(Number(q.total))}</span>
                </div>
                <div className="px-3 py-1.5 text-[9.5px] italic text-gray-600 border-t border-gray-200">
                  {amountInWords(Math.round(Number(q.total)))} Rupees Only
                </div>
              </div>
            </div>
          </div>

          {/* NOTES */}
          {(q.notes && q.notes.includes("\n")) || true ? (
            <div className="mb-4 p-2.5 bg-gray-50 border-l-2" style={{ borderColor: "#c8962d" }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1">Note</div>
              <div className="text-[10px] text-gray-700 whitespace-pre-line">
                {q.notes && q.notes.includes("\n")
                  ? q.notes.split("\n").slice(1).join("\n")
                  : "Advertising expenses above suggested budget will be billed separately."}
              </div>
            </div>
          ) : null}

          {/* FOOTER */}
          <div className="flex items-end justify-between mt-6 pt-4 border-t border-gray-300">
            <div className="text-[9px] text-gray-500">
              Generated by <span className="font-semibold q-accent">Make Me Brand</span>
            </div>
            <div className="text-center">
              {co?.signature_url && <img src={co.signature_url} alt="" className="h-10 mx-auto object-contain" />}
              <div className="border-t border-gray-400 pt-0.5 mt-0.5 text-[10px] font-semibold min-w-[140px]">Authorized Signatory</div>
              <div className="text-[9px] text-gray-600">{co?.name}</div>
            </div>
          </div>
        </div>
      </Card>

    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-base" : ""}`}>
      <span className="text-gray-600">{label}</span><span>{value}</span>
    </div>
  );
}
