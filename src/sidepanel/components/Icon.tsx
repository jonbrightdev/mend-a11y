import type { JSX } from 'preact';

type IconProps = { size?: number } & JSX.SVGAttributes<SVGSVGElement>;

function svg(path: JSX.Element, size: number, rest: JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  );
}

export const PlayIcon = ({ size = 16, ...r }: IconProps) =>
  svg(<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />, size, r);

export const RefreshIcon = ({ size = 16, ...r }: IconProps) =>
  svg(
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>,
    size,
    r,
  );

export const ChevronRight = ({ size = 16, ...r }: IconProps) =>
  svg(<polyline points="9 6 15 12 9 18" />, size, r);

export const ChevronLeft = ({ size = 16, ...r }: IconProps) =>
  svg(<polyline points="15 6 9 12 15 18" />, size, r);

export const ArrowLeft = ({ size = 16, ...r }: IconProps) =>
  svg(
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </>,
    size,
    r,
  );

export const TargetIcon = ({ size = 16, ...r }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="1" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="23" />
      <line x1="1" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="23" y2="12" />
    </>,
    size,
    r,
  );

export const CopyIcon = ({ size = 15, ...r }: IconProps) =>
  svg(
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
    size,
    r,
  );

export const FilterIcon = ({ size = 16, ...r }: IconProps) =>
  svg(<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" />, size, r);

export const SettingsIcon = ({ size = 16, ...r }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
    size,
    r,
  );

export const CloseIcon = ({ size = 18, ...r }: IconProps) =>
  svg(
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>,
    size,
    r,
  );

export const AlertIcon = ({ size = 18, ...r }: IconProps) =>
  svg(
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>,
    size,
    r,
  );

export const CheckIcon = ({ size = 16, ...r }: IconProps) =>
  svg(<polyline points="20 6 9 17 4 12" />, size, r);

export const ShieldIcon = ({ size = 14, ...r }: IconProps) =>
  svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, size, r);

export const DotsIcon = ({ size = 18, ...r }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </>,
    size,
    r,
  );

export const ExternalIcon = ({ size = 13, ...r }: IconProps) =>
  svg(
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </>,
    size,
    r,
  );

export const EyeOffIcon = ({ size = 15, ...r }: IconProps) =>
  svg(
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </>,
    size,
    r,
  );

export const TextSpacingIcon = ({ size = 16, ...r }: IconProps) =>
  svg(
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h11" />
      <path d="M19 14v6" />
      <path d="m17 15.5 2-1.5 2 1.5" />
      <path d="m17 18.5 2 1.5 2-1.5" />
    </>,
    size,
    r,
  );
