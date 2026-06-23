import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MessageCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/renewals")({ component: RenewalsPage });

function RenewalsPage() {
  const { selected, isAll, companies } = useCompany();
  const qc = useQueryClient();

  const { data: packages = [] } = useQuery({
    queryKey: ["renewals-list"],
    queryFn: async () => {
      const { data } = await supabase.from("packages")
        .select("*, clients(id, client_name, business_name, whatsapp, company_id)")
        .not("renewal_date", "is", null)
        .order("renewal_date", { ascending: true });
      return data ?? [];
    },
  });

  const filtered = packages.filter((p) => {
    const cl = p.clients as { company_id: string } | null;
    if (!isAll && cl?.company_id !== selected) return false;
    return true;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in30 = new Date(today.getTime() + 30 * 86400000);

  const upcoming = filtered.filter((p) => {
    const d = new Date(p.renewal_date!);
    return d >= today && d <= in30;
  });
  const overdue = filtered.filter((p) => new Date(p.renewal_date!) < today && p.status === "active");
  const later = filtered.filter((p) => new Date(p.renewal_date!) > in30);

  const markRenewed = useMutation({
    mutationFn: async (pkg: { id: string; renewal_date: string | null }) => {
      const next = pkg.renewal_date ? new Date(pkg.renewal_date) : new Date();
      next.setMonth(next.getMonth() + 1);
      const { error } = await supabase.from("packages").update({
        renewal_date: next.toISOString().slice(0, 10),
      }).eq("id", pkg.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Renewal date updated"); qc.invalidateQueries({ queryKey: ["renewals-list"] }); },
  });

  const sendWhatsApp = (pkg: { name: string; monthly_amount: number; renewal_date: string | null; clients: unknown }) => {
    const cl = pkg.clients as { client_name: string; whatsapp: string | null; company_id: string } | null;
    if (!cl?.whatsapp) return toast.error("No WhatsApp number on file");
    const co = companies.find((c) => c.id === cl.company_id);
    const msg = `Hi ${cl.client_name},\n\nThis is a friendly reminder that your *${pkg.name}* package is up for renewal on *${formatDate(pkg.renewal_date)}*.\n\nMonthly amount: ${inr(Number(pkg.monthly_amount))}\n\nPlease let us know if you'd like to continue.\n\nThanks,\n${co?.name ?? ""}`;
    window.open(`https://wa.me/${cl.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const renderTable = (rows: typeof filtered, emptyMsg: string) => (
    rows.length === 0 ? (
      <div className="p-8 text-center text-muted-foreground text-sm">{emptyMsg}</div>
    ) : (
      <Table>
        <TableHeader><TableRow>
          <TableHead>Client</TableHead><TableHead>Package</TableHead><TableHead>Amount</TableHead>
          <TableHead>Renewal Date</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((p) => {
            const cl = p.clients as { id: string; client_name: string; business_name: string | null; whatsapp: string | null } | null;
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <Link to="/clients/$id" params={{ id: cl?.id ?? "" }} className="font-medium hover:underline">
                    {cl?.business_name || cl?.client_name}
                  </Link>
                </TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{inr(Number(p.monthly_amount))}</TableCell>
                <TableCell>{formatDate(p.renewal_date)}</TableCell>
                <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={!cl?.whatsapp}>
                          <MessageCircle className="w-4 h-4" />Send Reminder
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Send WhatsApp reminder?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Opens WhatsApp with a pre-filled renewal reminder for {cl?.client_name}. Review before sending — nothing is sent automatically.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => sendWhatsApp(p as Parameters<typeof sendWhatsApp>[0])}>Open WhatsApp</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button size="sm" variant="ghost" onClick={() => markRenewed.mutate({ id: p.id, renewal_date: p.renewal_date })}>
                      <CheckCircle2 className="w-4 h-4" />Renewed
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    )
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Renewals</h1>
        <p className="text-muted-foreground">Track upcoming and overdue package renewals</p>
      </div>

      <Card className="border-destructive/30">
        <CardContent className="p-0">
          <div className="p-4 border-b font-semibold flex items-center gap-2 text-destructive">
            <RefreshCw className="w-4 h-4" />Overdue ({overdue.length})
          </div>
          {renderTable(overdue, "No overdue renewals.")}
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardContent className="p-0">
          <div className="p-4 border-b font-semibold">Upcoming – Next 30 days ({upcoming.length})</div>
          {renderTable(upcoming, "Nothing due in the next 30 days.")}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b font-semibold text-muted-foreground">Later ({later.length})</div>
          {renderTable(later, "No future renewals scheduled.")}
        </CardContent>
      </Card>
    </div>
  );
}
