import { useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    __initGoogleMaps?: () => void;
    __gmLoaded?: boolean;
  }
}

let loadingPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.__gmLoaded && window.google?.maps) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  if (!key) return Promise.reject(new Error("Google Maps browser key missing"));

  loadingPromise = new Promise((resolve, reject) => {
    window.__initGoogleMaps = () => {
      window.__gmLoaded = true;
      resolve();
    };
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback: "__initGoogleMaps",
      libraries: "marker",
    });
    if (channel) params.set("channel", channel);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return loadingPromise;
}

export function useGoogleMaps() {
  const [ready, setReady] = useState<boolean>(() => !!(typeof window !== "undefined" && window.__gmLoaded));
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (ready) return;
    loadScript()
      .then(() => setReady(true))
      .catch((e) => setError(e as Error));
  }, [ready]);
  return { ready, error };
}
