// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { coreDict } from '@tepegoz/i18n';
import { normalizeHostInput } from '@tepegoz/shared-types';
import type { TrustProfile } from '@tepegoz/shared-types';
import { SiteTrustSection } from './settings-site-trust';

/**
 * Scoped Trust Profiles. The rules this covers: a failed load must NOT fall to a clean empty list
 * (which reads as "nothing trusted" — the most reassuring way to fail at showing standing grants); an
 * un-parseable domain is refused locally; a typed IDN is previewed as the punycode that gets stored;
 * the level is editable in place; and the button says "Update" for a domain already listed.
 */

const s = settingsDict.en;
const t = s.siteTrust;

function profile(over: Partial<TrustProfile> = {}): TrustProfile {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    domain: 'example.com',
    level: 'trusted',
    deviceId: 'dev',
    updatedAt: 0,
    version: 1,
    tombstone: false,
    ...over,
  };
}

const listTrustProfiles = vi.fn();
const setTrustProfile = vi.fn();
const removeTrustProfile = vi.fn();
const exportTrustProfiles = vi.fn();
const importTrustProfiles = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  listTrustProfiles.mockResolvedValue([]);
  setTrustProfile.mockResolvedValue([]);
  removeTrustProfile.mockResolvedValue([]);
  exportTrustProfiles.mockResolvedValue('{"format":"tepegoz.trust-profiles","version":1,"profiles":[]}');
  importTrustProfiles.mockResolvedValue({ imported: 0, skipped: 0 });
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      listTrustProfiles,
      setTrustProfile,
      removeTrustProfile,
      exportTrustProfiles,
      importTrustProfiles,
    },
  });
});
afterEach(cleanup);

function renderSection() {
  render(
    <I18nProvider locale="en">
      <SiteTrustSection />
    </I18nProvider>,
  );
}

const domainInput = () => screen.getByLabelText(t.addLabel);

describe('SiteTrustSection', () => {
  it('surfaces a load failure instead of showing a clean empty list', async () => {
    listTrustProfiles.mockRejectedValue(new Error('trust store offline'));
    renderSection();
    await waitFor(() => expect(screen.getByText('trust store offline')).toBeTruthy());
  });

  it('falls back to the generic upstream message when the failure has none', async () => {
    listTrustProfiles.mockRejectedValue(new Error(''));
    renderSection();
    await waitFor(() => expect(screen.getByText(coreDict.en.errors.upstreamDown)).toBeTruthy());
  });

  it('refuses an un-parseable domain without calling the bridge', () => {
    renderSection();
    fireEvent.change(domainInput(), { target: { value: 'not a domain !!' } });
    fireEvent.click(screen.getByRole('button', { name: t.add }));
    expect(screen.getByText(t.invalidDomain)).toBeTruthy();
    expect(setTrustProfile).not.toHaveBeenCalled();
  });

  it('stores a valid domain at the chosen level and clears the field', async () => {
    setTrustProfile.mockResolvedValue([profile({ domain: 'example.com' })]);
    renderSection();
    fireEvent.change(domainInput(), { target: { value: 'Example.com' } });
    fireEvent.click(screen.getByRole('button', { name: t.add }));
    await waitFor(() => expect(setTrustProfile).toHaveBeenCalledWith('example.com', 'trusted'));
    await waitFor(() => expect((domainInput() as HTMLInputElement).value).toBe(''));
  });

  it('previews the punycode a typed IDN will be stored as', () => {
    renderSection();
    const idn = 'köşe.com.tr';
    const stored = normalizeHostInput(idn);
    fireEvent.change(domainInput(), { target: { value: idn } });
    expect(screen.getByText(t.storedAs.replace('{domain}', stored ?? ''))).toBeTruthy();
  });

  it('labels the button "Update" for a domain already in the list', async () => {
    listTrustProfiles.mockResolvedValue([profile({ domain: 'example.com' })]);
    renderSection();
    await screen.findByText('example.com');
    fireEvent.change(domainInput(), { target: { value: 'example.com' } });
    expect(screen.getByRole('button', { name: t.update })).toBeTruthy();
  });

  it('stores a new domain at the level picked in the add form', async () => {
    setTrustProfile.mockResolvedValue([profile({ domain: 'foo.com', level: 'restricted' })]);
    renderSection();
    fireEvent.change(screen.getByLabelText(t.levelLabel), { target: { value: 'restricted' } });
    fireEvent.change(domainInput(), { target: { value: 'foo.com' } });
    fireEvent.click(screen.getByRole('button', { name: t.add }));
    await waitFor(() => expect(setTrustProfile).toHaveBeenCalledWith('foo.com', 'restricted'));
  });

  it("changes an existing profile's level in place", async () => {
    listTrustProfiles.mockResolvedValue([profile({ domain: 'example.com', level: 'trusted' })]);
    renderSection();
    const row = (await screen.findByText('example.com')).closest('li') as HTMLElement;
    fireEvent.change(within(row).getByLabelText(`example.com — ${t.levelLabel}`), {
      target: { value: 'restricted' },
    });
    expect(setTrustProfile).toHaveBeenCalledWith('example.com', 'restricted');
  });

  it('removes a profile through the confirm dialog', async () => {
    listTrustProfiles.mockResolvedValue([profile({ domain: 'example.com' })]);
    renderSection();
    const row = (await screen.findByText('example.com')).closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: t.remove }));
    const confirm = screen.getAllByRole('button', { name: t.remove });
    fireEvent.click(confirm[confirm.length - 1]!);
    expect(removeTrustProfile).toHaveBeenCalledWith('example.com');
  });

  it('downloads the JSON the bridge returns via a blob link named tepegoz-trust-profiles.json', async () => {
    exportTrustProfiles.mockResolvedValue(
      '{"format":"tepegoz.trust-profiles","version":1,"profiles":[{"domain":"a.example","level":"trusted"}]}',
    );
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const realCreate = document.createElement.bind(document);
    let anchor: HTMLAnchorElement | undefined;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = click;
        anchor = el as HTMLAnchorElement;
      }
      return el;
    });

    renderSection();
    fireEvent.click(screen.getByRole('button', { name: t.exportButton }));

    await waitFor(() => expect(exportTrustProfiles).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(anchor?.download).toBe('tepegoz-trust-profiles.json');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the picked file text to the bridge, reports imported + skipped, and refreshes the list', async () => {
    importTrustProfiles.mockResolvedValue({ imported: 2, skipped: 1 });
    renderSection();
    await screen.findByText(t.empty);

    listTrustProfiles.mockResolvedValue([profile({ domain: 'new.example' })]);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { text: () => Promise.resolve('{"profiles":[]}') } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(importTrustProfiles).toHaveBeenCalledWith('{"profiles":[]}'));
    await screen.findByText(/Imported 2/);
    expect(screen.getByText(/1 skipped/)).toBeTruthy();
    // Import triggers a refresh — the list is not left showing the pre-import snapshot.
    await screen.findByText('new.example');
  });

  it('shows the failure string when the import bridge rejects a bad file', async () => {
    importTrustProfiles.mockRejectedValue(new Error('bad request'));
    renderSection();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { text: () => Promise.resolve('not json') } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText(t.importFailed);
  });
});
