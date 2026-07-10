import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Receipt, Wallet, TrendingDown, RefreshCw,
  BarChart3, Settings, FileText, BadgeIndianRupee, Map, History,
} from "lucide-react";
import { useCompany, ALL } from "@/lib/company";

export const Route = createFileRoute("/_authenticated/home")({ component: HomeScreen });

const APPS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, from: "#6366f1", toColor: "#8b5cf6" },
  { to: "/clients", label: "Clients", icon: Users, from: "#06b6d4", toColor: "#3b82f6" },
  { to: "/invoices", label: "Invoices", icon: Receipt, from: "#f59e0b", toColor: "#ef4444" },
  { to: "/quotations", label: "Quotations", icon: FileText, from: "#10b981", toColor: "#059669" },
  { to: "/payments", label: "Payments", icon: Wallet, from: "#22c55e", toColor: "#16a34a" },
  { to: "/collection-map", label: "Collection Map", icon: Map, from: "#0ea5e9", toColor: "#6366f1" },
  { to: "/billing", label: "Billing", icon: BadgeIndianRupee, from: "#f43f5e", toColor: "#ec4899" },
  { to: "/expenses", label: "Expenses", icon: TrendingDown, from: "#ef4444", toColor: "#f97316" },
  { to: "/renewals", label: "Renewals", icon: RefreshCw, from: "#a855f7", toColor: "#6366f1" },
  { to: "/salary", label: "Salary Slips", icon: BadgeIndianRupee, from: "#eab308", toColor: "#f59e0b" },
  { to: "/reports", label: "Reports", icon: BarChart3, from: "#14b8a6", toColor: "#06b6d4" },
  { to: "/history", label: "History", icon: History, from: "#8b5cf6", toColor: "#6366f1" },
  { to: "/settings", label: "Settings", icon: Settings, from: "#64748b", toColor: "#334155" },
] as const;

function HomeScreen() {
  const { selected, companies } = useCompany();
  const title = selected === ALL ? "All Companies" : (companies.find((c) => c.id === selected)?.name || "Home");
  return (
    <div className="relative min-h-[calc(100vh-56px)] -m-3 sm:-m-4 md:-m-6 overflow-hidden">
      {/* Ambient gradient background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-500/10 via-fuchsia-500/5 to-cyan-500/10" />
      <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-fuchsia-500/20 blur-3xl -z-10 animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-cyan-500/20 blur-3xl -z-10 animate-pulse" style={{ animationDelay: "2s" }} />

      <div className="max-w-6xl mx-auto px-6 py-12 sm:py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-cyan-500 bg-clip-text text-transparent">
            {title}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">Tap an app to open</p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-6 sm:gap-8">
          {APPS.map((app, i) => (
            <Link
              key={app.to}
              to={app.to}
              className="group flex flex-col items-center gap-2 focus:outline-none"
              style={{ animation: `float 4s ease-in-out ${i * 0.15}s infinite` }}
            >
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shadow-2xl backdrop-blur-xl border border-white/20 transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-1 group-active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${app.from}, ${app.toColor})`,
                  boxShadow: `0 10px 30px -5px ${app.from}55, 0 0 0 1px rgba(255,255,255,0.1) inset`,
                }}
              >
                <app.icon className="w-8 h-8 sm:w-10 sm:h-10 text-white drop-shadow-md" strokeWidth={2} />
              </div>
              <span className="text-xs sm:text-sm font-medium text-center text-foreground/90 group-hover:text-foreground transition-colors">
                {app.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
