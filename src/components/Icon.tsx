import type { SVGProps } from 'react';

const PATHS = {
  plus: 'M8 3.5v9M3.5 8h9',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v4M9.2 7v4',
  copy: 'M5.5 5.5V3.5h7v7h-2M3.5 5.5h7v7h-7z',
  check: 'M3.5 8.5l3 3 6-7',
  alert: 'M8 2.8l5.8 10.2H2.2L8 2.8zM8 6.5v3M8 11.3v.2',
  info: 'M8 13.5A5.5 5.5 0 1 0 8 2.5a5.5 5.5 0 0 0 0 11zM8 7.3v3.7M8 5v.2',
  x: 'M4 4l8 8M12 4l-8 8',
  minus: 'M4 8h8',
  chevronDown: 'M4.5 6.5L8 10l3.5-3.5',
  upload: 'M8 10.5V3M5 6l3-3 3 3M3 10.5v2.5h10v-2.5',
  download: 'M8 3v7.5M5 7.5l3 3 3-3M3 10.5v2.5h10v-2.5',
  link: 'M6.8 9.2l2.4-2.4M7.5 4.8l1-1a2.5 2.5 0 0 1 3.6 3.6l-1 1M8.5 11.2l-1 1a2.5 2.5 0 0 1-3.6-3.6l1-1',
  sun: 'M8 10.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1',
  moon: 'M12.8 9.6A5.2 5.2 0 0 1 6.4 3.2a5.2 5.2 0 1 0 6.4 6.4z',
  monitor: 'M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3',
  external: 'M9.5 3h3.5v3.5M13 3L7.5 8.5M11 9.5V13H3V5h3.5',
  refresh: 'M12.5 5.5A5 5 0 1 0 13 9M12.5 2.5v3h-3',
  printer: 'M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7z',
  file: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
  arrowRight: 'M3 8h10M9 4l4 4-4 4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
