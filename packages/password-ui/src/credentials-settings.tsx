import { useState, useEffect, useRef } from 'react';
import { useT } from '@tepegoz/i18n/react';
import type { LoginCredentialMeta } from '@tepegoz/desktop-ipc';
import { passwordUiDict } from './i18n';

export interface CredentialsSettingsProps {
  credentials: LoginCredentialMeta[];
  onAdd: (credential: { url: string; username: string; password: string; title?: string; notes?: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

interface FormState {
  url: string;
  username: string;
  password: string;
  title: string;
  notes: string;
}

const EMPTY_FORM: FormState = { url: '', username: '', password: '', title: '', notes: '' };

// Design-token utility classes (mirrors the @tepegoz/ui atoms without a runtime dependency).
const INPUT =
  'h-9 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary ' +
  'placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BTN_PRIMARY =
  'shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover ' +
  'disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BTN_OUTLINE =
  'shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-overlay ' +
  'disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export function CredentialsSettings({ credentials, onAdd, onRemove }: CredentialsSettingsProps) {
  const t = useT(passwordUiDict);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm) urlRef.current?.focus();
  }, [showForm]);

  const filtered = credentials.filter(
    (c) =>
      c.url.includes(query) ||
      c.username.toLowerCase().includes(query.toLowerCase()) ||
      c.title.toLowerCase().includes(query.toLowerCase()),
  );
  const canSave = form.url !== '' && form.username !== '' && form.password !== '';

  async function handleSave(): Promise<void> {
    if (!canSave) return;
    setSaving(true);
    try {
      await onAdd({ url: form.url, username: form.username, password: form.password, title: form.title, notes: form.notes });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {credentials.length > 0 && (
          <input
            className={INPUT}
            placeholder={t.search}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
        )}
        <button
          type="button"
          className={`${BTN_PRIMARY} ${credentials.length === 0 ? 'ml-auto' : ''}`}
          onClick={() => {
            setShowForm((v) => !v);
          }}
        >
          {t.addNew}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-base p-3">
          <input
            ref={urlRef}
            className={INPUT}
            placeholder={t.siteUrl}
            value={form.url}
            onChange={(e) => {
              setForm((f) => ({ ...f, url: e.target.value }));
            }}
          />
          <input
            className={INPUT}
            placeholder={t.username}
            value={form.username}
            onChange={(e) => {
              setForm((f) => ({ ...f, username: e.target.value }));
            }}
          />
          <input
            className={INPUT}
            type="password"
            placeholder={t.password}
            value={form.password}
            onChange={(e) => {
              setForm((f) => ({ ...f, password: e.target.value }));
            }}
          />
          <input
            className={INPUT}
            placeholder={t.siteName}
            value={form.title}
            onChange={(e) => {
              setForm((f) => ({ ...f, title: e.target.value }));
            }}
          />
          <textarea
            className={`${INPUT} h-20 resize-none py-2`}
            placeholder={t.notes}
            value={form.notes}
            onChange={(e) => {
              setForm((f) => ({ ...f, notes: e.target.value }));
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={saving || !canSave}
              onClick={() => void handleSave()}
            >
              {t.save}
            </button>
            <button
              type="button"
              className={BTN_OUTLINE}
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary">{t.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {c.title || c.url}
                </span>
                <span className="block truncate text-xs text-text-secondary">
                  {c.username} · {c.url}
                </span>
              </div>
              <button
                type="button"
                className={BTN_OUTLINE}
                aria-label={t.delete}
                onClick={() => void onRemove(c.id)}
              >
                {t.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
