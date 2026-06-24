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

  const waNum = (cl?.whatsapp || cl?.mobile || "").replace(/\D/g, "");
  const waMsg = `Hi ${cl?.client_name ?? ""},\n\nPlease find quotation *${q.quotation_number}* for ${inr(Number(q.total))}.\nValid until: ${q.valid_until ? formatDate(q.valid_until) : "—"}\n\nThanks,\n${co?.name ?? ""}`;
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

      <style>{`@media print { @page { size: A4 landscape; margin: 0; } body { background: white; } .no-print { display: none !important; } } .q-h { position: relative; display: inline-block; padding-bottom: 6px; } .q-h::after { content: ""; position: absolute; left: 0; bottom: 0; width: 90px; height: 3px; background: #f5b921; border-radius: 2px; }`}</style>

      <Card className="shadow-card print:shadow-none overflow-hidden">
        <div className="bg-white text-black p-10 md:p-14" style={{ fontFamily: "Georgia, 'Times New Roman', serif", minHeight: "560px" }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-10">
            <div className="text-xs text-gray-500">
              <div>{q.quotation_number}</div>
              <div>{formatDate(q.quotation_date)}</div>
            </div>
            <div className="text-right">
              {co?.logo_url ? (
                <img src={co.logo_url} alt="" className="h-10 object-contain ml-auto" />
              ) : (
                <div className="text-2xl tracking-tight" style={{ fontFamily: "Georgia, serif" }}>{co?.name}</div>
              )}
            </div>
          </div>

          {/* Title */}
          <h2 className="text-3xl font-semibold mb-10 leading-snug">
            Quote for {q.notes?.split("\n")[0] || "Services"} for<br />
            {cl?.business_name || cl?.client_name || "—"}
          </h2>

          {/* Items table — 3 columns like reference */}
          <div className="grid grid-cols-12 gap-6 mb-10">
            <div className="col-span-6"><div className="q-h text-lg font-semibold">No of Options</div></div>
            <div className="col-span-3"><div className="q-h text-lg font-semibold">Our Fees</div></div>
            <div className="col-span-3"><div className="q-h text-lg font-semibold">Photo/Videography</div></div>

            {data.items.map((it) => (
              <div key={it.id} className="contents">
                <div className="col-span-6">
                  <div className="font-semibold text-base">{it.item_name}</div>
                  {it.description && (
                    <div className="text-sm text-gray-700 whitespace-pre-line mt-1">{it.description}</div>
                  )}
                </div>
                <div className="col-span-3 text-base">{inr(Number(it.unit_price))}</div>
                <div className="col-span-3 text-base">{Number(it.quantity) > 1 ? inr(Number(it.amount) - Number(it.unit_price)) : "—"}</div>
              </div>
            ))}
          </div>

          {/* Services bullets — use terms field, one bullet per line */}
          {q.terms && (
            <div className="mb-8">
              <div className="q-h text-base font-semibold mb-4">Our services will include following things:</div>
              <ul className="space-y-2 text-base">
                {q.terms.split("\n").filter(Boolean).map((line, i) => (
                  <li key={i} className="flex gap-2"><span style={{ color: "#f5b921" }}>▪</span><span>{line.replace(/^[-•*]\s*/, "")}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* Totals + Note */}
          <div className="flex justify-between items-end gap-6 mt-10">
            <div className="text-xs text-gray-700 max-w-md">
              {q.notes && q.notes.includes("\n") && (
                <div>
                  <div className="font-semibold mb-1">Note:</div>
                  <div className="whitespace-pre-line">{q.notes.split("\n").slice(1).join("\n")}</div>
                </div>
              )}
            </div>
            <div className="text-sm space-y-1 min-w-[260px]">
              <Row label="Subtotal" value={inr(Number(q.subtotal))} />
              {Number(q.discount) > 0 && <Row label="Discount" value={`- ${inr(Number(q.discount))}`} />}
              {Number(q.gst_rate) > 0 && <Row label={`GST (${q.gst_rate}%)`} value={inr(Number(q.gst_amount))} />}
              <div className="border-t border-gray-400 pt-2 mt-1"><Row label="Grand Total" value={inr(Number(q.total))} bold /></div>
              <div className="text-xs text-gray-600 italic pt-1">{amountInWords(Math.round(Number(q.total)))} Rupees Only</div>
            </div>
          </div>

          {/* Signature */}
          <div className="flex justify-end mt-12">
            <div className="text-center">
              {co?.signature_url && <img src={co.signature_url} alt="" className="h-12 mx-auto object-contain" />}
              <div className="border-t border-gray-400 pt-1 mt-1 text-xs">Authorized Signatory</div>
              <div className="text-xs text-gray-600">{co?.name}</div>
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
