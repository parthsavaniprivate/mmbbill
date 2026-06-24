import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyMetaAccounts, listPendingBusinesses, listBusinessAdAccounts,
  selectAdAccount, disconnectMetaAccount, syncMetaAccount,
} from "@/lib/meta.functions";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Facebook, RefreshCw, Plug, Unplug, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/meta/")({
  validateSearch: (s: Record<string, unknown>): { connected?: string } =>
    typeof s.connected === "string" ? { connected: s.connected } : {},
  component: MetaIndex,
});

function MetaIndex() {
  const nav = useNavigate();
  const { connected } = Route.useSearch();
  const { selected, isAll, companies } = useCompany();
  const list = useServerFn(listMyMetaAccounts);
  const sync = useServerFn(syncMetaAccount);
  const disconnect = useServerFn(disconnectMetaAccount);
  const qc = useQueryClient();
  const [pickerRow, setPickerRow] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["meta-accounts"],
    queryFn: () => list(),
  });

  useEffect(() => {
    if (connected) {
      toast.success("Meta account connected — pick the Ad Account to sync");
      const pending = accounts.find(a => a.status === "pending_account_select");
      if (pending) setPickerRow(pending.id);
      nav({ to: "/meta", search: {}, replace: true });
    }
  }, [connected, accounts, nav]);

  const filtered = accounts.filter(a => isAll || a.company_id === selected);

  const syncMut = useMutation({
    mutationFn: (rowId: string) => sync({ data: { rowId } }),
    onSuccess: (r) => { toast.success(`Synced ${r.rows} rows`); qc.invalidateQueries({ queryKey: ["meta-accounts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: (rowId: string) => disconnect({ data: { rowId } }),
    onSuccess: () => { toast.success("Disconnected"); qc.invalidateQueries({ queryKey: ["meta-accounts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const startConnect = async () => {
    if (isAll) { toast.error("Pick a company first"); return; }
    const origin = window.location.origin;

    // Create a single-use OAuth state row as the signed-in admin.
    // The callback uses a SECURITY DEFINER RPC keyed off this id —
    // no Supabase service role key is needed on the server.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) { toast.error("You must be signed in"); return; }
    const { data: state, error: stateErr } = await supabase
      .from("meta_oauth_states")
      .insert({ company_id: selected!, created_by: userRes.user.id, return_to: "/meta" })
      .select("id")
      .single();
    if (stateErr || !state) { toast.error(stateErr?.message ?? "Could not start connection"); return; }

    const url = `${origin}/api/public/meta/oauth/start?state=${state.id}`;

    // Open in a popup to escape the Lovable preview iframe (Facebook blocks iframe embedding)
    const w = 600, h = 750;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      url,
      "meta_oauth",
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=no`,
    );

    if (!popup) {
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = url;
          return;
        }
      } catch {
        // cross-origin top access blocked — fall through
      }
      toast.error("Popup blocked. Please allow popups for this site.");
      return;
    }

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin) return;
      if (e.data?.type === "meta_oauth_done") {
        window.removeEventListener("message", onMessage);
        try { popup.close(); } catch { /* noop */ }
        if (e.data.ok) {
          toast.success("Meta account connected");
          qc.invalidateQueries({ queryKey: ["meta-accounts"] });
          nav({ to: "/meta", search: { connected: "1" }, replace: true });
        } else {
          toast.error(e.data.message || "Meta connection failed");
        }
      }
    };
    window.addEventListener("message", onMessage);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Facebook className="w-6 h-6 text-primary" /> Meta Ads
          </h1>
          <p className="text-sm text-muted-foreground">Connect Meta ad accounts and view campaign performance, spend and leads.</p>
        </div>
        <Button onClick={startConnect} disabled={isAll}>
          <Plug className="w-4 h-4" /> Connect Meta Account
        </Button>
      </div>

      {isAll && (
        <Card><CardContent className="py-3 text-sm text-muted-foreground">
          Select a single company in the top bar to connect a Meta account.
        </CardContent></Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Ad Account</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last synced</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
              {!isLoading && !filtered.length && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No Meta accounts connected yet.
                </TableCell></TableRow>
              )}
              {filtered.map(a => {
                const comp = companies.find(c => c.id === a.company_id);
                return (
                  <TableRow key={a.id}>
                    <TableCell>{comp?.name ?? "—"}</TableCell>
                    <TableCell>{a.business_name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.ad_account_id ? <Link to="/meta/$accountId" params={{ accountId: a.id }} className="hover:underline text-primary">
                        {a.ad_account_name || a.ad_account_id}
                      </Link> : <span className="text-muted-foreground">not selected</span>}
                    </TableCell>
                    <TableCell>{a.currency ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "active" ? "default" : a.status === "error" ? "destructive" : "secondary"}>
                        {a.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.last_synced_at ? formatDate(a.last_synced_at) : "—"}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {a.status === "pending_account_select" && (
                        <Button size="sm" variant="outline" onClick={() => setPickerRow(a.id)}>Pick Ad Account</Button>
                      )}
                      {a.status === "active" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => syncMut.mutate(a.id)} disabled={syncMut.isPending}>
                            <RefreshCw className={`w-3.5 h-3.5 ${syncMut.isPending ? "animate-spin" : ""}`} /> Sync
                          </Button>
                          <Link to="/meta/$accountId" params={{ accountId: a.id }}>
                            <Button size="sm" variant="ghost"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </Link>
                        </>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => { if (confirm("Disconnect this Meta account?")) disconnectMut.mutate(a.id); }}>
                        <Unplug className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pickerRow && <AdAccountPicker rowId={pickerRow} onClose={() => setPickerRow(null)} />}
    </div>
  );
}

function AdAccountPicker({ rowId, onClose }: { rowId: string; onClose: () => void }) {
  const listPending = useServerFn(listPendingBusinesses);
  const listBiz = useServerFn(listBusinessAdAccounts);
  const select = useServerFn(selectAdAccount);
  const qc = useQueryClient();
  const [businessId, setBusinessId] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["meta-pending", rowId],
    queryFn: () => listPending({ data: { rowId } }),
  });

  const { data: bizAccounts } = useQuery({
    queryKey: ["meta-biz-accs", rowId, businessId],
    enabled: !!businessId,
    queryFn: () => listBiz({ data: { rowId, businessId } }),
  });

  const accounts = businessId ? (bizAccounts ?? []) : (data?.accounts ?? []);

  const mut = useMutation({
    mutationFn: async (acc: typeof accounts[number]) => {
      const biz = data?.businesses.find(b => b.id === businessId);
      return select({ data: {
        rowId,
        businessId: businessId || null,
        businessName: biz?.name ?? null,
        adAccountId: acc.id,
        adAccountName: acc.name,
        currency: acc.currency,
        timezone: acc.timezone_name,
      }});
    },
    onSuccess: () => {
      toast.success("Ad account linked — running first sync");
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Select Ad Account</DialogTitle></DialogHeader>
        {isLoading && <div className="text-sm text-muted-foreground">Loading from Meta…</div>}
        {!isLoading && data && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Business Manager (optional)</label>
              <Select value={businessId} onValueChange={setBusinessId}>
                <SelectTrigger><SelectValue placeholder="All ad accounts" /></SelectTrigger>
                <SelectContent>
                  {data.businesses.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-80 overflow-auto border rounded-md">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>ID</TableHead><TableHead>Currency</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {accounts.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{a.name}</TableCell>
                      <TableCell className="font-mono text-xs">{a.id}</TableCell>
                      <TableCell>{a.currency}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => mut.mutate(a)} disabled={mut.isPending}>Use this</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!accounts.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No ad accounts found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
