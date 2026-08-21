import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShield } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@tepegoz/ui';
import type { GroupRouteBadge, RouteLegStatus, TabStripLabels } from './tab-strip-types';

/**
 * The shield that says where a tab group's traffic goes (Phase 5).
 *
 * A group resolves to exactly ONE route, so "this group is on the VPN *and* on Tor" is a single chained
 * route: Tor running through the VPN. That is why the badge can be split — it is not two routes drawn
 * together, it is the two legs of one, and the user needs both healths because either leg dying cuts the
 * group.
 *
 * **Colour is never the only signal.** Every state also has words, through the badge's accessible name and
 * tooltip. A red-green shield is unreadable to a large share of people, and this particular red-vs-green
 * is the difference between "protected" and "not protected", which is the last thing to encode in hue
 * alone.
 *
 * No badge at all for a Direct group. A shield on every group would make the ones that matter harder to
 * find, and the absence already means "not tunneled".
 */

/** VPN leg: the ordinary health colours. */
function vpnColor(status: RouteLegStatus): string {
  if (status === 'up') return 'text-success';
  if (status === 'connecting') return 'text-warning';
  return 'text-error';
}

/** Tor leg: purple when it is carrying traffic, grey when it is not — Tor is a different KIND of thing
 *  from a VPN, so it gets its own hue rather than sharing the health palette. */
function torColor(status: RouteLegStatus): string {
  return status === 'up' ? 'text-purple-400' : 'text-text-disabled';
}

function legWord(status: RouteLegStatus, labels: TabStripLabels): string {
  if (status === 'up') return labels.routeLegUp ?? 'connected';
  if (status === 'connecting') return labels.routeLegConnecting ?? 'connecting';
  return labels.routeLegDown ?? 'not connected';
}

/** "FRA — connected", or "Tor → FRA: Tor not connected, VPN connected". Always says it in words. */
function describe(badge: GroupRouteBadge, labels: TabStripLabels): string {
  const parts: string[] = [];
  if (badge.vpn !== null)
    parts.push(`${labels.routeLegVpn ?? 'VPN'}: ${legWord(badge.vpn, labels)}`);
  if (badge.tor !== null)
    parts.push(`${labels.routeLegTor ?? 'Tor'}: ${legWord(badge.tor, labels)}`);
  return `${badge.label} — ${parts.join(', ')}`;
}

export function GroupRouteShield({
  badge,
  labels,
}: Readonly<{ badge: GroupRouteBadge; labels: TabStripLabels }>) {
  const title = describe(badge, labels);
  const both = badge.vpn !== null && badge.tor !== null;

  if (!both) {
    const single = badge.tor !== null ? torColor(badge.tor) : vpnColor(badge.vpn ?? 'down');
    return (
      <FontAwesomeIcon
        icon={faShield}
        title={title}
        aria-label={title}
        role="img"
        className={cn('h-3 w-3 shrink-0', single)}
      />
    );
  }

  // Two legs, one shield: the same glyph drawn twice and clipped down the middle, so the split reads as
  // one object with two states rather than two icons crowding a small header.
  return (
    <span
      className="relative inline-block h-3 w-3 shrink-0"
      title={title}
      aria-label={title}
      role="img"
    >
      <FontAwesomeIcon
        icon={faShield}
        aria-hidden
        style={{ clipPath: 'inset(0 50% 0 0)' }}
        className={cn('absolute inset-0 h-3 w-3', vpnColor(badge.vpn ?? 'down'))}
      />
      <FontAwesomeIcon
        icon={faShield}
        aria-hidden
        style={{ clipPath: 'inset(0 0 0 50%)' }}
        className={cn('absolute inset-0 h-3 w-3', torColor(badge.tor ?? 'down'))}
      />
    </span>
  );
}
