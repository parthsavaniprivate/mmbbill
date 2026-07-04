import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const schema = z.object({ address: z.string().min(3).max(500) });

export const geocodeAddress = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmapsKey) throw new Error("Google Maps not configured");

    const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(data.address)}&region=in`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmapsKey,
      },
    });
    if (!r.ok) throw new Error(`Geocoding failed (${r.status})`);
    const j = (await r.json()) as {
      status: string;
      results: { geometry: { location: { lat: number; lng: number } }; formatted_address: string }[];
    };
    if (j.status !== "OK" || !j.results?.[0]) return { lat: null, lng: null, formatted: null };
    const { lat, lng } = j.results[0].geometry.location;
    return { lat, lng, formatted: j.results[0].formatted_address };
  });
