import type { vi as Vi } from 'vitest';
import { useRef } from 'react';
import type { screen as Screen } from '@testing-library/react';
import { Omnibox, type OmniboxProps, type OmniboxSecurityLabels } from './omnibox';
import type { OmniboxSuggestion } from './omnibox-suggest';

export const securityLabels: OmniboxSecurityLabels = {
  button: 'View site information',
  secure: 'Connection is secure',
  notSecure: 'Not secure',
  dangerous: 'Dangerous',
  internal: 'Tepegöz page',
  file: 'Local file',
};
export const noSuggestions = (): Promise<OmniboxSuggestion[]> => Promise.resolve([]);
export const oneSuggestion = (s: OmniboxSuggestion) => (): Promise<OmniboxSuggestion[]> =>
  Promise.resolve([s]);
export const theseSuggestions = (list: OmniboxSuggestion[]) => (): Promise<OmniboxSuggestion[]> =>
  Promise.resolve(list);

export const navRow = (i: number): OmniboxSuggestion => ({
  key: `r${i}`,
  kind: 'history',
  title: `Row ${i}`,
  action: { type: 'navigate', input: `https://row-${i}.test/` },
});

/** Wraps Omnibox and counts every render so a runaway effect loop is observable, not just a timeout. */
export function CountingOmnibox({
  renders,
  ...props
}: OmniboxProps & { renders: { current: number } }) {
  const count = useRef(0);
  count.current += 1;
  renders.current = count.current;
  return <Omnibox {...props} />;
}

/**
 * The helpers that need `vitest` / Testing Library at runtime. Those packages are devDependencies, and
 * this file is not a `*.test.*` file, so it takes them as arguments (type-only imports above) rather
 * than importing them — keeps `dependency-cruiser`'s not-to-dev-dep rule satisfied.
 */
export function createOmniboxHelpers(vi: typeof Vi, screen: typeof Screen) {
  function baseProps(over: Partial<OmniboxProps> = {}): OmniboxProps {
    return {
      currentUrl: 'https://example.test/',
      placeholder: 'Search or enter address',
      onNavigate: vi.fn(),
      onCalcResult: vi.fn(),
      onSuggest: vi.fn(noSuggestions),
      ...over,
    };
  }

  /** The omnibox renders a single wrapping `<form>`; grab it for an explicit submit. */
  function omniboxForm(): HTMLFormElement {
    const form = screen.getByRole('combobox').closest('form');
    if (form === null) throw new Error('omnibox form not found');
    return form;
  }

  /** Props with `onCalcResult` genuinely ABSENT — `exactOptionalPropertyTypes` forbids passing it undefined. */
  function withoutCalcHost(over: Partial<OmniboxProps> = {}): OmniboxProps {
    const { onCalcResult, ...rest } = baseProps(over);
    void onCalcResult;
    return rest;
  }

  return { baseProps, omniboxForm, withoutCalcHost };
}
