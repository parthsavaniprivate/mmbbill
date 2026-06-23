export const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n ?? 0));

export const inrExact = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n ?? 0));

export const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export const monthKey = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const downloadCSV = (filename: string, rows: Record<string, unknown>[]) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
const twoDigits = (n: number): string => n < 20 ? ONES[n] : `${TENS[Math.floor(n/10)]}${n%10 ? " "+ONES[n%10] : ""}`;
const threeDigits = (n: number): string => {
  const h = Math.floor(n/100), r = n%100;
  return `${h ? ONES[h]+" Hundred"+(r? " ":"") : ""}${r ? twoDigits(r) : ""}`;
};
export const amountInWords = (num: number): string => {
  if (!num) return "Zero";
  const crore = Math.floor(num/10000000); num %= 10000000;
  const lakh = Math.floor(num/100000); num %= 100000;
  const thousand = Math.floor(num/1000); num %= 1000;
  const parts: string[] = [];
  if (crore) parts.push(twoDigits(crore)+" Crore");
  if (lakh) parts.push(twoDigits(lakh)+" Lakh");
  if (thousand) parts.push(twoDigits(thousand)+" Thousand");
  if (num) parts.push(threeDigits(num));
  return parts.join(" ").trim();
};
