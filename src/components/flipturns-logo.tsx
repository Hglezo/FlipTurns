export function FlipTurnsLogo({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <circle
        cx="16"
        cy="16"
        r="15"
        className="fill-white stroke-border dark:fill-black dark:stroke-white/30"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="9" r="2.2" className="fill-black dark:fill-white" />
      <path
        d="M16 11.2 L16 18 L14 21 M16 11.2 L18 13 L20 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-black dark:stroke-white"
      />
      <path
        d="M10 24 Q12 22 14 24 Q16 26 18 24 Q20 22 22 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        className="stroke-black dark:stroke-white"
      />
      <path
        d="M10 26 Q12 24 14 26 Q16 28 18 26 Q20 24 22 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        className="stroke-black dark:stroke-white"
      />
    </svg>
  );
}
