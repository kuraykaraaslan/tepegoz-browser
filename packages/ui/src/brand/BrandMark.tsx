/**
 * Tepegöz brand mark — the cyclops-eye mascot (shield + single eye + stem) from the standalone logo
 * (`docs/Tepegöz Logo (standalone).html`). Decorative: callers that aren't paired with the wordmark
 * should pass a `title`/aria-label on the wrapper. Colors are baked to the brand palette so the mark
 * reads the same on any surface.
 */
interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="20 72 200 200" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="tepegoz-eye">
          <path d="M40 162 Q120 70 200 162 Q120 254 40 162 Z" />
        </clipPath>
      </defs>
      {/* Shield body */}
      <path d="M28 108 Q120 90 212 108 L212 150 Q212 214 120 256 Q28 214 28 150 Z" fill="#1C3D5E" />
      {/* Eye whites (teardrop) */}
      <path d="M40 162 Q120 70 200 162 Q120 254 40 162 Z" fill="#FFFFFF" />
      <g clipPath="url(#tepegoz-eye)">
        <circle cx="120" cy="162" r="50" fill="#06AEC4" />
        <circle cx="120" cy="162" r="23" fill="#0C2135" />
        <circle cx="131" cy="151" r="8.5" fill="#FFFFFF" />
      </g>
      {/* Stem */}
      <path d="M120 210 L120 250" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}
