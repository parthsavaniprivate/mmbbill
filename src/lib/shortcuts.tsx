import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type ShortcutCtx = { openHelp: () => void };
const Ctx = createContext<ShortcutCtx>({ openHelp: () => {} });
export const useShortcuts = () => useContext(Ctx);

export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Alt + N", label: "New Invoice" },
  { keys: "Alt + Q", label: "New Quotation" },
  { keys: "Alt + C", label: "Clients" },
  { keys: "Alt + P", label: "Payments" },
  { keys: "Alt + E", label: "Expenses" },
  { keys: "Alt + D", label: "Dashboard" },
  { keys: "Alt + H", label: "Home" },
  { keys: "Alt + B", label: "Billing" },
  { keys: "Alt + R", label: "Reports" },
  { keys: "Ctrl + K  or  /", label: "Focus search" },
  { keys: "Ctrl + S", label: "Save (in forms)" },
  { keys: "Esc", label: "Go back / close dialog" },
  { keys: "Shift + ?", label: "Show this help" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const focusSearch = () => {
      const el = document.getElementById("global-search") as HTMLInputElement | null;
      if (el) { el.focus(); el.select(); }
    };

    const clickSave = () => {
      const btn = document.querySelector<HTMLButtonElement>('[data-shortcut="save"]');
      if (btn) { btn.click(); return true; }
      return false;
    };

    const hasOpenDialog = () =>
      !!document.querySelector('[role="dialog"][data-state="open"]');

    const onKey = (e: KeyboardEvent) => {
      // Esc — let dialog close natively; otherwise go back one step
      if (e.key === "Escape") {
        if (hasOpenDialog()) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        router.history.back();
        return;
      }

      // Ctrl/Cmd + K → focus search
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearch();
        return;
      }

      // Ctrl/Cmd + S → save
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        if (clickSave()) e.preventDefault();
        return;
      }

      // "/" → focus search (when not typing)
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        focusSearch();
        return;
      }

      // Shift + ? → help
      if (e.shiftKey && (e.key === "?" || e.key === "/") && !isTypingTarget(e.target)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Alt + <letter> → navigation
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const k = e.key.toLowerCase();
        const map: Record<string, string> = {
          n: "/invoices/new",
          q: "/quotations/new",
          c: "/clients",
          p: "/payments",
          e: "/expenses",
          d: "/dashboard",
          h: "/home",
          b: "/billing",
          r: "/reports",
        };
        const to = map[k];
        if (to) {
          e.preventDefault();
          navigate({ to });
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, router]);

  return (
    <Ctx.Provider value={{ openHelp: () => setHelpOpen(true) }}>
      {children}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>Move around faster — Tally-style.</DialogDescription>
          </DialogHeader>
          <div className="divide-y">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <kbd className="px-2 py-1 rounded bg-muted font-mono text-xs">{s.keys}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
