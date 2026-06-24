import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/meta/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const stateId = url.searchParams.get("state");
        if (!stateId) return new Response("state required", { status: 400 });

        const appId = process.env.META_APP_ID;
        if (!appId) return new Response("META_APP_ID not configured", { status: 500 });

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabasePublishable) {
          return new Response("Supabase not configured", { status: 500 });
        }

        // Validate the state row exists and is not expired/used. The row is created
        // by an authenticated admin from the client before redirecting here.
        const sb = createClient<Database>(supabaseUrl, supabasePublishable, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        // Note: with anon key the SELECT will be blocked by RLS (admin-only),
        // so we rely on the callback's SECURITY DEFINER RPC to validate.
        // Here we only sanity-check the UUID shape.
        if (!/^[0-9a-f-]{36}$/i.test(stateId)) {
          return new Response("Invalid state", { status: 400 });
        }
        void sb;

        const origin = url.origin;
        const redirectUri = `${origin}/api/public/meta/oauth/callback`;

        const fb = new URL("https://www.facebook.com/v21.0/dialog/oauth");
        fb.searchParams.set("client_id", appId);
        fb.searchParams.set("redirect_uri", redirectUri);
        fb.searchParams.set("state", stateId);
        fb.searchParams.set("response_type", "code");
        fb.searchParams.set("scope", "ads_read,ads_management,business_management,read_insights,pages_show_list");
        return Response.redirect(fb.toString(), 302);
      },
    },
  },
});
