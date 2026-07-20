import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const SESSION_KEY = "app_unlocked_v1";

function currentPin(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PasscodeGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (unlocked) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [unlocked]);

  useEffect(() => {
    if (unlocked || value.length !== 4) return;
    if (value === currentPin()) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setUnlocked(true);
    } else {
      setError(true);
      setTimeout(() => {
        setValue("");
        setError(false);
      }, 600);
    }
  }, [value, unlocked]);

  if (unlocked) return <>{children}</>;

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Enter passcode</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The passcode is the current time in 24-hour format (HHMM).
          </p>
          <p className="mt-3 font-mono text-3xl tracking-widest tabular-nums">
            {hh}:{mm}<span className="text-muted-foreground text-lg">:{ss}</span>
          </p>
        </div>
        <div className={`flex justify-center ${error ? "animate-pulse" : ""}`}>
          <InputOTP maxLength={4} value={value} onChange={setValue} autoFocus>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        {error && <p className="text-sm text-destructive">Wrong passcode. Try again.</p>}
      </div>
    </div>
  );
}
