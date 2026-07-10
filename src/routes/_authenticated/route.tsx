import { createFileRoute, Outlet, Link, useNavigate, redirect, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCompany, ALL } from "@/lib/company";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Moon, Sun, Search, Home } from "lucide-react";
import { Input } from "@/components/ui/input";
import mmbLogo from "@/assets/make-me-brand-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", replace: true });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { selected, setSelected, companies } = useCompany();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <header className="h-14 border-b flex items-center gap-3 px-4 sticky top-0 z-30 bg-background/80 backdrop-blur-xl no-print">
        <Link to="/home" className="flex items-center gap-2">
          <img src={mmbLogo.url} alt="Make Me Brand" className="w-9 h-9 rounded-lg object-contain bg-white p-1 shadow-sm" />
          <span className="hidden sm:inline font-semibold tracking-tight">Make Me Brand</span>
        </Link>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-56 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="hidden md:flex items-center gap-2 ml-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clients, invoices…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  navigate({ to: "/clients", search: { q: search.trim() } as never });
                }
              }}
              className="pl-9 h-9"
            />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 w-full min-w-0 p-3 sm:p-4 md:p-6">
        <InlineHomeButton />
        <Outlet />
      </main>
    </div>
  );
}

function InlineHomeButton() {
  const { pathname } = useLocation();
  if (pathname === "/home") return null;
  return (
    <Link
      to="/home"
      title="Home"
      className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm hover:scale-105 transition-transform mb-3 no-print"
    >
      <Home className="w-4 h-4" />
    </Link>
  );
}



