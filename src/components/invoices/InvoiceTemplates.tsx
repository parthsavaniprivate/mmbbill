import { formatDate, amountInWords } from "@/lib/format";

const inrFmt = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface TemplateData {
  invoice: {
    invoice_number: string;
    invoice_type: string;
    invoice_date: string;
    due_date: string | null;
    subtotal: number | string;
    discount: number | string;
    total: number | string;
    amount_paid: number | string;
    notes: string | null;
    terms: string | null;
  };
  items: Array<{ id: string; description: string; quantity: number; rate: number | string; amount: number | string }>;
  company: {
    name: string;
    legal_name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    pan_number: string | null;
    gst_number: string | null;
    logo_url: string | null;
    bank_name: string | null;
    bank_account: string | null;
    bank_ifsc: string | null;
  } | null;
  client: {
    client_name: string;
    business_name: string | null;
    gst_number: string | null;
    address: string | null;
  } | null;
}

/* ---------- Bill of Supply (Make Me Brand style) ---------- */
export function BillOfSupplyTemplate({ data }: { data: TemplateData }) {
  const { invoice: inv, items, company: co, client: cl } = data;
  const pending = Number(inv.total) - Number(inv.amount_paid);
  return (
    <div className="p-5 sm:p-8 md:p-10 space-y-5 sm:space-y-6 bg-white text-black">
      <div className="flex items-center gap-3 text-xs font-semibold tracking-wide">
        <span className="uppercase">{inv.invoice_type === "proforma" ? "Proforma Invoice" : "Bill of Supply"}</span>
        <span className="border border-gray-300 text-gray-500 px-2 py-0.5 rounded uppercase">Original for Recipient</span>
      </div>
      <div className="flex items-center gap-6 pt-2">
        {co?.logo_url ? (
          <img src={co.logo_url} alt={co.name} className="w-28 h-28 object-contain shrink-0" />
        ) : (
          <div className="w-28 h-28 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400 shrink-0">LOGO</div>
        )}
        <div className="flex-1">
          <h2 className="text-3xl font-extrabold uppercase tracking-wide">{co?.name}</h2>
          {co?.address && <p className="text-sm mt-1 text-gray-700 whitespace-pre-line">{co.address}</p>}
          {co?.phone && <p className="text-sm mt-1"><span className="font-semibold">Mobile:</span> {co.phone}</p>}
        </div>
      </div>
      <div className="h-1 bg-black" />
      <div className="bg-gray-100 flex flex-wrap gap-x-6 gap-y-1 justify-between px-4 sm:px-5 py-3 text-sm">
        <div><span className="font-bold">Invoice No.:</span> {inv.invoice_number}</div>
        <div><span className="font-bold">Invoice Date:</span> {formatDate(inv.invoice_date)}</div>
      </div>

      <div>
        <p className="text-sm font-bold uppercase mb-1">Bill To</p>
        <p className="font-bold">{cl?.business_name || cl?.client_name}</p>
        {cl?.business_name && <p className="text-sm">{cl.client_name}</p>}
        {cl?.address && <p className="text-sm text-gray-700 whitespace-pre-line">{cl.address}</p>}
      </div>
      <div>
        <div className="border-t-2 border-b border-black grid grid-cols-12 py-2 text-xs font-bold uppercase">
          <div className="col-span-6">Services</div>
          <div className="col-span-2 text-right">Qty.</div>
          <div className="col-span-2 text-right">Rate</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>
        {items.map((it) => {
          const [main, ...rest] = it.description.split("\n");
          const sub = rest.join(" ").trim();
          return (
          <div key={it.id} className="grid grid-cols-12 py-3 text-sm border-b border-gray-200">
            <div className="col-span-6">
              <div className="uppercase">{main}</div>
              {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
            </div>
            <div className="col-span-2 text-right">{it.quantity} UOM</div>
            <div className="col-span-2 text-right">{Number(it.rate).toLocaleString("en-IN")}</div>
            <div className="col-span-2 text-right">{Number(it.amount).toLocaleString("en-IN")}</div>
          </div>
          );
        })}
        <div className="grid grid-cols-12 py-2 text-sm font-bold border-b-2 border-black">
          <div className="col-span-6 uppercase">Subtotal</div>
          <div className="col-span-2 text-right">{items.reduce((s, i) => s + Number(i.quantity), 0)}</div>
          <div className="col-span-2" />
          <div className="col-span-2 text-right">₹ {Number(inv.subtotal).toLocaleString("en-IN")}</div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="w-80 text-sm">
          {Number(inv.discount) > 0 && (
            <div className="flex justify-between py-1"><span>Discount</span><span>- ₹ {Number(inv.discount).toLocaleString("en-IN")}</span></div>
          )}
          <div className="flex justify-between py-2 border-t font-bold">
            <span>Total Amount</span><span>₹ {Number(inv.total).toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Received Amount</span><span>₹ {Number(inv.amount_paid).toLocaleString("en-IN")}</span>
          </div>
          {pending > 0 && (
            <div className="flex justify-between py-1 font-semibold">
              <span>Balance Due</span><span>₹ {pending.toLocaleString("en-IN")}</span>
            </div>
          )}
        </div>
      </div>
      <div className="text-right text-sm">
        <p className="font-bold">Total Amount (in words)</p>
        <p>{amountInWords(Math.round(Number(inv.total)))} Rupees</p>

      </div>
      {(inv.notes?.trim() || inv.terms?.trim() || co?.bank_name) && (
        <div className="pt-4 border-t space-y-3 text-sm">
          {inv.notes?.trim() && <div><p className="font-bold">Notes</p><p className="whitespace-pre-line">{inv.notes}</p></div>}
          {inv.terms?.trim() && <div><p className="font-bold">Terms &amp; Conditions</p><p className="whitespace-pre-line">{inv.terms}</p></div>}
          {co?.bank_name && (
            <div><p className="font-bold">Bank Details</p>
              <p>{co.bank_name} · A/c: {co.bank_account} · IFSC: {co.bank_ifsc}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Modern Purple (Janki Parth Savani style) ---------- */
export function ModernPurpleTemplate({ data }: { data: TemplateData }) {
  const { invoice: inv, items, company: co, client: cl } = data;
  const pending = Number(inv.total) - Number(inv.amount_paid);
  const heading = co?.legal_name || co?.name || "";
  return (
    <div className="bg-white text-slate-800">
      {/* Purple header */}
      <div className="p-5 sm:p-8 text-white flex flex-wrap gap-4 justify-between items-start" style={{ background: "linear-gradient(120deg, #4f46e5 0%, #7c3aed 100%)" }}>
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-wide">{heading}</h1>
          {co?.pan_number && <p className="text-xs mt-1 opacity-90">PAN: {co.pan_number}</p>}
          {co?.address && <p className="text-xs mt-2 opacity-90">📍 {co.address}</p>}
          {co?.phone && <p className="text-xs mt-1 opacity-90">📞 {co.phone}</p>}
          {co?.email && <p className="text-xs mt-1 opacity-90">✉️ {co.email}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-extrabold">INVOICE</h2>
          <p className="text-sm mt-1 opacity-90">#{inv.invoice_number}</p>
        </div>
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-3 border-b">
        <div className="px-6 py-4 border-r">
          <p className="text-[10px] tracking-wider text-slate-500 uppercase">Invoice Date</p>
          <p className="font-semibold mt-0.5">{formatDate(inv.invoice_date)}</p>
        </div>
        <div className="px-6 py-4 border-r">
          <p className="text-[10px] tracking-wider text-slate-500 uppercase">Due Date</p>
          <p className="font-semibold mt-0.5">{inv.due_date ? formatDate(inv.due_date) : "—"}</p>
        </div>
        <div className="px-6 py-4">
          <p className="text-[10px] tracking-wider text-slate-500 uppercase">Amount Due</p>
          <p className="font-semibold mt-0.5 text-indigo-600">{inrFmt(pending)}</p>
        </div>
      </div>

      {/* Bill to + Summary */}
      <div className="grid grid-cols-2 gap-5 p-8">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
          <p className="text-[10px] tracking-wider text-indigo-600 font-bold uppercase">Bill To</p>
          <p className="text-lg font-bold mt-1">{cl?.business_name || cl?.client_name}</p>
          {cl?.gst_number && <p className="text-xs mt-0.5 text-slate-600">GSTIN: {cl.gst_number}</p>}
          {cl?.address && <p className="text-sm mt-2 text-slate-600 whitespace-pre-line">{cl.address}</p>}
        </div>
        <div className="rounded-xl border p-5 space-y-2 text-sm">
          <p className="text-[10px] tracking-wider text-slate-500 font-bold uppercase">Summary</p>
          <Row k="Invoice #" v={inv.invoice_number} />
          <Row k="Items" v={String(items.length)} />
          <Row k="GST" v={co?.gst_number ? "Applied" : "Not applied"} />
          <Row k="Total" v={<span className="font-bold text-indigo-600">{inrFmt(Number(inv.total))}</span>} />
        </div>
      </div>

      {/* Items */}
      <div className="px-8 pb-2">
        <div className="rounded-t-xl bg-slate-900 text-white px-5 py-3 flex justify-between text-sm">
          <span className="font-semibold">📄 Items &amp; Services</span>
          <span className="opacity-80 text-xs">{items.length} line item{items.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="grid grid-cols-12 px-5 py-2 bg-slate-50 text-[11px] tracking-wider font-bold text-slate-500 uppercase">
          <div className="col-span-1">#</div>
          <div className="col-span-5">Item / Service</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-2 text-right">Rate</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>
        {items.map((it, i) => {
          const [main, ...rest] = it.description.split("\n");
          const sub = rest.join(" ").trim();
          return (
          <div key={it.id} className="grid grid-cols-12 px-5 py-3 text-sm border-b last:rounded-b-xl">
            <div className="col-span-1 text-slate-500">{String(i + 1).padStart(2, "0")}</div>
            <div className="col-span-5">
              <div className="font-semibold">{main}</div>
              {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
            </div>
            <div className="col-span-2 text-right">{it.quantity}</div>
            <div className="col-span-2 text-right">{inrFmt(Number(it.rate))}</div>
            <div className="col-span-2 text-right font-semibold">{inrFmt(Number(it.amount))}</div>
          </div>
          );
        })}
      </div>

      {/* Bank + Pricing */}
      <div className="grid grid-cols-2 gap-5 p-8">
        <div className="rounded-xl border p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center">🏦</span>
            <div>
              <p className="text-[10px] tracking-wider text-slate-500 font-bold uppercase">Bank Details</p>
              <p className="font-bold">{co?.bank_name || "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] tracking-wider text-slate-500 font-bold uppercase">Account Number</p>
              <p className="font-bold">{co?.bank_account || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-wider text-slate-500 font-bold uppercase">IFSC Code</p>
              <p className="font-bold">{co?.bank_ifsc || "—"}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 space-y-2 text-sm">
          <p className="text-[10px] tracking-wider text-slate-500 font-bold uppercase">Pricing Summary</p>
          <Row k="Subtotal" v={inrFmt(Number(inv.subtotal))} />
          {Number(inv.discount) > 0 && <Row k="Discount" v={`- ${inrFmt(Number(inv.discount))}`} />}
          <Row k={<span className="font-bold">Grand Total</span>} v={<span className="font-bold">{inrFmt(Number(inv.total))}</span>} />
          <Row k="Paid" v={inrFmt(Number(inv.amount_paid))} />
          <div className="rounded-lg px-4 py-3 mt-2 text-white flex justify-between font-bold" style={{ background: "linear-gradient(120deg, #4f46e5 0%, #7c3aed 100%)" }}>
            <span className="text-xs tracking-wider">BALANCE DUE</span>
            <span>{inrFmt(pending)}</span>
          </div>
        </div>
      </div>

      {(inv.notes?.trim() || inv.terms?.trim()) && (
        <div className="px-8 pb-4 text-sm space-y-2">
          {inv.notes?.trim() && <div><p className="font-bold">Notes</p><p className="text-slate-600 whitespace-pre-line">{inv.notes}</p></div>}
          {inv.terms?.trim() && <div><p className="font-bold">Terms &amp; Conditions</p><p className="text-slate-600 whitespace-pre-line">{inv.terms}</p></div>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 px-8 pb-3 text-sm">
        <div className="border-t border-dashed border-slate-300 pt-2 text-slate-500">Customer Signature</div>
        <div className="border-t border-dashed border-slate-300 pt-2 text-right text-slate-500">
          Authorised Signatory · {heading}
        </div>
      </div>

      <p className="text-center text-slate-400 text-sm pb-8">Thank you for your business !</p>
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{k}</span>
      <span>{v}</span>
    </div>
  );
}
