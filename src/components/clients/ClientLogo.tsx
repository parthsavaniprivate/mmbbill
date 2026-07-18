import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logoUrl?: string | null;
  className?: string;
  textClassName?: string;
};

export function ClientLogo({ name, logoUrl, className, textClassName }: Props) {
  const initials = (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  if (logoUrl) {
    return (
      <div
        className={cn(
          "overflow-hidden bg-white ring-1 ring-border/60",
          className,
        )}
      >
        <img src={logoUrl} alt={name} className="h-full w-full object-contain" loading="lazy" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "grid place-items-center bg-gradient-to-br from-primary/20 to-primary/5 font-semibold text-primary ring-1 ring-primary/15",
        className,
      )}
      aria-hidden
    >
      <span className={cn("text-[11px]", textClassName)}>{initials}</span>
    </div>
  );
}

/**
 * Resize + compress an image file to a small square data URL.
 * Keeps everything client-side; the encoded string is saved to
 * `clients.logo_url` — no storage bucket needed.
 */
export async function fileToLogoDataUrl(file: File, maxSize = 192): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  // WebP gives best compression across browsers we support.
  const dataUrl = canvas.toDataURL("image/webp", 0.85);
  if (dataUrl.length > 200_000) {
    // Fallback: reduce quality if the encoded string is huge.
    return canvas.toDataURL("image/webp", 0.7);
  }
  return dataUrl;
}
