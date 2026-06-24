import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const companyId = url.searchParams.get("company_id");
        const returnTo = url.searchParams.get("return_to") || "/meta";
        if (!companyId) return new Response("company_id required", { status: 400 });

        const appId = process.env.META_APP_ID;
        if (!appId) return new Response("META_APP_ID not configured", { status: 500 });

        const origin = url.origin;
        const redirectUri = `${origin}/api/public/meta/oauth/callback`;
        const state = Buffer.from(JSON.stringify({
          company_id: companyId, return_to: returnTo, nonce: crypto.randomUUID(),
        })).toString("base64url");

        const fb = new URL("https://www.facebook.com/v21.0/dialog/oauth");
        fb.searchParams.set("client_id", appId);
        fb.searchParams.set("redirect_uri", redirectUri);
        fb.searchParams.set("state", state);
        fb.searchParams.set("response_type", "code");
        fb.searchParams.set("scope", "ads_read,ads_management,business_management,read_insights,pages_show_list");
        return Response.redirect(fb.toString(), 302);
      },
    },
  },
});
