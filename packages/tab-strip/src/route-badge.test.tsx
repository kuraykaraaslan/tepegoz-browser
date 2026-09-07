// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GroupRouteShield } from './route-badge';
import type { GroupRouteBadge, TabStripLabels } from './tab-strip-types';

const LABELS: TabStripLabels = {
  tablist: 'Tabs',
  untitled: 'Untitled',
  closeTab: 'Close',
  newTab: 'New',
  routeLegVpn: 'VPN',
  routeLegTor: 'Tor',
  routeLegUp: 'connected',
  routeLegConnecting: 'connecting',
  routeLegDown: 'not connected',
};

const badge = (over: Partial<GroupRouteBadge>): GroupRouteBadge => ({
  vpn: null,
  tor: null,
  label: 'FRA',
  ...over,
});

/**
 * Two branches stay uncovered: the `?? 'down'` defaults on each half of the SPLIT shield. That branch
 * only runs when both legs are non-null, which is what selects it — the defaults there can never fire.
 */

/** The shields are `role="img"`, so the accessible name is what a user actually gets told. */
function shieldName(): string {
  return screen.getByRole('img').getAttribute('aria-label') ?? '';
}

afterEach(cleanup);

describe('a single-leg route', () => {
  it('says the VPN health IN WORDS, not only in colour', () => {
    // The red/green distinction here is "protected" vs "not protected" — the last thing to encode in
    // hue alone, and unreadable to a large share of people.
    render(<GroupRouteShield badge={badge({ vpn: 'up' })} labels={LABELS} />);
    expect(shieldName()).toBe('FRA — VPN: connected');
  });

  it('distinguishes connecting from down', () => {
    render(<GroupRouteShield badge={badge({ vpn: 'connecting' })} labels={LABELS} />);
    expect(shieldName()).toBe('FRA — VPN: connecting');
    cleanup();
    render(<GroupRouteShield badge={badge({ vpn: 'down' })} labels={LABELS} />);
    expect(shieldName()).toBe('FRA — VPN: not connected');
  });

  it('colours a plain Tor route purple when it is carrying traffic, grey when it is not', () => {
    const { container } = render(
      <GroupRouteShield badge={badge({ tor: 'up', label: 'Tor' })} labels={LABELS} />,
    );
    expect(container.querySelector('.text-purple-400')).not.toBeNull();
    cleanup();
    const grey = render(
      <GroupRouteShield badge={badge({ tor: 'down', label: 'Tor' })} labels={LABELS} />,
    );
    expect(grey.container.querySelector('.text-text-disabled')).not.toBeNull();
  });

  it('draws ONE shield when there is only one leg', () => {
    const { container } = render(<GroupRouteShield badge={badge({ vpn: 'up' })} labels={LABELS} />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('a chained route — Tor through a VPN', () => {
  const chained = badge({ vpn: 'up', tor: 'up', label: 'Tor → FRA' });

  it('splits ONE shield into two halves rather than drawing two icons', () => {
    const { container } = render(<GroupRouteShield badge={chained} labels={LABELS} />);
    const halves = [...container.querySelectorAll('svg')];
    expect(halves).toHaveLength(2);
    // Clipped down the middle so the pair reads as one object with two states, which is what it is:
    // one route with two legs, not two routes.
    const clips = halves.map((h) => (h as unknown as HTMLElement).style.clipPath);
    expect(clips).toEqual(['inset(0 50% 0 0)', 'inset(0 0 0 50%)']);
  });

  it('names BOTH legs, because either one dying cuts the group', () => {
    render(<GroupRouteShield badge={chained} labels={LABELS} />);
    expect(shieldName()).toBe('Tor → FRA — VPN: connected, Tor: connected');
  });

  it('shows the VPN half healthy while the Tor half is still coming up', () => {
    const { container } = render(
      <GroupRouteShield
        badge={badge({ vpn: 'up', tor: 'down', label: 'Tor → FRA' })}
        labels={LABELS}
      />,
    );
    expect(container.querySelector('.text-success')).not.toBeNull();
    expect(container.querySelector('.text-text-disabled')).not.toBeNull();
    expect(shieldName()).toBe('Tor → FRA — VPN: connected, Tor: not connected');
  });

  it('shows a dead VPN half under a Tor half that cannot possibly be up', () => {
    render(
      <GroupRouteShield
        badge={badge({ vpn: 'down', tor: 'down', label: 'Tor → FRA' })}
        labels={LABELS}
      />,
    );
    expect(shieldName()).toBe('Tor → FRA — VPN: not connected, Tor: not connected');
  });
});

describe('a host that ships no route strings', () => {
  /** The four labels every strip must have; the route ones are all optional. */
  const BARE: TabStripLabels = {
    tablist: 'Tabs',
    untitled: 'Untitled',
    closeTab: 'Close',
    newTab: 'New',
  };

  it('still says both legs and their health, in built-in English', () => {
    // The route labels are optional on the leaf, so a host can render this badge before it has
    // translated anything. An unlabelled shield would be a coloured dot to a screen reader — and
    // colour is the one channel this badge must not rely on.
    render(<GroupRouteShield badge={badge({ vpn: 'up', tor: 'down' })} labels={BARE} />);
    expect(shieldName()).toBe('FRA — VPN: connected, Tor: not connected');
  });

  it('falls back for the connecting state too', () => {
    render(<GroupRouteShield badge={badge({ vpn: 'connecting' })} labels={BARE} />);
    expect(shieldName()).toBe('FRA — VPN: connecting');
  });
});

describe('a badge with no legs at all', () => {
  it('still names the route rather than rendering an unexplained shield', () => {
    // Both legs null is a Direct group's shape. The header does not draw a shield for one, but the
    // component is exported on its own and must not produce a nameless icon if it is handed one.
    render(
      <GroupRouteShield badge={badge({ vpn: null, tor: null, label: 'Direct' })} labels={LABELS} />,
    );
    expect(shieldName()).toBe('Direct — ');
    expect(screen.getByRole('img')).toBeDefined();
  });
});
