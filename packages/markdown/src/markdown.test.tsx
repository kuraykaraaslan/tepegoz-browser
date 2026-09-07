// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Markdown } from './markdown';
import { FILE_LINK_SCHEME } from './remark-file-links';

/**
 * The renderer for agent/assistant output — i.e. for text a web page may have influenced. Its
 * docblock makes three promises, and all three are security properties rather than styling:
 *
 *  1. React elements only, never `dangerouslySetInnerHTML`, so raw HTML in the source is inert.
 *  2. No link ever navigates the renderer; clicks are handed to host callbacks instead.
 *  3. A linkified file path is carried in a CLOSURE, never as a navigable `href`.
 */

afterEach(cleanup);

describe('raw HTML in the source is text, not markup', () => {
  it('does not execute or mount a script tag', () => {
    render(<Markdown source={'<script>window.__pwned = true;</script>'} />);
    expect(document.querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('does not mount an img with an onerror handler', () => {
    // The classic no-script XSS: an image that fails to load and runs its handler.
    render(<Markdown source={'<img src="x" onerror="window.__pwned = true">'} />);
    expect(document.querySelector('img')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('does not mount an iframe', () => {
    render(<Markdown source={'<iframe src="https://evil.test/"></iframe>'} />);
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('links are handed to the host, never followed', () => {
  it('reports an http(s) link to the host and prevents the navigation', () => {
    const onOpenLink = vi.fn();
    render(<Markdown source={'[docs](https://example.test/docs)'} onOpenLink={onOpenLink} />);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link.getAttribute('href')).toBe('https://example.test/docs');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(link, event);

    expect(onOpenLink).toHaveBeenCalledWith('https://example.test/docs');
    expect(event.defaultPrevented).toBe(true);
  });

  it('refuses a javascript: link so completely that it is not a link at all', () => {
    // The url transform blanks the href before it reaches the DOM, which also takes the anchor out
    // of the accessibility tree — it is not reachable by keyboard and screen readers do not announce
    // it as a link. The click handler would not have reported it either. Both halves matter: this is
    // text an agent read off a web page.
    const onOpenLink = vi.fn();
    render(<Markdown source={'[click me](javascript:alert(1))'} onOpenLink={onOpenLink} />);

    expect(screen.queryByRole('link')).toBeNull();
    const anchor = screen.getByText('click me');
    expect(anchor.getAttribute('href')).toBe('');

    fireEvent.click(anchor);
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it('refuses a data: link the same way', () => {
    const onOpenLink = vi.fn();
    render(
      <Markdown
        source={'[open](data:text/html,<script>alert(1)</script>)'}
        onOpenLink={onOpenLink}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByText('open'));
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it('does nothing at all when the host wired no link handler', () => {
    render(<Markdown source={'[docs](https://example.test/)'} />);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole('link', { name: 'docs' }), event);
    // still prevented: an unhandled link must not navigate the renderer either
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('linkified file paths', () => {
  const source = 'see /home/kuray/notes.txt for the details';

  it('never puts a file url in the document — the path rides in a closure', () => {
    // A `file:` or `tepegoz-file:` href in the DOM is something a stray middle-click, a copied link
    // address, or a devtools poke can act on. The href is '#'.
    const onOpenFile = vi.fn();
    render(<Markdown source={source} onOpenFile={onOpenFile} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('#');
    expect(document.body.innerHTML).not.toContain(FILE_LINK_SCHEME);
    expect(document.body.innerHTML).not.toContain('file:');
  });

  it('hands the bare path to the host when clicked, without the scheme', () => {
    const onOpenFile = vi.fn();
    const onOpenLink = vi.fn();
    render(<Markdown source={source} onOpenFile={onOpenFile} onOpenLink={onOpenLink} />);

    fireEvent.click(screen.getByRole('link'));

    expect(onOpenFile).toHaveBeenCalledWith('/home/kuray/notes.txt');
    expect(onOpenLink).not.toHaveBeenCalled(); // a file is not a web link
  });

  it('is inert when no file handler is wired', () => {
    render(<Markdown source={source} />);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole('link'), event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('code', () => {
  it('renders an inline span for inline code, with no copy button', () => {
    render(<Markdown source={'use `npm ci` here'} />);
    expect(screen.getByText('npm ci').tagName).toBe('CODE');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a fenced block with its language label and a copy button', () => {
    render(<Markdown source={'```ts\nconst a = 1;\n```'} />);
    expect(screen.getByText('ts')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined();
  });

  it('labels a fenced block with no language as plain code', () => {
    render(<Markdown source={'```\nplain text\n```'} />);
    expect(screen.getByText('code')).toBeDefined();
  });

  it('uses the localized copy label the host supplies', () => {
    render(<Markdown source={'```\nx\n```'} copyLabel="Kopyala" />);
    expect(screen.getByRole('button', { name: 'Kopyala' })).toBeDefined();
  });

  it('copies the block contents, not the label or the chrome around it', () => {
    const copied: string[] = [];
    const writeText = vi.fn((text: string) => {
      copied.push(text);
      return Promise.resolve();
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<Markdown source={'```ts\nconst a = 1;\n```'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(copied[0]).toContain('const a = 1;');
    expect(copied[0]).not.toContain('Copy');
  });

  it('survives a clipboard the environment does not provide', () => {
    // `navigator.clipboard` is undefined without a secure context; the button must not throw.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<Markdown source={'```\nx\n```'} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Copy' }))).not.toThrow();
  });
});

describe('GitHub-flavored markdown', () => {
  it('renders a table', () => {
    render(<Markdown source={'| a | b |\n| - | - |\n| 1 | 2 |'} />);
    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeDefined();
    expect(screen.getByRole('cell', { name: '1' })).toBeDefined();
  });

  it('renders headings, lists and blockquotes with the shared typography', () => {
    render(<Markdown source={'# One\n## Two\n### Three\n\n- item\n\n1. first\n\n> quoted'} />);
    expect(screen.getByRole('heading', { level: 1, name: 'One' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'Two' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 3, name: 'Three' })).toBeDefined();
    expect(screen.getByText('item').closest('ul')).not.toBeNull();
    expect(screen.getByText('first').closest('ol')).not.toBeNull();
    expect(screen.getByText('quoted').closest('blockquote')).not.toBeNull();
  });

  it('passes the host class name through to the wrapper', () => {
    const { container } = render(<Markdown source="hi" className="agent-prose" />);
    expect(container.firstElementChild?.className).toBe('agent-prose');
  });
});
