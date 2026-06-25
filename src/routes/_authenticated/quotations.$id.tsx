import type { ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, MessageCircle, Mail, FileText, Trash2, Download } from "lucide-react";
import { inr, formatDate, amountInWords } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import mmbLogo from "@/assets/make-me-brand-logo.png.asset.json";

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

  function downloadPdf() {
    // Use the browser's native print-to-PDF — the @page styles below already
    // size it to 162×104mm and html2canvas mangles flex + word-spacing.
    const prevTitle = document.title;
    document.title = `Quote-${clientDisplay.replace(/[^\w-]+/g, "_")}-${q.quotation_number}`;
    const restore = () => {
      document.title = prevTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }


  // Parse notes for structured sections. Convention (any order, case-insensitive headings):
  //   Title: Social Media Marketing
  //   Handles: Facebook, Instagram, Youtube, Google Maps
  //   Note: Advertising expenses ...
  const notesRaw = q.notes || "";
  const section = (key: string) => {
    const re = new RegExp(`^\\s*${key}\\s*:\\s*(.*?)(?=\\n\\s*(?:title|handles|note)\\s*:|$)`, "ims");
    const m = notesRaw.match(re);
    return m ? m[1].trim() : "";
  };
  const titleSec = section("title");
  const handles = section("handles") || "Facebook, Instagram, Youtube, Google Maps";
  const noteText = section("note") || (notesRaw && !/title:|handles:|note:/i.test(notesRaw) ? notesRaw.trim() : "Advertising expenses above suggested amounts will be billed separately.");
  const serviceTitle = (titleSec || "Social Media Marketing").replace(/\s+for\s*$/i, "");
  const servicesList = (q.terms || "").split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const hasAdSpend = data.items.some((it) => Number(it.amount) > Number(it.unit_price) + 0.5);

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
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" />Print</Button>
          <Button variant="outline" onClick={downloadPdf}><Download className="w-4 h-4" />Download PDF</Button>
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

      <style>{`@media print { @page { size: 162mm 104mm; margin: 0; } body { background: white; } .no-print { display: none !important; } .q-doc { box-shadow: none !important; } .q-scale { transform: none !important; height: auto !important; } } .q-scale { transform: scale(1.7); transform-origin: top center; height: calc(104mm * 1.7); }`}</style>

      <Card className="shadow-card print:shadow-none overflow-visible q-doc rounded-2xl bg-transparent border-0 shadow-none">
        <div className="q-scale mx-auto" style={{ width: "162mm" }}>
        <div id="quote-doc" className="mx-auto" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", width: "162mm", minHeight: "104mm", padding: "9mm 11mm", fontSize: "10px", lineHeight: 1.4, color: "#111", background: "#f5f4f1", borderRadius: "10mm" }}>

          {/* Header: title + logo */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h1 className="font-extrabold leading-tight tracking-tight" style={{ fontSize: "20px", color: "#111" }}>
                Quote for {serviceTitle} for
              </h1>
              <h2 className="font-extrabold leading-tight tracking-tight" style={{ fontSize: "20px", color: "#111" }}>
                {clientDisplay}
              </h2>

            </div>
            <img src={co?.logo_url || mmbLogo.url} alt="" className="object-contain shrink-0" style={{ height: "14mm" }} />
          </div>

          {/* Items table */}
          <table className="w-full border-collapse mb-5" style={{ fontSize: "10px" }}>
            <thead>
              <tr>
                <th className="text-left pb-1 pr-3 w-[42%]"><HeadCell>No of Options</HeadCell></th>
                <th className="text-left pb-1 px-3"></th>
                <th className="text-left pb-1 px-3 w-[14%]"><HeadCell>Our Fees</HeadCell></th>
                {hasAdSpend && <th className="text-left pb-1 px-3 w-[16%]"><HeadCell>Paid Ads Spent</HeadCell></th>}
                {hasAdSpend && <th className="text-left pb-1 pl-3 w-[12%]"><HeadCell>Total</HeadCell></th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => {
                const fee = Number(it.unit_price);
                const total = Number(it.amount);
                const ads = hasAdSpend ? Math.max(total - fee, 0) : 0;
                const lines = (it.description || "").split("\n").filter(Boolean);
                return (
                  <tr key={it.id} className="align-top">
                    <td className="pt-3 pr-3 font-semibold">{it.item_name}</td>
                    <td className="pt-3 px-3 whitespace-pre-line">{lines.join("\n")}</td>
                    <td className="pt-3 px-3 font-semibold">{Math.round(fee).toLocaleString("en-IN")}</td>
                    {hasAdSpend && <td className="pt-3 px-3 font-semibold">{ads > 0 ? <>{Math.round(ads).toLocaleString("en-IN")} {/approx/i.test(it.description || "") && <span className="font-normal text-gray-600">(approx.)</span>}</> : "—"}</td>}
                    {hasAdSpend && <td className="pt-3 pl-3 font-semibold">{Math.round(total).toLocaleString("en-IN")}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Services included */}
          {servicesList.length > 0 && (
            <div className="mb-4">
              <SectionHead>Our services will include following things:</SectionHead>
              <ul className="space-y-1 mt-2">
                {servicesList.map((s, i) => <BulletItem key={i}>{s}</BulletItem>)}
              </ul>
            </div>
          )}

          {/* Handles */}
          {handles && (
            <div className="mb-4">
              <SectionHead>Handles to be managed:</SectionHead>
              <ul className="mt-2"><BulletItem>{handles}</BulletItem></ul>
            </div>
          )}

          {/* Note */}
          {noteText && (
            <div className="mb-3">
              <SectionHead>Note:</SectionHead>
              <div className="mt-1 whitespace-pre-line">{noteText}</div>
            </div>
          )}

          {/* Totals — compact, only if discount/GST present */}
          {(Number(q.gst_rate) > 0 || Number(q.discount) > 0) && (
            <div className="flex justify-end mb-3">
              <div className="w-56 space-y-1">
                <Row label="Subtotal" value={inr(Number(q.subtotal))} />
                {Number(q.discount) > 0 && <Row label="Discount" value={`- ${inr(Number(q.discount))}`} />}
                {Number(q.gst_rate) > 0 && <Row label={`GST (${q.gst_rate}%)`} value={inr(Number(q.gst_amount))} />}
                <div className="flex justify-between border-t border-gray-800 pt-1 font-bold">
                  <span>Grand Total</span><span>{inr(Number(q.total))}</span>
                </div>
                <div className="text-[9px] italic text-gray-600">{amountInWords(Math.round(Number(q.total)))} Rupees Only</div>
              </div>
            </div>
          )}

          {/* Meta footer */}
          <div className="mt-4 pt-2 flex items-end justify-end text-[9px] text-gray-600">

            {co?.signature_url && (
              <div className="text-center">
                <img src={co.signature_url} alt="" className="h-8 mx-auto object-contain" />
                <div className="text-[9px] font-semibold text-gray-800">{co?.name}</div>
              </div>
            )}
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

function HeadCell({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block font-bold text-black" style={{ borderBottom: "2px solid #F26A2E", paddingBottom: "2px" }}>
      {children}
    </span>
  );
}

function SectionHead({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block font-bold text-black" style={{ borderBottom: "2px solid #F26A2E", paddingBottom: "2px" }}>
      {children}
    </span>
  );
}

function BulletItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="inline-block shrink-0" style={{ width: "5px", height: "5px", background: "#F26A2E", marginTop: "5px" }} />
      <span>{children}</span>
    </li>
  );
}
