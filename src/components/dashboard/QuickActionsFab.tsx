import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Receipt, UserPlus, TrendingDown, Wallet, BarChart3, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { to: "/invoices/new", label: "New Invoice", icon: Receipt, bg: "bg-blue-500" },
  { to: "/clients", label: "New Client", icon: UserPlus, bg: "bg-purple-500" },
  { to: "/expenses", label: "Add Expense", icon: TrendingDown, bg: "bg-orange-500" },
  { to: "/payments", label: "Record Payment", icon: Wallet, bg: "bg-emerald-500" },
  { to: "/reports", label: "Generate Report", icon: BarChart3, bg: "bg-cyan-500" },
] as const;

export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 no-print">
      {open && (
        <div className="flex flex-col items-end gap-2 animate-fade-in">
          {ACTIONS.map((a) => (
            <Link key={a.to} to={a.to} onClick={() => setOpen(false)}
              className="flex items-center gap-2 group">
              <span className="text-xs font-medium bg-card border border-border/60 shadow-md px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                {a.label}
              </span>
              <span className={cn("w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 transition-transform", a.bg)}>
                <a.icon className="w-5 h-5" />
              </span>
            </Link>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick actions"
        className={cn("w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white transition-all",
          "bg-gradient-to-br from-primary to-primary/70 hover:scale-110",
          open && "rotate-45")}
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>
    </div>
  );
}
