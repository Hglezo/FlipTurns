"use client";

export function WorkoutDraftTape({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[inherit]"
    >
      <div className="absolute left-1/2 top-1/2 flex w-[170%] -translate-x-1/2 -translate-y-1/2 -rotate-[32deg] justify-center">
        <div
          className="flex w-full items-center justify-center border-y border-amber-700/35 bg-amber-500/88 py-2 shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:border-amber-300/25 dark:bg-amber-500/72 dark:shadow-[0_1px_3px_rgb(0_0_0/0.35)]"
        >
          <span className="px-4 text-center font-black uppercase leading-none tracking-[0.2em] text-amber-950 [text-shadow:0_1px_0_rgb(255_255_255/0.35)] dark:text-amber-950 dark:[text-shadow:0_1px_0_rgb(255_255_255/0.2)] text-[clamp(0.65rem,2.8vw,0.8rem)]">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
