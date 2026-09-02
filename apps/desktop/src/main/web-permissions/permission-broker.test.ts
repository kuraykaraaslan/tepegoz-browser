import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The broker's request-recording — what the Site Info bubble reads to decide which permission rows are
 * worth showing (ADR-0044 amendment 2026-09-02). The decision paths themselves (stored grant, global
 * notification switch, the prompt round-trip) are covered here only where they could SKIP the record:
 * a capability answered without a prompt is exactly the one a user may want to revisit.
 */

interface Bag {
  sitePermissions: Record<string, Record<string, string>>;
  notificationsEnabled: boolean;
}
const h = vi.hoisted<Bag>(() => ({ sitePermissions: {}, notificationsEnabled: true }));

vi.mock('@tepegoz/preferences', () => ({
  default: {
    getAll: () => ({
      sitePermissions: h.sitePermissions,
      notificationsEnabled: h.notificationsEnabled,
    }),
    update: vi.fn(),
  },
}));
// No focused window: the prompt path resolves `false` at once instead of arming a 60s timer.
vi.mock('../tabs', () => ({ default: { focusedWindow: () => null } }));

const { default: WebPermissionBroker, requestedCapabilities } = await import('./permission-broker');

beforeEach(() => {
  h.sitePermissions = {};
  h.notificationsEnabled = true;
});

describe('requestedCapabilities', () => {
  it('is empty for an origin that has never asked', () => {
    expect(requestedCapabilities('https://quiet.example')).toEqual([]);
  });

  it('records a capability answered from a stored grant, without prompting', async () => {
    h.sitePermissions['https://stored.example'] = { camera: 'allowed' };
    await expect(WebPermissionBroker.request('camera', 'https://stored.example')).resolves.toBe(
      true,
    );
    expect(requestedCapabilities('https://stored.example')).toEqual(['camera']);
  });

  it('records a request refused by the global notifications switch', async () => {
    h.notificationsEnabled = false;
    await expect(WebPermissionBroker.request('notifications', 'https://off.example')).resolves.toBe(
      false,
    );
    expect(requestedCapabilities('https://off.example')).toEqual(['notifications']);
  });

  it('records every capability of a multi-capability request up to the first refusal', async () => {
    h.sitePermissions['https://call.example'] = { camera: 'denied' };
    await expect(
      WebPermissionBroker.requestAll(['camera', 'microphone'], 'https://call.example'),
    ).resolves.toBe(false);
    // The camera was refused, so the microphone was never asked for — and gets no row.
    expect(requestedCapabilities('https://call.example')).toEqual(['camera']);
  });

  it('keeps origins apart', async () => {
    h.sitePermissions['https://a.example'] = { geolocation: 'allowed' };
    await WebPermissionBroker.request('geolocation', 'https://a.example');
    expect(requestedCapabilities('https://a.example')).toEqual(['geolocation']);
    expect(requestedCapabilities('https://b.example')).toEqual([]);
  });
});
