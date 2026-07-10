import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";

type AuditRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  created_at: string;
};

const auditQuery = (table: string) =>
  queryOptions({
    queryKey: ["audit_log", table],
    queryFn: async () => {
      let q = supabase
        .from("audit_log" as never)
        .select("id,user_email,table_name,record_id,action,old_data,new_data,changed_fields,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (table !== "all") q = q.eq("table_name" as never, table);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

export const Route = createFileRoute("/_authenticated/history")({
  loader: ({ context }) => {
    context.queryClient.prefetchQuery(auditQuery("all"));
  },
  component: HistoryPage,
});

const TABLES = ["all", "invoices", "clients", "payments", "expenses", "quotations", "companies", "employees", "invoice_items", "salary_slips", "recurring_expenses", "packages"];

function actionColor(a: string) {
  if (a === "INSERT") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (a === "UPDATE") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-rose-500/10 text-rose-600 border-rose-500/20";
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function HistoryPage() {
  const [table, setTable] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery(auditQuery(table));


  const rows = (data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.table_name.toLowerCase().includes(s) ||
      (r.user_email ?? "").toLowerCase().includes(s) ||
      (r.record_id ?? "").toLowerCase().includes(s) ||
      (r.changed_fields ?? []).join(",").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">All changes made across the system (admin only).</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TABLES.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "All tables" : t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No history yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={actionColor(r.action)}>{r.action}</Badge>
                  <CardTitle className="text-sm font-medium">{r.table_name}</CardTitle>
                  {r.record_id && <span className="text-xs text-muted-foreground font-mono">{r.record_id.slice(0, 8)}</span>}
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  <div>{r.user_email ?? "system"}</div>
                  <div>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
                </div>
              </CardHeader>
              {r.action === "UPDATE" && r.changed_fields && r.changed_fields.length > 0 && (
                <CardContent className="pt-0 pb-3">
                  <div className="text-xs border rounded-md divide-y">
                    {r.changed_fields.slice(0, 15).map((f) => (
                      <div key={f} className="grid grid-cols-[140px_1fr_1fr] gap-2 px-3 py-1.5">
                        <div className="font-medium truncate">{f}</div>
                        <div className="text-rose-600 line-through truncate">{fmt(r.old_data?.[f])}</div>
                        <div className="text-emerald-600 truncate">{fmt(r.new_data?.[f])}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
