import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export type ServiceSuggestion = {
  id?: string;
  name: string;
  description?: string | null;
  default_price?: number | null;
  default_gst_rate?: number | null;
  default_quantity?: number | null;
  default_unit?: string | null;
  billing_type?: string | null;
  category?: string | null;
  hsn_sac?: string | null;
  service_code?: string | null;
  subscribed?: boolean;
};

const DEFAULT_SUGGESTIONS: ServiceSuggestion[] = [
  { name: "SEO Monthly", default_price: 10000, default_gst_rate: 18 },
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
  clientId,
  placeholder = "Type service…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (s: ServiceSuggestion) => void;
  companyId?: string | null;
  clientId?: string | null;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: catalog = [] } = useQuery({
    queryKey: ["service-catalog-v2", companyId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("service_catalog")
        .select("id, name, description, default_price, default_gst_rate, default_quantity, default_unit, billing_type, category, hsn_sac, service_code, is_active, last_used_at");
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q.order("last_used_at", { ascending: false, nullsFirst: false }).limit(200);
      return ((data ?? []) as (ServiceSuggestion & { is_active?: boolean })[]).filter((s) => s.is_active !== false);
    },
  });

  const { data: subscribed = [] } = useQuery({
    queryKey: ["client-subscribed-services", clientId ?? "none"],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: schedules } = await supabase
        .from("billing_schedules")
        .select("id")
        .eq("client_id", clientId!)
        .eq("is_active", true);
      const ids = (schedules ?? []).map((s) => s.id);
      if (!ids.length) return [] as string[];
      const { data: svcs } = await supabase
        .from("billing_schedule_services")
        .select("service_name")
        .in("billing_schedule_id", ids);
      return Array.from(new Set((svcs ?? []).map((s) => s.service_name)));
    },
  });

  const suggestions = useMemo(() => {
    const map = new Map<string, ServiceSuggestion>();
    for (const s of catalog) map.set(s.name.toLowerCase(), s);
    for (const s of DEFAULT_SUGGESTIONS) if (!map.has(s.name.toLowerCase())) map.set(s.name.toLowerCase(), s);
    const subSet = new Set(subscribed.map((n) => n.toLowerCase()));
    let arr = Array.from(map.values()).map((s) => ({ ...s, subscribed: subSet.has(s.name.toLowerCase()) }));
    const q = value.trim().toLowerCase();
    if (q) arr = arr.filter((s) => s.name.toLowerCase().includes(q) || (s.service_code ?? "").toLowerCase().includes(q));
    arr.sort((a, b) => Number(!!b.subscribed) - Number(!!a.subscribed));
    return arr.slice(0, 10);
  }, [catalog, value, subscribed]);

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
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg text-sm">
          {suggestions.map((s) => (
            <button
              key={(s.id ?? s.name) + (s.subscribed ? "-sub" : "")}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
              onClick={() => { onChange(s.name); onSelect?.(s); setOpen(false); }}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {s.subscribed && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                <span className="truncate">{s.name}</span>
                {s.service_code && <span className="text-[10px] text-muted-foreground uppercase">· {s.service_code}</span>}
              </span>
              {s.default_price != null && (
                <span className="text-xs text-muted-foreground shrink-0">₹{Number(s.default_price).toLocaleString("en-IN")}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
