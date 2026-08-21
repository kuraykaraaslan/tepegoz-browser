/**
 * The Tepegöz horizontal logo lockup: the brand emblem (a browser frame — tab dots + a forward arrow —
 * wrapping a watchful cyclops eye) next to the "Tepegöz" wordmark set in Baloo 2.
 *
 * The emblem carries fixed brand navy/cyan through CSS vars (`--navy`/`--cyan`/`--eye`); the app lifts
 * `--navy` on dark surfaces (see `.dark .tepegoz-emblem` in styles.css). The wordmark is plain HTML text
 * in `currentColor`, so it inherits the surrounding text colour and flips with the theme automatically —
 * dark ink on light surfaces, near-white on dark ones (WCAG-AA either way). Mirror of
 * `./assets/tepegoz-logo.svg` — keep the two roughly in sync.
 */
export interface TepegozLogoProps {
  /** Accessible name (localized). */
  label: string;
  /** Extra classes on the root (typically a text colour, e.g. `text-text-primary`). */
  className?: string;
}

/** The brand emblem on its own — a browser frame (agentic tab dots + forward arrow, a security shield)
 *  around the calm cyan eye that watches the web for you. Colours come from the `--navy`/`--cyan`/`--eye`
 *  vars set by `.tepegoz-emblem` in the app CSS (the class also lifts `--navy` on dark surfaces), with
 *  the brand values as `var()` fallbacks so the mark still renders standalone. */
function EmblemMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 240 276" className={className} aria-hidden>
      <clipPath id="tepegoz-eye-clip">
        <path d="M40 162 Q120 70 200 162 Q120 254 40 162 Z" />
      </clipPath>
      {/* Browser frame: three tab dots + a forward arrow → the agentic browser. */}
      <rect x="28" y="26" width="84" height="46" rx="13" style={{ fill: 'var(--navy, #0C2135)' }} />
      <circle cx="50" cy="49" r="7" style={{ fill: 'var(--cyan, #06AEC4)' }} />
      <circle cx="72" cy="49" r="7" style={{ fill: 'var(--cyan, #06AEC4)' }} />
      <circle cx="94" cy="49" r="7" style={{ fill: 'var(--cyan, #06AEC4)' }} />
      <rect
        x="128"
        y="24"
        width="84"
        height="48"
        rx="13"
        style={{ fill: 'var(--cyan, #06AEC4)' }}
      />
      <path
        d="M150 45 H172 V40 L190 49 L172 58 V53 H150 Z"
        style={{ fill: 'var(--eye, #FFFFFF)' }}
      />
      {/* Shield body → security-first. */}
      <path
        d="M28 108 Q120 90 212 108 L212 150 Q212 214 120 256 Q28 214 28 150 Z"
        style={{ fill: 'var(--navy, #0C2135)' }}
      />
      <path d="M40 162 Q120 70 200 162 Q120 254 40 162 Z" style={{ fill: 'var(--eye, #FFFFFF)' }} />
      <g style={{ clipPath: 'url(#tepegoz-eye-clip)' }}>
        <circle cx="120" cy="162" r="50" style={{ fill: 'var(--cyan, #06AEC4)' }} />
        <circle cx="120" cy="162" r="23" style={{ fill: 'var(--navy, #0C2135)' }} />
        <circle cx="131" cy="151" r="8.5" style={{ fill: 'var(--eye, #FFFFFF)' }} />
      </g>
      <path
        d="M120 210 L120 250"
        style={{
          fill: 'none',
          stroke: 'var(--eye, #FFFFFF)',
          strokeWidth: 9,
          strokeLinecap: 'round',
        }}
      />
    </svg>
  );
}

export function TepegozLogo({ label, className }: Readonly<TepegozLogoProps>) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex items-center gap-3 ${className ?? ''}`}
    >
      <EmblemMark className="tepegoz-emblem h-10 w-auto" />
      <span
        aria-hidden
        className="font-wordmark text-[2.1rem] font-extrabold leading-none tracking-[-0.01em]"
      >
        {/* brand wordmark (proper noun), never translated */}
        {'Tepegöz'}
      </span>
    </span>
  );
}
