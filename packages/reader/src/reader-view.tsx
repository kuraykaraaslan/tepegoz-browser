import { useT } from '@tepegoz/i18n/react';
import { readingMinutes, type ReaderArticle, type ReaderBlock } from './article';
import {
  decreaseFontScale,
  fontScaleClass,
  increaseFontScale,
  isFontScaleAtMax,
  isFontScaleAtMin,
  isReadingTheme,
  readingThemeClass,
  type ReaderPreferences,
} from './reader-preferences';
import { readerDict } from './i18n';
import './reader-view.css';

/**
 * The reading view. Renders {@link ReaderArticle} blocks and nothing else.
 *
 * **There is no `dangerouslySetInnerHTML` in this file, and there is nothing for one to render.** The
 * article model carries plain-text fields, so an attacker-controlled page cannot express markup that
 * reaches this component in the first place — the protection is the shape of the data, not a filter
 * someone has to keep correct. That matters more here than almost anywhere else in the browser: this
 * is untrusted content drawn inside the TRUSTED app chrome.
 *
 * Images are the one exception and are constrained at extraction: only `http(s)` and `data:image`
 * sources survive, so a `javascript:` src has already been dropped before it could be an attribute.
 *
 * The reading-options toolbar (font size, reading theme) applies its choice as a CLASS on the reading
 * container — `reader-view.css` maps the class to CSS custom properties. No `style` attribute is set
 * anywhere near the extracted content.
 *
 * Presentational — the host fetches the article, owns the toggle and persists the preferences, so this
 * package stays free of IPC and of Electron.
 */

function Block({ block }: { block: ReaderBlock }) {
  if (block.kind === 'heading') {
    return block.level === 2 ? (
      <h2 className="mt-8 mb-3 font-semibold">{block.text}</h2>
    ) : (
      <h3 className="mt-6 mb-2 font-semibold">{block.text}</h3>
    );
  }
  if (block.kind === 'paragraph') {
    return <p className="mb-4">{block.text}</p>;
  }
  if (block.kind === 'quote') {
    return <blockquote className="mb-4 border-l-2 pl-4 italic">{block.text}</blockquote>;
  }
  if (block.kind === 'code') {
    return (
      <pre className="mb-4 overflow-x-auto rounded-md p-3">
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.kind === 'list') {
    const items = block.items.map((item, i) => (
      // The index is part of the key because list items are plain strings and a page may legitimately
      // repeat one; the text prefix keeps the key stable when the list is re-rendered unchanged.
      <li key={`${String(i)}:${item.slice(0, 32)}`} className="mb-1">
        {item}
      </li>
    ));
    return block.ordered ? (
      <ol className="mb-4 list-decimal pl-6">{items}</ol>
    ) : (
      <ul className="mb-4 list-disc pl-6">{items}</ul>
    );
  }
  return (
    <figure className="mb-4">
      <img src={block.src} alt={block.alt} className="max-w-full rounded-md" />
      {block.alt.length > 0 && <figcaption className="mt-1">{block.alt}</figcaption>}
    </figure>
  );
}

/**
 * Font size and reading theme. The font-size controls are real `<button>`s with aria-labels and go
 * disabled at the ends of the range; the theme picker is a labelled `<select>`.
 */
function ReaderToolbar({
  preferences,
  onChange,
}: {
  preferences: ReaderPreferences;
  onChange: (next: ReaderPreferences) => void;
}) {
  const t = useT(readerDict);
  return (
    <div className="reader-toolbar" role="group" aria-label={t.optionsLabel}>
      <div className="reader-toolbar__group">
        <button
          type="button"
          aria-label={t.fontDecrease}
          disabled={isFontScaleAtMin(preferences.fontScale)}
          onClick={() => {
            onChange({ ...preferences, fontScale: decreaseFontScale(preferences.fontScale) });
          }}
        >
          {t.fontDecreaseGlyph}
        </button>
        <button
          type="button"
          aria-label={t.fontIncrease}
          disabled={isFontScaleAtMax(preferences.fontScale)}
          onClick={() => {
            onChange({ ...preferences, fontScale: increaseFontScale(preferences.fontScale) });
          }}
        >
          {t.fontIncreaseGlyph}
        </button>
      </div>
      <select
        className="reader-toolbar__group"
        aria-label={t.themeLabel}
        value={preferences.theme}
        onChange={(event) => {
          const next = event.target.value;
          if (isReadingTheme(next)) onChange({ ...preferences, theme: next });
        }}
      >
        <option value="light">{t.themeLight}</option>
        <option value="sepia">{t.themeSepia}</option>
        <option value="dark">{t.themeDark}</option>
      </select>
    </div>
  );
}

export function ReaderView({
  article,
  preferences,
  onPreferencesChange,
}: {
  article: ReaderArticle;
  preferences: ReaderPreferences;
  onPreferencesChange: (next: ReaderPreferences) => void;
}) {
  const t = useT(readerDict);
  const minutes = readingMinutes(article.wordCount);
  const surfaceClass = [
    'reader-surface',
    readingThemeClass(preferences.theme),
    fontScaleClass(preferences.fontScale),
  ].join(' ');
  return (
    <div className={surfaceClass}>
      <div className="mx-auto flex max-w-[42rem] justify-end px-6 pt-6">
        <ReaderToolbar preferences={preferences} onChange={onPreferencesChange} />
      </div>
      <article className="reader-article mx-auto max-w-[42rem] px-6 pt-4 pb-10">
        <h1 className="mb-2 leading-tight font-bold">{article.title}</h1>
        <p className="reader-byline mb-8">
          {/* Byline and site are shown when the page stated them and omitted when it did not — a
              reading view that invented an author would be worse than one that shows none. */}
          {[article.byline, article.siteName, t.readingTime.replace('{minutes}', String(minutes))]
            .filter((part) => part.length > 0)
            .join(' · ')}
        </p>
        {/* Blocks have no identity of their own — two paragraphs can be byte-identical — so the index
            is the key, paired with the kind so a re-extraction that changes shape remounts cleanly. */}
        {article.blocks.map((block, i) => (
          <Block key={`${String(i)}:${block.kind}`} block={block} />
        ))}
      </article>
    </div>
  );
}
