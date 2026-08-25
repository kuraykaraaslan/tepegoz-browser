import { useT } from '@tepegoz/i18n/react';
import { readingMinutes, type ReaderArticle, type ReaderBlock } from './article';
import { readerDict } from './i18n';

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
 * Presentational — the host fetches the article and owns the toggle, so this package stays free of IPC
 * and of Electron.
 */

function Block({ block }: { block: ReaderBlock }) {
  if (block.kind === 'heading') {
    return block.level === 2 ? (
      <h2 className="mt-8 mb-3 text-2xl font-semibold text-text-primary">{block.text}</h2>
    ) : (
      <h3 className="mt-6 mb-2 text-xl font-semibold text-text-primary">{block.text}</h3>
    );
  }
  if (block.kind === 'paragraph') {
    return <p className="mb-4 text-[1.05rem] leading-8 text-text-primary">{block.text}</p>;
  }
  if (block.kind === 'quote') {
    return (
      <blockquote className="mb-4 border-l-2 border-border pl-4 text-[1.05rem] leading-8 text-text-secondary italic">
        {block.text}
      </blockquote>
    );
  }
  if (block.kind === 'code') {
    return (
      <pre className="mb-4 overflow-x-auto rounded-md bg-surface-overlay p-3 text-sm text-text-primary">
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
      <ol className="mb-4 list-decimal pl-6 text-[1.05rem] leading-8 text-text-primary">{items}</ol>
    ) : (
      <ul className="mb-4 list-disc pl-6 text-[1.05rem] leading-8 text-text-primary">{items}</ul>
    );
  }
  return (
    <figure className="mb-4">
      <img src={block.src} alt={block.alt} className="max-w-full rounded-md" />
      {block.alt.length > 0 && (
        <figcaption className="mt-1 text-xs text-text-secondary">{block.alt}</figcaption>
      )}
    </figure>
  );
}

export function ReaderView({ article }: { article: ReaderArticle }) {
  const t = useT(readerDict);
  const minutes = readingMinutes(article.wordCount);
  return (
    <article className="mx-auto max-w-[42rem] px-6 py-10">
      <h1 className="mb-2 text-3xl leading-tight font-bold text-text-primary">{article.title}</h1>
      <p className="mb-8 text-xs text-text-secondary">
        {/* Byline and site are shown when the page stated them and omitted when it did not — a reading
            view that invented an author would be worse than one that shows none. */}
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
  );
}
