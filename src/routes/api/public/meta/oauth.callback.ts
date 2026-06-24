import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateRaw = url.searchParams.get("state");
        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err) return htmlClose(`Meta returned an error: ${err}`);
        if (!code || !stateRaw) return htmlClose("Missing code or state");

        let state: { company_id: string; return_to?: string };
        try {
          state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
        } catch {
          return htmlClose("Invalid state");
        }

        const appId = process.env.META_APP_ID!;
        const appSecret = process.env.META_APP_SECRET!;
        if (!appId || !appSecret) return htmlClose("Meta app credentials not configured");

        const redirectUri = `${url.origin}/api/public/meta/oauth/callback`;
        const meta = await import("@/lib/meta-api.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          const short = await meta.exchangeCodeForToken({ code, redirectUri, appId, appSecret });
          const long = await meta.exchangeLongLivedToken({ shortToken: short.access_token, appId, appSecret });
          const me = await meta.getMe(long.access_token);
          const expiresAt = long.expires_in
            ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null;

          await supabaseAdmin.from("meta_accounts").insert({
            company_id: state.company_id,
            meta_user_id: me.id,
            meta_user_name: me.name,
            access_token: long.access_token,
            token_expires_at: expiresAt,
            status: "pending_account_select",
          });

          const back = state.return_to || "/meta";
          return new Response(
            `<html><body style="background:#0a0a0a;color:#eee;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh">
              <div>Meta account connected. Redirecting…</div>
              <script>window.location.replace(${JSON.stringify(back + "?connected=1")})</script>
            </body></html>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          );
        } catch (e) {
          return htmlClose(e instanceof Error ? e.message : "Connection failed");
        }
      },
    },
  },
});

function htmlClose(msg: string) {
  return new Response(
    `<html><body style="background:#0a0a0a;color:#eee;font-family:system-ui;padding:24px">
      <h2>Meta connection failed</h2><p>${msg.replace(/</g, "&lt;")}</p>
      <p><a style="color:#60a5fa" href="/meta">Back to Meta Ads</a></p>
    </body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
