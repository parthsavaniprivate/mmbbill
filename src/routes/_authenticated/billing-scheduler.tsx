import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, AlertTriangle, TrendingUp, IndianRupee, Users, ArrowRight } from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { daysBetween, priorityForOverdue, intervalMonths, todayISO, computeServiceAmount, computePriorBillingPeriod, formatPeriodShort, type BillingType } from "@/lib/billing/cycle";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/billing-scheduler")({
  component: BillingSchedulerPage,
});

type Row = {
  id: string;
  company_id: string;
  client_id: string;
  billing_type: BillingType;
  custom_interval_months: number | null;
  next_billing_date: string;
  last_generated_date: string | null;
  is_active: boolean;
  clients?: { client_name: string; business_name: string | null } | null;
  billing_schedule_services?: { service_name: string; price: number; gst_rate: number | null; unit: string; interval_months: number | null }[];
};

function BillingSchedulerPage() {
  const { selected, isAll } = useCompany();
  const today = todayISO();

  const { data: rows = [] } = useQuery({
    queryKey: ["billing-schedules-all", isAll ? "all" : selected],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("billing_schedules")
        .select("id, company_id, client_id, billing_type, custom_interval_months, next_billing_date, last_generated_date, is_active, clients(client_name, business_name), billing_schedule_services(service_name, price, gst_rate, unit, interval_months)")
        .eq("is_active", true);
      if (!isAll) q = q.eq("company_id", selected);
      const { data } = await q.order("next_billing_date", { ascending: true });
      return (data ?? []) as unknown as Row[];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["billing-scheduler-invoices", isAll ? "all" : selected],
    queryFn: async () => {
      let q = supabase.from("invoices").select("id, company_id, invoice_date, total, source_schedule_id");
      if (!isAll) q = q.eq("company_id", selected);
      const { data } = await q;
      return data ?? [];
    },
  });

  const buckets = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const in7ISO = in7.toISOString().slice(0, 10);
    const in30ISO = in30.toISOString().slice(0, 10);
    const overdue: Row[] = [], dueToday: Row[] = [], week: Row[] = [], month: Row[] = [], later: Row[] = [];
    for (const r of rows) {
      if (r.next_billing_date < today) overdue.push(r);
      else if (r.next_billing_date === today) dueToday.push(r);
      else if (r.next_billing_date <= in7ISO) week.push(r);
      else if (r.next_billing_date <= in30ISO) month.push(r);
      else later.push(r);
    }
    return { overdue, dueToday, week, month, later };
  }, [rows, today]);

  const analytics = useMemo(() => {
    const thisMonth = today.slice(0, 7);
    const generatedThisMonth = invoices.filter((i) => i.source_schedule_id && i.invoice_date.slice(0, 7) === thisMonth).length;
    const rowTotal = (r: Row) => {
      const step = intervalMonths(r.billing_type, r.custom_interval_months);
      return (r.billing_schedule_services ?? []).reduce((s, x) => {
        const iv = Number(x.interval_months ?? step);
        return s + (x.unit === "one_time" ? Number(x.price || 0) : computeServiceAmount(Number(x.price || 0), iv));
      }, 0);
    };
    const upcoming30 = [...buckets.dueToday, ...buckets.week, ...buckets.month].reduce((s, r) => s + rowTotal(r), 0);
    const mrr = rows.reduce((s, r) => {
      const step = intervalMonths(r.billing_type, r.custom_interval_months);
      return s + (r.billing_schedule_services ?? []).reduce((sum, x) => {
        const p = Number(x.price || 0);
        if (x.unit === "one_time") return sum;
        const iv = Number(x.interval_months ?? step);
        return sum + computeServiceAmount(p, iv);
      }, 0);
    }, 0);

    return {
      generated: generatedThisMonth,
      pending: buckets.dueToday.length + buckets.week.length + buckets.month.length,
      overdue: buckets.overdue.length,
      upcoming30: upcoming30,
      mrr,
      arr: mrr * 12,
    };
  }, [invoices, rows, today, buckets]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Billing Scheduler</h1>
          <p className="text-sm text-muted-foreground">Recurring billing suggestions — you review, you generate.</p>
        </div>
      </div>

      {/* Analytics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Generated (mo)" value={String(analytics.generated)} icon={<TrendingUp className="w-4 h-4" />} />
        <Stat label="Pending" value={String(analytics.pending)} icon={<CalendarClock className="w-4 h-4" />} />
        <Stat label="Overdue" value={String(analytics.overdue)} tone="destructive" icon={<AlertTriangle className="w-4 h-4" />} />
        <Stat label="Upcoming 30d" value={inr(analytics.upcoming30)} icon={<Users className="w-4 h-4" />} />
        <Stat label="MRR" value={inr(analytics.mrr)} icon={<IndianRupee className="w-4 h-4" />} />
        
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="overdue">Overdue {buckets.overdue.length > 0 && <Badge variant="destructive" className="ml-2">{buckets.overdue.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3">
          {buckets.dueToday.length > 0 && <RowGroup title="Due Today" rows={buckets.dueToday} today={today} />}
          {buckets.week.length > 0 && <RowGroup title="This Week" rows={buckets.week} today={today} />}
          {buckets.month.length > 0 && <RowGroup title="This Month" rows={buckets.month} today={today} />}
          {buckets.later.length > 0 && <RowGroup title="Later" rows={buckets.later} today={today} />}
          {buckets.dueToday.length + buckets.week.length + buckets.month.length + buckets.later.length === 0 && (
            <EmptyMsg>No upcoming billing scheduled.</EmptyMsg>
          )}
        </TabsContent>

        <TabsContent value="overdue" className="space-y-3">
          {buckets.overdue.length > 0
            ? <RowGroup title="Overdue" rows={buckets.overdue} today={today} tone="destructive" />
            : <EmptyMsg>Nothing overdue. 🎉</EmptyMsg>}
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarView rows={rows} today={today} />
        </TabsContent>

        <TabsContent value="all" className="space-y-3">
          <RowGroup title={`All (${rows.length})`} rows={rows} today={today} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: "destructive" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className={cn("flex items-center gap-2 text-xs uppercase tracking-wide", tone === "destructive" ? "text-destructive" : "text-muted-foreground")}>
          {icon}{label}
        </div>
        <div className="text-lg font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{children}</CardContent></Card>;
}

function RowGroup({ title, rows, today, tone }: { title: string; rows: Row[]; today: string; tone?: "destructive" }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className={cn("text-sm font-semibold uppercase tracking-wide", tone === "destructive" && "text-destructive")}>
          {title}
        </CardTitle>
        <Badge variant="outline">{rows.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => {
          const name = r.clients?.business_name || r.clients?.client_name || "Client";
          const step = intervalMonths(r.billing_type, r.custom_interval_months);
          const svcs = r.billing_schedule_services ?? [];
          const total = svcs.reduce((s, x) => {
            const iv = Number(x.interval_months ?? step);
            return s + (x.unit === "one_time" ? Number(x.price || 0) : computeServiceAmount(Number(x.price || 0), iv));
          }, 0);
          const overdueDays = -daysBetween(today, r.next_billing_date);
          const priority = overdueDays > 0 ? priorityForOverdue(overdueDays) : null;
          return (
            <div key={r.id} className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to="/clients/$id" params={{ id: r.client_id }} className="font-medium hover:underline truncate">{name}</Link>
                    {overdueDays > 0 && <Badge variant="destructive">{overdueDays}d overdue</Badge>}
                    {priority && <Badge variant={priority === "high" ? "destructive" : "outline"}>{priority}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Next Billing: <span className="text-foreground font-medium">{formatDate(r.next_billing_date)}</span>
                    <span className="mx-2">·</span>
                    Invoice Total: <span className="text-foreground font-semibold">{inr(total)}</span>
                  </div>
                </div>
                <Button asChild size="sm">
                  <Link to="/invoices/new" search={{ client: r.client_id, schedule: r.id }}>
                    Generate <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
              {svcs.length > 0 && (
                <div className="space-y-1 pl-1 border-l-2 border-primary/30">
                  {svcs.map((x, i) => {
                    const iv = Number(x.interval_months ?? step);
                    const rate = Number(x.price || 0);
                    const amount = x.unit === "one_time" ? rate : computeServiceAmount(rate, iv);
                    const period = x.unit === "one_time" ? null : computePriorBillingPeriod(r.next_billing_date, iv, r.last_generated_date);

                    return (
                      <div key={i} className="pl-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-medium text-foreground">{x.service_name}</span>
                          <span className="text-muted-foreground">
                            {inr(rate)} / {x.unit === "year" ? "Year" : x.unit === "one_time" ? "one-time" : "Month"}
                            {x.unit !== "one_time" && <> × {iv} {iv === 1 ? "Month" : "Months"}</>}
                            {" = "}<b className="text-foreground">{inr(amount)}</b>
                          </span>
                        </div>
                        {period && (
                          <div className="text-[11px] text-muted-foreground">
                            Period: {formatPeriodShort(period.start, period.end)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CalendarView({ rows, today }: { rows: Row[]; today: string }) {
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const list = m.get(r.next_billing_date) ?? [];
      list.push(r); m.set(r.next_billing_date, list);
    }
    return m;
  }, [rows]);
  const key = selected ? selected.toISOString().slice(0, 10) : today;
  const dayRows = byDate.get(key) ?? [];

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-3">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={setSelected}
            modifiers={{ scheduled: (d) => byDate.has(d.toISOString().slice(0, 10)) }}
            modifiersClassNames={{ scheduled: "bg-primary/20 text-primary font-semibold rounded-md" }}
            className="pointer-events-auto"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{formatDate(key)}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {dayRows.length === 0 && <div className="text-sm text-muted-foreground">No billing on this date.</div>}
          {dayRows.map((r) => {
            const name = r.clients?.business_name || r.clients?.client_name || "Client";
            const step = intervalMonths(r.billing_type, r.custom_interval_months);
            const total = (r.billing_schedule_services ?? []).reduce((s, x) => {
              const iv = Number(x.interval_months ?? step);
              return s + (x.unit === "one_time" ? Number(x.price || 0) : computeServiceAmount(Number(x.price || 0), iv));
            }, 0);
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{name}</div>
                  <div className="text-xs text-muted-foreground">{inr(total)}</div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/invoices/new" search={{ client: r.client_id, schedule: r.id }}>Generate</Link>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
