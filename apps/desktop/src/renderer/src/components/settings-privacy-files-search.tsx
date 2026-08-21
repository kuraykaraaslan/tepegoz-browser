import { useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, Input } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { DEFAULT_SEARCH_ENGINE_ID, SEARCH_ENGINES } from '@tepegoz/shared-types/search-engines';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { Select } from './settings-shared';

/**
 * Homepage URL + default/custom search engines. The homepage drives new tabs, the Home button, and a
 * blank omnibox submit; the search engine (built-in or user-added) resolves typed omnibox queries.
 * Custom engines are persisted in `prefs.customSearchEngines` and merged with the built-in list.
 */
export function SearchStartupSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const engines = [...SEARCH_ENGINES, ...prefs.customSearchEngines];
  const urlInvalid = url.length > 0 && !url.includes('{q}');
  const canAdd = name.trim().length > 0 && url.trim().length > 0 && !urlInvalid;

  function addEngine(): void {
    if (!canAdd) return;
    const engine = {
      id: `custom-${crypto.randomUUID()}`,
      name: name.trim(),
      searchUrlTemplate: url.trim(),
    };
    setPref({ customSearchEngines: [...prefs.customSearchEngines, engine] });
    setName('');
    setUrl('');
  }

  function removeEngine(id: string): void {
    setPref({
      customSearchEngines: prefs.customSearchEngines.filter((e) => e.id !== id),
      // If the removed engine was the selected default, fall back to the built-in default.
      ...(prefs.searchEngineId === id ? { searchEngineId: DEFAULT_SEARCH_ENGINE_ID } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <Input
          id="homepage-url"
          label={s.homepageLabel}
          hint={s.homepageDesc}
          placeholder={s.homepagePlaceholder}
          value={prefs.homepageUrl}
          onChange={(e) => {
            setPref({ homepageUrl: e.target.value });
          }}
        />
      </Card>

      <Card title={s.searchEngineLabel} subtitle={s.searchEngineDesc}>
        <Select
          id="search-engine"
          value={prefs.searchEngineId}
          onChange={(v) => {
            setPref({ searchEngineId: v });
          }}
        >
          {engines.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>

        {prefs.customSearchEngines.length > 0 && (
          <ul className="mt-4 space-y-2">
            {prefs.customSearchEngines.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">{e.name}</div>
                  <div className="truncate text-xs text-text-secondary">{e.searchUrlTemplate}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    removeEngine(e.id);
                  }}
                >
                  {s.searchEngineRemove}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-2">
          <span className="block text-sm font-medium text-text-primary">
            {s.searchEngineCustom}
          </span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              id="custom-engine-name"
              label={s.searchEngineCustomName}
              placeholder={s.searchEngineCustomName}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            <Input
              id="custom-engine-url"
              label={s.searchEngineCustomUrl}
              placeholder={s.searchEngineCustomUrlPlaceholder}
              value={url}
              {...(urlInvalid ? { error: s.searchEngineCustomInvalid } : {})}
              onChange={(e) => {
                setUrl(e.target.value);
              }}
            />
            <Button size="sm" variant="outline" disabled={!canAdd} onClick={addEngine}>
              {s.searchEngineCustomAdd}
            </Button>
          </div>
          <p className="text-xs text-text-secondary">{s.searchEngineCustomUrlHint}</p>
        </div>
      </Card>
    </div>
  );
}
