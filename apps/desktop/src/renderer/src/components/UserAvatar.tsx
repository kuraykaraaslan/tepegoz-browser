import { cn } from '@tepegoz/ui';

/**
 * The user's avatar. When signed in with a photo, pass `pictureUrl` to render it (circular, cropped).
 * PLACEHOLDER for now (no auth yet): with no picture it falls back to a letter-avatar — the first
 * initial of `name` on a tinted circle — which stands in for the real profile picture. Size + text
 * size come from `className` (e.g. `h-5 w-5 text-[11px]`).
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
    return <img src={pictureUrl} alt="" className={cn('rounded-full object-cover', className)} />;
  }
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center rounded-full bg-primary/20 font-semibold uppercase leading-none text-primary',
        className,
      )}
    >
      {initial.length > 0 ? initial : '?'}
    </span>
  );
}
