import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden className="shrink-0">
        <rect width="28" height="28" rx="7" fill="url(#pk-grad)" />
        <path
          d="M9 7v14m0-14h4.5a4 4 0 0 1 0 8H9m8-8v9.8"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="pk-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="hsl(22 90% 55%)" />
            <stop offset="1" stopColor="hsl(14 85% 50%)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-base font-semibold tracking-tight">پاکینو</span>
    </span>
  );
}
