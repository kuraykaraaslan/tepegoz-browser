import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from './panel-icons';

/**
 * Copy one message's text to the clipboard (S8 A4 — message-level actions). Pure renderer, no bridge:
 * the Agent panel is a trusted first-party surface and `navigator.clipboard` is the same path the
 * markdown code-block copy already uses. Shows a brief "copied" tick, cleared on unmount so a fast
 * unmount cannot set state on a dead component.
 */
export function MessageCopyButton({
  text,
  label,
  copiedLabel,
}: {
  text: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded p-1 text-text-disabled opacity-0 transition-opacity hover:text-text-secondary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover:opacity-100"
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
    </button>
  );
}
