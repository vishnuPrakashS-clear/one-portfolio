import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  home: <path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 01-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 014 19.5z" />,
  pie: (
    <>
      <path d="M12 3a9 9 0 109 9h-9z" />
      <path d="M15 3.5A9 9 0 0120.5 9H15z" />
    </>
  ),
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  world: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  pulse: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6l.8.8L7 5M4.5 12l.8.8L7 11M4.5 18l.8.8L7 17" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="3" />
      <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0012 3z" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17.2v.1" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />,
  signout: <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h10" />,
  arrow: <path d="M5 12h13M13 6l6 6-6 6" />,
  back: <path d="M19 12H6M11 6l-6 6 6 6" />,
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none" />,
  sparkles: (
    <path
      d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  orbit: (
    <>
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-25 12 12)" />
    </>
  ),
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

const BADGE = {
  star: <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  pick: (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="17" cy="16" r="4.2" />
      <circle cx="17.5" cy="6" r="1.8" />
      <circle cx="6" cy="17.5" r="1.6" />
    </>
  ),
  shield: <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />,
  hourglass: <path d="M6 2h12v4l-4 6 4 6v4H6v-4l4-6-4-6z" />,
  flame: <path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.8" />
    </>
  ),
  scroll: <path d="M6 3h10a3 3 0 013 3v13a2 2 0 01-2 2H8a3 3 0 01-3-3V5z" />,
} as const;
export function BadgeIcon({ name, className }: { name: keyof typeof BADGE; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" className={cn("size-6", className)}>
      {BADGE[name]}
    </svg>
  );
}
