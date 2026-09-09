import { useId, useState, type ReactNode } from 'react';
import { useT } from '@tepegoz/i18n/react';
import './chat-ui.css';
import type { ChatAccount } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import {
  emptyAccountForm,
  validateXmppAccountForm,
  type AccountFormErrors,
  type AccountFormField,
  type AccountFormState,
} from './account-form';

export interface AccountSetupResult {
  account: Omit<ChatAccount, 'secretRef' | 'updatedAt' | 'version'>;
  secret: string;
}

export interface AccountSetupFormProps {
  onAdd: (result: AccountSetupResult) => void | Promise<void>;
  onCancel?: () => void;
  /** Disable while a previous add is still in flight. */
  busy?: boolean;
}

/**
 * Add-an-account form. XMPP-only for now (the single shipped adapter); the field set will branch on
 * protocol / adapter caps once IRC and Matrix land. The password crosses to `onAdd` once and is the
 * caller's job to hand to the vault — it is never held here beyond the keystroke.
 */
export function AccountSetupForm({ onAdd, onCancel, busy = false }: Readonly<AccountSetupFormProps>) {
  const s = useT(chatUiDict);
  const [form, setForm] = useState<AccountFormState>(emptyAccountForm);
  const [errors, setErrors] = useState<AccountFormErrors>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const idBase = useId();

  const set = <K extends keyof AccountFormState>(key: K, value: AccountFormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const fieldId = (field: AccountFormField): string => `${idBase}-${field}`;
  const errId = (field: AccountFormField): string => `${idBase}-${field}-err`;

  const field = (
    fieldKey: AccountFormField,
    labelText: string,
    input: ReactNode,
    hint?: string,
  ): ReactNode => (
    <div className="chat-setup__field" data-invalid={errors[fieldKey] !== undefined}>
      <label htmlFor={fieldId(fieldKey)}>{labelText}</label>
      {input}
      {hint !== undefined && <p className="chat-setup__hint">{hint}</p>}
      {errors[fieldKey] !== undefined && (
        <p className="chat-setup__error" id={errId(fieldKey)} role="alert">
          {errors[fieldKey]}
        </p>
      )}
    </div>
  );

  const submit = (): void => {
    if (busy) return;
    const result = validateXmppAccountForm(form, s.setup.errors);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void onAdd({ account: result.account, secret: result.secret });
  };

  return (
    <form
      className="chat-setup"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>{s.setup.title}</h2>

      {field(
        'label',
        s.setup.label,
        <input
          id={fieldId('label')}
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          aria-describedby={errors.label !== undefined ? errId('label') : undefined}
        />,
        s.setup.labelHint,
      )}

      {field(
        'jid',
        s.setup.jid,
        <input
          id={fieldId('jid')}
          value={form.jid}
          inputMode="email"
          autoComplete="username"
          placeholder={s.setup.jidHint}
          onChange={(e) => set('jid', e.target.value)}
          aria-describedby={errors.jid !== undefined ? errId('jid') : undefined}
        />,
      )}

      {field(
        'password',
        s.setup.password,
        <input
          id={fieldId('password')}
          type="password"
          value={form.password}
          autoComplete="current-password"
          onChange={(e) => set('password', e.target.value)}
          aria-describedby={errors.password !== undefined ? errId('password') : undefined}
        />,
      )}

      <button
        type="button"
        className="chat-setup__advanced-toggle"
        aria-expanded={showAdvanced}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {s.setup.advanced}
      </button>

      {showAdvanced && (
        <fieldset className="chat-setup__advanced">
          {field(
            'host',
            s.setup.host,
            <input
              id={fieldId('host')}
              value={form.host}
              onChange={(e) => set('host', e.target.value)}
            />,
            s.setup.hostHint,
          )}
          {field(
            'port',
            s.setup.port,
            <input
              id={fieldId('port')}
              inputMode="numeric"
              value={form.port}
              onChange={(e) => set('port', e.target.value)}
              aria-describedby={errors.port !== undefined ? errId('port') : undefined}
            />,
          )}
          {field(
            'security',
            s.setup.security,
            <select
              id={fieldId('security')}
              value={form.security}
              onChange={(e) => set('security', e.target.value === 'starttls' ? 'starttls' : 'tls')}
            >
              <option value="tls">{s.setup.securityTls}</option>
              <option value="starttls">{s.setup.securityStarttls}</option>
            </select>,
          )}
          {field(
            'wsUrl',
            s.setup.wsUrl,
            <input
              id={fieldId('wsUrl')}
              value={form.wsUrl}
              onChange={(e) => set('wsUrl', e.target.value)}
              aria-describedby={errors.wsUrl !== undefined ? errId('wsUrl') : undefined}
            />,
          )}
        </fieldset>
      )}

      <div className="chat-setup__actions">
        {onCancel !== undefined && (
          <button type="button" onClick={() => onCancel()} disabled={busy}>
            {s.setup.cancel}
          </button>
        )}
        <button type="submit" disabled={busy}>
          {s.setup.add}
        </button>
      </div>
    </form>
  );
}
