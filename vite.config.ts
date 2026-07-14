// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// When BUILD_TARGET=capacitor, we build a fully static SPA suitable for
// packaging into an Android APK via Capacitor. This keeps the normal web
// build (Lovable preview + publish) untouched.
const isCapacitorBuild = process.env.BUILD_TARGET === "capacitor";

export default defineConfig({
  plugins: [mcpPlugin()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(isCapacitorBuild
      ? {
          // TanStack Start SPA mode: prerender a single static shell and
          // hydrate on the client. No SSR runtime is required at serve time.
          spa: {
            enabled: true,
            prerender: { outputPath: "/index.html" },
          },
        }
      : {}),
  },
});
