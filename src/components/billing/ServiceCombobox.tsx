import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ServiceSuggestion = {
  name: string;
  default_price?: number | null;
  default_gst_rate?: number | null;
};

const DEFAULT_SUGGESTIONS: ServiceSuggestion[] = [
  { name: "SEO Monthly", default_price: 10000, default_gst_rate: 18 },
  { name: "SEO Quarterly", default_price: 27000, default_gst_rate: 18 },
  { name: "SEO Annual", default_price: 100000, default_gst_rate: 18 },
  { name: "Instagram Management", default_price: 15000, default_gst_rate: 18 },
  { name: "Facebook Ads", default_price: 8000, default_gst_rate: 18 },
  { name: "Google Ads", default_price: 20000, default_gst_rate: 18 },
  { name: "Website Maintenance", default_price: 2000, default_gst_rate: 18 },
  { name: "Website Hosting", default_price: 4000, default_gst_rate: 18 },
  { name: "AMC", default_price: 12000, default_gst_rate: 18 },
  { name: "Domain Renewal", default_price: 1200, default_gst_rate: 18 },
];

export function ServiceCombobox({
  value,
  onChange,
  onSelect,
  companyId,
  placeholder = "Type service…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (s: ServiceSuggestion) => void;
  companyId?: string | null;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: catalog = [] } = useQuery({
    queryKey: ["service-catalog", companyId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("service_catalog").select("name, default_price, default_gst_rate, last_used_at, usage_count");
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q.order("last_used_at", { ascending: false, nullsFirst: false }).limit(50);
      return (data ?? []) as ServiceSuggestion[];
    },
  });

  const suggestions = useMemo(() => {
    const map = new Map<string, ServiceSuggestion>();
    for (const s of catalog) map.set(s.name.toLowerCase(), s);
    for (const s of DEFAULT_SUGGESTIONS) if (!map.has(s.name.toLowerCase())) map.set(s.name.toLowerCase(), s);
    const q = value.trim().toLowerCase();
    const arr = Array.from(map.values());
    if (!q) return arr.slice(0, 8);
    return arr.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [catalog, value]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Input
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg text-sm">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
              onClick={() => { onChange(s.name); onSelect?.(s); setOpen(false); }}
            >
              <span className="truncate">{s.name}</span>
              {s.default_price != null && (
                <span className="text-xs text-muted-foreground">₹{Number(s.default_price).toLocaleString("en-IN")}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
