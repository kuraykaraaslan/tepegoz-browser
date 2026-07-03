import { useT } from '@tepegoz/i18n/react';
import type { LoginCredentialMeta } from '@tepegoz/desktop-ipc';
import { passwordUiDict } from './i18n';

export interface AutofillSuggestionProps {
  url: string;
  matches: LoginCredentialMeta[];
  onFill: (credentialId: string) => void;
  onDismiss: () => void;
}

export function AutofillSuggestion({ url, matches, onFill, onDismiss }: AutofillSuggestionProps) {
  const t = useT(passwordUiDict);

  if (matches.length === 0) return null;

  return (
    <div className="autofill-suggestion" role="dialog" aria-label={t.autofillTitle}>
      <div className="autofill-suggestion__header">
        <span>{t.autofillHint}</span>
        <button
          className="autofill-suggestion__dismiss"
          aria-label={t.autofillDismiss}
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <ul className="autofill-suggestion__list">
        {matches.map((m) => (
          <li key={m.id} className="autofill-suggestion__item">
            <div className="autofill-suggestion__item-info">
              <span className="autofill-suggestion__item-title">{m.title || url}</span>
              <span className="autofill-suggestion__item-username">{m.username}</span>
            </div>
            <button
              className="autofill-suggestion__fill"
              onClick={() => onFill(m.id)}
            >
              {t.autofillFill}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
