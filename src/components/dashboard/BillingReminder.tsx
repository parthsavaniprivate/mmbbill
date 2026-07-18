import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, AlertTriangle, ArrowRight } from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { daysBetween, priorityForOverdue, todayISO, intervalMonths, computeServiceAmount, type BillingType } from "@/lib/billing/cycle";

type ScheduleRow = {
  id: string;
  company_id: string;
  client_id: string;
  billing_type: BillingType;
  custom_interval_months: number | null;
  next_billing_date: string;
  auto_suggest: boolean;
  is_active: boolean;
  clients?: { client_name: string; business_name: string | null } | null;
  billing_schedule_services?: { service_name: string; price: number; gst_rate: number | null; unit: string; interval_months: number | null }[];
};

export function BillingReminder() {
  const { selected, isAll } = useCompany();
  const today = todayISO();

  const { data: schedules = [] } = useQuery({
    queryKey: ["billing-schedules-all", isAll ? "all" : selected],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("billing_schedules")
        .select("id, company_id, client_id, billing_type, custom_interval_months, next_billing_date, auto_suggest, is_active, clients(client_name, business_name), billing_schedule_services(service_name, price, gst_rate, unit, interval_months)")
        .eq("is_active", true)
        .eq("auto_suggest", true);
      if (!isAll) q = q.eq("company_id", selected);
      const { data } = await q.order("next_billing_date", { ascending: true });
      return (data ?? []) as unknown as ScheduleRow[];
    },
  });

  const groups = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7ISO = in7.toISOString().slice(0, 10);
    const overdue: ScheduleRow[] = [];
    const dueToday: ScheduleRow[] = [];
    const upcoming: ScheduleRow[] = [];
    for (const s of schedules) {
      if (s.next_billing_date < today) overdue.push(s);
      else if (s.next_billing_date === today) dueToday.push(s);
      else if (s.next_billing_date <= in7ISO) upcoming.push(s);
    }
    return { overdue, dueToday, upcoming };
  }, [schedules, today]);

  const totalDue = groups.overdue.length + groups.dueToday.length + groups.upcoming.length;
  if (totalDue === 0) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Invoices To Generate</CardTitle>
          <Badge>{totalDue} client{totalDue > 1 ? "s" : ""}</Badge>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/billing-scheduler">View all <ArrowRight className="w-4 h-4 ml-1" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.overdue.length > 0 && (
          <Group title="Overdue" tone="destructive" rows={groups.overdue} today={today} />
        )}
        {groups.dueToday.length > 0 && (
          <Group title="Due Today" tone="primary" rows={groups.dueToday} today={today} />
        )}
        {groups.upcoming.length > 0 && (
          <Group title="This Week" tone="muted" rows={groups.upcoming} today={today} />
        )}
      </CardContent>
    </Card>
  );
}

function Group({ title, tone, rows, today }: { title: string; tone: "destructive" | "primary" | "muted"; rows: ScheduleRow[]; today: string }) {
  const toneCls = tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${toneCls}`}>{title}</div>
      <div className="space-y-2">
        {rows.slice(0, 5).map((s) => {
          const name = s.clients?.business_name || s.clients?.client_name || "Client";
          const services = (s.billing_schedule_services ?? []).map((x) => x.service_name).slice(0, 3).join(", ");
          const step = intervalMonths(s.billing_type, s.custom_interval_months);
          const total = (s.billing_schedule_services ?? []).reduce((sum, x) => {
            const iv = Number(x.interval_months ?? step);
            return sum + (x.unit === "one_time" ? Number(x.price || 0) : computeServiceAmount(Number(x.price || 0), iv));
          }, 0);
          const overdueDays = -daysBetween(today, s.next_billing_date);
          const priority = overdueDays > 0 ? priorityForOverdue(overdueDays) : null;
          return (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/60 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate">
                  <span className="font-medium truncate">{name}</span>
                  {tone === "destructive" && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {overdueDays}d overdue
                    </Badge>
                  )}
                  {priority === "high" && <Badge variant="destructive">High</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {services || "No services"} · {inr(total)} · Due {formatDate(s.next_billing_date)}
                </div>
              </div>
              <Button asChild size="sm">
                <Link to="/invoices/new" search={{ client: s.client_id, schedule: s.id }}>
                  Generate
                </Link>
              </Button>
            </div>
          );
        })}
        {rows.length > 5 && (
          <div className="text-xs text-muted-foreground pl-1">+ {rows.length - 5} more</div>
        )}
      </div>
    </div>
  );
}
