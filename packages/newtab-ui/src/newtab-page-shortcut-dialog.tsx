import { useEffect, useRef, useState, type FormEvent } from 'react';
import { normalizeUrl } from './newtab-page-helpers';

/** The add/edit-shortcut modal — a Name + URL form (Chrome-style). Done is disabled until the URL is
 *  non-empty; the host normalizes + validates the final URL. */
export function ShortcutDialog({
  title,
  initialName,
  initialUrl,
  labels,
  onCancel,
  onSave,
}: Readonly<{
  title: string;
  initialName: string;
  initialUrl: string;
  labels: { name: string; url: string; urlPlaceholder: string; save: string; cancel: string };
  onCancel: () => void;
  onSave: (name: string, url: string) => void;
}>) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function submit(e: FormEvent): void {
    e.preventDefault();
    const finalUrl = normalizeUrl(url);
    if (finalUrl.length === 0) return;
    onSave(name.trim(), finalUrl);
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-base p-6 shadow-xl"
      >
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>

        <label className="mt-5 block">
          <span className="text-xs font-medium text-text-secondary">{labels.name}</span>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-text-secondary">{labels.url}</span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={labels.urlPlaceholder}
            inputMode="url"
            className={`mt-1.5 ${inputClass}`}
          />
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {labels.cancel}
          </button>
          <button
            type="submit"
            disabled={normalizeUrl(url).length === 0}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            {labels.save}
          </button>
        </div>
      </form>
    </div>
  );
}
