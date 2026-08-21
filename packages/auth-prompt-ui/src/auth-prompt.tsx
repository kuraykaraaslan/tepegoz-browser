import { useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { authPromptDict } from './i18n';

const FIELD =
  'h-9 w-full rounded-md border border-border bg-surface-sunken px-2 text-sm text-text-primary ' +
  'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-border-focus';

export interface AuthPromptProps {
  /** The origin the challenge came from. Shown verbatim — it is the user's only phishing defence. */
  origin: string;
  /** Server-supplied realm. Untrusted, display-only, and length-capped by the caller. */
  realm: string;
  /** True when a network proxy issued the challenge rather than the page. */
  isProxy: boolean;
  onSubmit: (username: string, password: string) => void;
  onCancel: () => void;
}

/**
 * `@tepegoz/auth-prompt-ui` — the HTTP basic/digest auth dialog (401 challenge, Phase 2c).
 *
 * Credential entry, so two rules shape it: the **origin is rendered as its own line** and never
 * interpolated into a translated sentence where a long hostname could be pushed out of view, and the
 * server's realm string is displayed but never given the visual weight of app text. A proxy challenge
 * says so explicitly, because "your VPN wants your password" and "this site wants your password" are
 * very different questions and look identical otherwise.
 *
 * Presentational: the values leave through `onSubmit` and are never stored here.
 */
export function AuthPrompt({ origin, realm, isProxy, onSubmit, onCancel }: AuthPromptProps) {
  const t = useT(authPromptDict);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form
      className="flex w-[22rem] flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(username, password);
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">{t.title}</h2>

      {isProxy ? (
        <p className="text-sm text-warning">{t.proxyWarning}</p>
      ) : (
        <p className="text-sm text-text-secondary">{t.requestedBy}</p>
      )}
      <p className="break-all text-sm font-medium text-text-primary">{origin}</p>

      {realm !== '' && (
        <p className="break-all text-xs text-text-secondary">
          {`${t.realm}: ${realm}`}
        </p>
      )}

      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t.username}
        <input
          className={FIELD}
          value={username}
          autoFocus
          autoComplete="off"
          onChange={(e) => {
            setUsername(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t.password}
        <input
          className={FIELD}
          type="password"
          value={password}
          autoComplete="off"
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay"
        >
          {t.cancel}
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-fg hover:bg-primary-hover"
        >
          {t.submit}
        </button>
      </div>
    </form>
  );
}
