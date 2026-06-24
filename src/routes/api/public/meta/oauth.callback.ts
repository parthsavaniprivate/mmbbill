import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/meta/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateId = url.searchParams.get("state");
        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err) return htmlClose(false, `Meta returned an error: ${err}`);
        if (!code || !stateId) return htmlClose(false, "Missing code or state");
        if (!/^[0-9a-f-]{36}$/i.test(stateId)) return htmlClose(false, "Invalid state");

        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        if (!appId || !appSecret) return htmlClose(false, "Meta app credentials not configured");

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabasePublishable) {
          return htmlClose(false, "Supabase not configured");
        }

        const redirectUri = `${url.origin}/api/public/meta/oauth/callback`;
        const meta = await import("@/lib/meta-api.server");

        try {
          const short = await meta.exchangeCodeForToken({ code, redirectUri, appId, appSecret });
          const long = await meta.exchangeLongLivedToken({ shortToken: short.access_token, appId, appSecret });
          const me = await meta.getMe(long.access_token);
          const expiresAt = long.expires_in
            ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null;

          // No service-role key needed — the SECURITY DEFINER RPC validates the
          // single-use state row created by the signed-in admin and inserts the
          // pending meta_accounts record on their behalf.
          const sb = createClient<Database>(supabaseUrl, supabasePublishable, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          const { error } = await sb.rpc("complete_meta_oauth", {
            _state_id: stateId,
            _meta_user_id: me.id,
            _meta_user_name: me.name,
            _access_token: long.access_token,
            _token_expires_at: expiresAt as string,
          });
          if (error) return htmlClose(false, error.message);

          return htmlClose(true, "Connected", "/meta");
        } catch (e) {
          return htmlClose(false, e instanceof Error ? e.message : "Connection failed");
        }
      },
    },
  },
});

function htmlClose(ok: boolean, msg: string, back = "/meta") {
  const payload = JSON.stringify({ type: "meta_oauth_done", ok, message: msg });
  const fallback = ok ? `${back}?connected=1` : back;
  const body = `<!doctype html><html><body style="background:#0a0a0a;color:#eee;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center;max-width:480px;padding:24px">
      <h2 style="margin:0 0 8px">${ok ? "Meta connected" : "Meta connection failed"}</h2>
      <p style="opacity:.8">${msg.replace(/</g, "&lt;")}</p>
      <p style="opacity:.6;font-size:13px">You can close this window.</p>
    </div>
    <script>
      (function(){
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(${payload}, "*");
            setTimeout(function(){ window.close(); }, 400);
            return;
          }
        } catch(e){}
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.replace(${JSON.stringify(fallback)});
          } else {
            window.location.replace(${JSON.stringify(fallback)});
          }
        } catch(e) {
          window.location.replace(${JSON.stringify(fallback)});
        }
      })();
    </script>
  </body></html>`;
  return new Response(body, {
    status: ok ? 200 : 400,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "DENY",
    },
  });
}
