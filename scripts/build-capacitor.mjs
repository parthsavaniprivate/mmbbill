#!/usr/bin/env node
/**
 * Post-build helper for the Capacitor SPA build.
 *
 * TanStack Start (via nitro) writes its static output to `.output/public/`.
 * Capacitor expects everything the WebView loads to live in `dist/`, so we
 * copy the built shell + assets over verbatim.
 */
import { cpSync, existsSync, rmSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const src = resolve(cwd, ".output/public");
const dest = resolve(cwd, "dist");

if (!existsSync(src)) {
  console.error(
    `[capacitor] Expected build output at ${src} but it does not exist.\n` +
      "Did you run `BUILD_TARGET=capacitor vite build` first?",
  );
  process.exit(1);
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

const files = readdirSync(dest);
if (!files.includes("index.html")) {
  console.error(
    `[capacitor] Copied output to ${dest} but no index.html was found.\n` +
      "SPA prerender may have failed — check the build log above.",
  );
  process.exit(1);
}

console.log(`[capacitor] Copied ${files.length} entries → dist/`);
console.log("[capacitor] Next: bunx cap sync android && bunx cap open android");
