import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import mmbLogo from "@/assets/make-me-brand-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: AuthPage,
});

function isSafeRelative(path: string | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = isSafeRelative(next) ? next : "/home";
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      if (isSafeRelative(next)) window.location.replace(next);
      else navigate({ to: "/home", replace: true });
    }
  }, [user, navigate, next]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    if (isSafeRelative(next)) window.location.replace(next);
    else navigate({ to: target as "/home", replace: true });
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent. Check your email.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-40">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full blur-3xl gradient-primary opacity-30" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full blur-3xl bg-accent opacity-30" />
      </div>
      <Card className="w-full max-w-md glass shadow-card border-border/50">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-xl bg-white p-1 shadow-glow flex items-center justify-center">
            <img src={mmbLogo.url} alt="Make Me Brand" className="w-full h-full object-contain" />
          </div>
          <CardTitle className="text-2xl">Make Me Brand</CardTitle>
          <CardDescription>Sign in to manage your agency</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="reset">Forgot Password</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="reset">
              <form onSubmit={onReset} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">Email</Label>
                  <Input id="resetEmail" type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  You'll receive an email with a link to set a new password.
                </p>
              </form>
            </TabsContent>
          </Tabs>
          <div className="mt-6 text-center">
            <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground">
              Go to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
