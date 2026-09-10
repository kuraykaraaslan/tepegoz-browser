import { cn } from '@tepegoz/ui';

/**
 * The user's avatar. When signed in with a photo, pass `pictureUrl` to render it (circular, cropped).
 * PLACEHOLDER for now (no auth yet): with no picture it falls back to a letter-avatar — the first
 * initial of `name` on a SOLID accent-filled circle — which stands in for the real profile picture.
 * Size + text size come from `className` (e.g. `h-5 w-5 text-[11px]`).
 *
 * The fill is `--primary` (not a translucent tint) and the initial is `--primary-fg`. On a custom
 * theme colour both are re-derived by `applyTheme()` to keep the disc >= 3:1 against the toolbar and
 * the initial >= 4.5:1 against the disc — so the button never fades into the page's theme-color the
 * way a `bg-primary/20` tint did (Chrome likewise draws the account chip as a solid disc).
 */
export function UserAvatar({
  name,
  pictureUrl,
  className,
}: {
  name: string;
  pictureUrl?: string | null;
  className?: string;
}) {
  if (pictureUrl !== undefined && pictureUrl !== null && pictureUrl.length > 0) {
    return (
      <img
        src={pictureUrl}
        alt=""
        className={cn(
          'rounded-full object-cover ring-1 ring-inset ring-black/10 dark:ring-white/15',
          className,
        )}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center rounded-full bg-primary font-semibold uppercase leading-none text-primary-fg',
        className,
      )}
    >
      {initial.length > 0 ? initial : '?'}
    </span>
  );
}
