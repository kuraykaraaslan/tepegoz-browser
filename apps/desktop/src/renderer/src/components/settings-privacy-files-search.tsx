import { useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, Input } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { DEFAULT_SEARCH_ENGINE_ID, SEARCH_ENGINES } from '@tepegoz/shared-types/search-engines';
import { isNavigableWebUrl, isSafeSearchTemplate, normalizeWebUrlInput } from '@tepegoz/shared-types';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { useCommitOnPause } from '../lib/use-commit-on-pause';
import { Select } from './settings-shared';

/**
 * Homepage URL + default/custom search engines.
 *
 * The template check used to be `includes('{q}')` and nothing else, which
 * `javascript:alert(1)?q={q}` passes — so a stored "search engine" could be a script the omnibox
 * would run. The real fix is in `PreferencesSchema` (`isSafeSearchTemplate`); this form uses the same
 * predicate so the refusal is explained where it happens rather than arriving as a failed write.
 *
 * Custom engines are also editable now. They were add-and-remove only, so fixing a typo in a template
 * meant deleting the engine — which, if it was the selected one, silently reset the default search
 * engine as a side effect of correcting a URL.
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const engines = [...SEARCH_ENGINES, ...prefs.customSearchEngines];

  const homepage = useCommitOnPause(prefs.homepageUrl, (value) => {
    const normalized = normalizeWebUrlInput(value);
    if (normalized === '' || isNavigableWebUrl(normalized)) setPref({ homepageUrl: normalized });
  });
  const homepageInvalid =
    homepage.draft.trim() !== '' && !isNavigableWebUrl(normalizeWebUrlInput(homepage.draft));

  const urlInvalid = url.length > 0 && !isSafeSearchTemplate(normalizeWebUrlInput(url));
  // A duplicate name is refused rather than added: two engines called "Wiki" in one dropdown are
  // indistinguishable, and the picker stores an id the user never sees.
  const duplicateName =
    name.trim().length > 0 &&
    engines.some((e) => e.name.toLowerCase() === name.trim().toLowerCase());
  const canAdd = name.trim().length > 0 && url.trim().length > 0 && !urlInvalid && !duplicateName;

  function addEngine(): void {
    if (!canAdd) return;
    setPref({
      customSearchEngines: [
        ...prefs.customSearchEngines,
        {
          id: `custom-${crypto.randomUUID()}`,
          name: name.trim(),
          searchUrlTemplate: normalizeWebUrlInput(url.trim()),
        },
      ],
    });
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

  const editUrlInvalid = editUrl.length > 0 && !isSafeSearchTemplate(normalizeWebUrlInput(editUrl));
  const canSaveEdit = editName.trim().length > 0 && editUrl.trim().length > 0 && !editUrlInvalid;

  function commitEdit(): void {
    if (editingId === null || !canSaveEdit) return;
    setPref({
      customSearchEngines: prefs.customSearchEngines.map((e) =>
        e.id === editingId
          ? {
              ...e,
              name: editName.trim(),
              searchUrlTemplate: normalizeWebUrlInput(editUrl.trim()),
            }
          : e,
      ),
    });
    setEditingId(null);
  }

  return (
    <div className="space-y-6">
      <Card>
        <Input
          id="homepage-url"
          type="url"
          label={s.homepageLabel}
          hint={s.homepageDesc}
          placeholder={s.homepagePlaceholder}
          value={homepage.draft}
          {...(homepageInvalid ? { error: s.startup.urlInvalid } : {})}
          onChange={(e) => {
            homepage.set(e.target.value);
          }}
          onBlur={homepage.flush}
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
            {prefs.customSearchEngines.map((e) =>
              editingId === e.id ? (
                <li key={e.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Input
                      id={`edit-engine-name-${e.id}`}
                      label={s.searchEngineCustomName}
                      value={editName}
                      onChange={(ev) => {
                        setEditName(ev.target.value);
                      }}
                    />
                    <Input
                      id={`edit-engine-url-${e.id}`}
                      label={s.searchEngineCustomUrl}
                      value={editUrl}
                      {...(editUrlInvalid ? { error: s.searchEngineCustomInvalid } : {})}
                      onChange={(ev) => {
                        setEditUrl(ev.target.value);
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-[38px]"
                        disabled={!canSaveEdit}
                        onClick={commitEdit}
                      >
                        {s.searchEngineSave}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-[38px]"
                        onClick={() => {
                          setEditingId(null);
                        }}
                      >
                        {s.cancel}
                      </Button>
                    </div>
                  </div>
                </li>
              ) : (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-primary">{e.name}</div>
                    <div className="truncate text-xs text-text-secondary">
                      {e.searchUrlTemplate}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(e.id);
                        setEditName(e.name);
                        setEditUrl(e.searchUrlTemplate);
                      }}
                    >
                      {s.searchEngineEdit}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        removeEngine(e.id);
                      }}
                    >
                      {s.searchEngineRemove}
                    </Button>
                  </div>
                </li>
              ),
            )}
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
              {...(duplicateName ? { error: s.searchEngineDuplicate } : {})}
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
            <Button
              size="sm"
              variant="outline"
              className="h-[38px]"
              disabled={!canAdd}
              onClick={addEngine}
            >
              {s.searchEngineCustomAdd}
            </Button>
          </div>
          <p className="text-xs text-text-secondary">{s.searchEngineCustomUrlHint}</p>
        </div>
      </Card>
    </div>
  );
}
