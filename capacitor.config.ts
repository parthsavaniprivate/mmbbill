import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor config for the Android APK build.
//
// The web assets are produced by `bun run build:capacitor`, which runs the
// TanStack Start build with SPA mode enabled and copies the static output
// into `dist/`. That folder is what gets packaged into the APK.
//
// Because this is a SPA (no server functions inside the APK), any feature
// that today talks to a same-origin server function will instead call the
// hosted Lovable URL. Configure that origin via the CAPACITOR_SERVER_URL env
// variable at build time, or leave `server` unset to bundle the SPA only.
const hostedOrigin = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "app.lovable.invoicemmb",
  appName: "Agency OS",
  webDir: "dist",
  ...(hostedOrigin
    ? {
        server: {
          // Only useful when you want the APK to load the live published
          // site instead of the bundled assets (e.g. for testing).
          url: hostedOrigin,
          cleartext: false,
        },
      }
    : {}),
};

export default config;
