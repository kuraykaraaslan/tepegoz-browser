import { useRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { remarkFileLinks, FILE_LINK_SCHEME } from './remark-file-links';
import { fileUrlTransform } from './url-transform';

/**
 * Markdown renderer for agent/assistant output. Renders to React elements only (never
 * `dangerouslySetInnerHTML`), so it is XSS- and CSP-safe (no raw HTML, no `eval`). GitHub-flavored
 * markdown via `remark-gfm`; fenced code blocks are syntax-highlighted (`rehype-highlight`, pure JS) and
 * get a language label + copy button. Absolute file paths in prose become clickable links (see
 * {@link remarkFileLinks}); links never navigate the renderer — clicks are handed to the host callbacks.
 */
export interface MarkdownProps {
  source: string;
  /** Called when an http(s) link is clicked (host opens it, e.g. in a new tab). */
  onOpenLink?: (url: string) => void;
  /** Called when a linkified file path is clicked (host opens it, gated to allowed folders). */
  onOpenFile?: (path: string) => void;
  /** Localized label for a code block's copy button (defaults to "Copy"). */
  copyLabel?: string;
  className?: string;
}

function CodeBlock({
  language,
  codeClassName,
  copyLabel,
  children,
}: {
  language: string | undefined;
  codeClassName: string | undefined;
  copyLabel: string;
  children: ReactNode;
}) {
  const codeRef = useRef<HTMLElement | null>(null);
  return (
    <div className="my-2 overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border bg-surface-base px-2 py-1 text-xs text-text-secondary">
        <span className="font-mono">{language ?? 'code'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(codeRef.current?.textContent ?? '');
          }}
          className="rounded px-1.5 py-0.5 hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {copyLabel}
        </button>
      </div>
      <pre className="overflow-auto p-2 text-xs leading-relaxed">
        <code ref={codeRef} className={codeClassName}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function Markdown({
  source,
  onOpenLink,
  onOpenFile,
  copyLabel = 'Copy',
  className,
}: MarkdownProps) {
  const components: Components = {
    a({ href, children }) {
      const url = href ?? '';
      const isFile = url.startsWith(FILE_LINK_SCHEME);
      return (
        // File links carry the path via the closure, NOT a navigable href — the DOM `href` is '#', so no
        // `tepegoz-file:`/`file:` URL is ever placed in the document. http(s) keeps its href but the click
        // is intercepted (opened in a tab). Everything else was already sanitized by `fileUrlTransform`.
        <a
          href={isFile ? '#' : url}
          onClick={(e) => {
            e.preventDefault();
            if (isFile) onOpenFile?.(url.slice(FILE_LINK_SCHEME.length));
            else if (/^https?:/i.test(url)) onOpenLink?.(url);
          }}
          className="cursor-pointer break-all text-blue-500 underline decoration-dotted underline-offset-2 hover:text-blue-400"
        >
          {children}
        </a>
      );
    },
    code({ node, className: cls, children }) {
      const match = /language-(\w+)/.exec(cls ?? '');
      const start = node?.position?.start.line;
      const end = node?.position?.end.line;
      const isBlock = match !== null || (start !== undefined && end !== undefined && start !== end);
      if (!isBlock) {
        return (
          <code className="rounded bg-surface-overlay px-1 py-0.5 font-mono text-[0.85em]">
            {children}
          </code>
        );
      }
      return (
        <CodeBlock language={match?.[1]} codeClassName={cls} copyLabel={copyLabel}>
          {children}
        </CodeBlock>
      );
    },
    // The fenced-block wrapper is provided by CodeBlock; keep `pre` as a passthrough so we don't nest.
    pre({ children }) {
      return <>{children}</>;
    },
    // Compact, token-styled typography so every consumer looks consistent.
    p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    h1: ({ children }) => <h1 className="mb-1 mt-2 text-base font-semibold">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-1 mt-2 text-sm font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
    blockquote: ({ children }) => (
      <blockquote className="my-1 border-l-2 border-border pl-2 text-text-secondary">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border px-2 py-1 font-semibold">{children}</th>
    ),
    td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
  };

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFileLinks]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={fileUrlTransform}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
