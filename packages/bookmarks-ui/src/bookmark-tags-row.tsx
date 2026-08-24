import { useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { bookmarksUiDict } from './i18n';

/**
 * The tag line on a bookmark row in the manager.
 *
 * Read-only until clicked, because tags are a minority of rows and a permanently-open text field on
 * every bookmark would turn the list into a form. Clicking "add tags" (or an existing tag) opens one
 * input holding the whole comma-separated set — editing the set as text is what makes REMOVING a tag
 * possible with the same gesture as adding one, and removal is what people reach for the instant they
 * mistype.
 *
 * Enter commits, Escape abandons. Blur also commits: a click elsewhere after typing means "yes", and
 * discarding work on blur is the behaviour every note-taking app has been criticised for.
 *
 * The tags shown after a save are the ones the STORE returned, not the ones typed — normalization
 * (case-folding, deduplication, capping) happens there, and echoing the raw input would show the user
 * a state that does not exist.
 */
export function TagsRow({
  tags,
  onSave,
}: {
  tags: readonly string[];
  onSave: (tags: string[]) => Promise<string[]>;
}) {
  const t = useT(bookmarksUiDict);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const open = (): void => {
    setDraft(tags.join(', '));
    setEditing(true);
  };

  const commit = (): void => {
    if (saving) return;
    setSaving(true);
    void onSave(draft.split(',')).then(
      () => {
        setEditing(false);
        setSaving(false);
      },
      () => {
        setEditing(false);
        setSaving(false);
      },
    );
  };

  if (editing) {
    return (
      <input
        // The field only exists because the user just clicked to open it; not focusing it would mean
        // a second click to do what they already asked for.
        autoFocus
        type="text"
        value={draft}
        aria-label={t.tagsLabel}
        placeholder={t.tagsPlaceholder}
        disabled={saving}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="mt-1 w-full rounded border border-border bg-surface-base px-1.5 py-0.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={t.tagsLabel}
      onClick={(e) => {
        e.stopPropagation();
        open();
      }}
      className="mt-1 flex flex-wrap items-center gap-1 text-left"
    >
      {tags.length === 0 ? (
        <span className="text-xs text-text-disabled">{t.tagsAdd}</span>
      ) : (
        tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] text-text-secondary"
          >
            {tag}
          </span>
        ))
      )}
    </button>
  );
}
