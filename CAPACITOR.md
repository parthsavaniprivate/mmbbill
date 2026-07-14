# Android APK build (Capacitor)

This project is a TanStack Start web app that also builds as a static SPA for
packaging into an Android APK via Capacitor. The two builds share all UI and
Supabase code — nothing in `src/` is duplicated.

## What runs where

| Piece | Web (Lovable) | Android APK |
| --- | --- | --- |
| React UI, routes, Supabase queries | ✅ | ✅ |
| `createServerFn` calls (e.g. geocoding) | ✅ same-origin | ⚠️ must target the hosted Lovable URL — see below |
| `/mcp` route | ✅ | ❌ not bundled |
| `/api/*` server routes | ✅ | ❌ not bundled |

The APK is a pure SPA: no Node/Nitro runtime ships inside it. Anything under
`src/routes/api/`, the MCP server, and any `.functions.ts` server function
does not exist at runtime in the APK. Features that depend on them must call
the hosted Lovable URL (`https://invoicemmb.lovable.app`) over HTTPS from the
client.

Geocoding today uses `src/lib/geocode.functions.ts` — in the APK, either
call the hosted endpoint from the client, or switch that feature to a
browser-side Google Maps call with a domain-restricted key.

## One-time setup

```bash
# Install Android Studio + JDK 21 first.
bun install
bunx cap add android      # scaffolds ./android/ (only needed once)
```

## Build the APK

```bash
bun run cap:sync          # 1. builds dist/ with SPA mode, 2. copies into android/
bun run cap:open          # opens the project in Android Studio
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## How the SPA build works

* `bun run build:capacitor` sets `BUILD_TARGET=capacitor` and runs `vite build`.
* `vite.config.ts` enables TanStack Start's SPA mode (`spa.enabled = true`)
  only when that env var is set — the normal `bun run build` (used by Lovable
  preview and publish) is untouched.
* SPA mode prerenders a static shell to `.output/public/index.html` and emits
  hashed asset bundles alongside it.
* `scripts/build-capacitor.mjs` copies `.output/public` → `dist/` for
  Capacitor.

## Notes

* Both builds read Supabase credentials from `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`, so auth, RLS, and realtime work inside the
  APK exactly like the web app.
* Deep links inside the SPA rely on TanStack Router's client-side history —
  no server rewrites needed because the WebView always serves `index.html`.
* If you point `capacitor.config.ts`'s `server.url` at
  `https://invoicemmb.lovable.app`, the APK loads the live web app instead of
  its bundled assets (useful for testing without a rebuild). Leave it unset
  for a true offline-capable install.
