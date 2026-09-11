import Link from "next/link";

import { cn } from "@/lib/utils";

/** The Khazanay mark: a K monogram on a rounded tile, with the wordmark. Links home. */
export function BrandLogo({ href = "/tag", compact = false, className }: { href?: string; compact?: boolean; className?: string }) {
  return (
    <Link href={href} aria-label="Khazanay home" className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 40 40" className="size-8 shrink-0" aria-hidden>
        <rect x="1" y="1" width="38" height="38" rx="9" fill="currentColor" />
        <path d="M12 9h6v9.5L27 9h7L23.5 20 34 31h-7l-9-10.5V31h-6z" fill="var(--background, #fff)" />
      </svg>
      {!compact && <span className="text-base font-black tracking-tight">Khazanay</span>}
    </Link>
  );
}
