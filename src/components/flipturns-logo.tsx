import Image from "next/image";
import { cn } from "@/lib/utils";

/** Intrinsic size of processed assets in /public (wide swimmer art). */
const LIGHT_NATURAL = { w: 717, h: 260 };
const DARK_NATURAL = { w: 1024, h: 371 };

export function FlipTurnsLogo({ className, size = 24 }: { className?: string; size?: number }) {
  const box = { width: size, height: size } as const;

  return (
    <>
      <Image
        src="/flipturns-logo-light.png"
        alt=""
        width={LIGHT_NATURAL.w}
        height={LIGHT_NATURAL.h}
        unoptimized
        className={cn("shrink-0 object-contain dark:hidden", className)}
        style={box}
        aria-hidden
      />
      <Image
        src="/flipturns-logo-dark.png"
        alt=""
        width={DARK_NATURAL.w}
        height={DARK_NATURAL.h}
        unoptimized
        className={cn("hidden shrink-0 object-contain dark:block", className)}
        style={box}
        aria-hidden
      />
    </>
  );
}
