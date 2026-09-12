import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The Khazanay wordmark (public/brand/khazanay-logo-black.png, black on
 * transparent, supplied 12 Sep). Inverted in dark mode so it stays legible.
 * Links home.
 */
export function BrandLogo({ href = "/tag", className, height = "h-6" }: { href?: string; className?: string; height?: string }) {
  return (
    <Link href={href} aria-label="Khazanay home" className={cn("flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/khazanay-logo-black.png" alt="Khazanay" className={cn("w-auto dark:invert", height)} draggable={false} />
    </Link>
  );
}
