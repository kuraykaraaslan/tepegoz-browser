import { useT } from '@tepegoz/i18n/react';
import { clientCertPickerDict } from './i18n';

export interface ClientCertOption {
  index: number;
  subject: string;
  issuer: string;
  /** ISO-8601. Shown so two otherwise identical certificates can be told apart. */
  expiry: string;
}

export interface ClientCertPickerProps {
  origin: string;
  options: ClientCertOption[];
  /** `null` means send nothing. */
  onChoose: (index: number | null) => void;
}

/**
 * The client-certificate chooser — which certificate, if any, to send a site that asked the user to
 * identify themselves.
 *
 * It exists because Electron's default was to send the FIRST certificate in the OS store without
 * asking (see `auth/client-certificate-broker.ts`). So the design rule here is the opposite of a
 * consent dialog that nudges toward "allow": **the safe answer is the primary button, and it comes
 * first.** Sending a client certificate is a private-key-backed assertion of who the user is; a
 * chooser that pre-selects one and offers "OK" would reproduce the defect with a dialog in front of it.
 *
 * Nothing is pre-selected, and dismissing the prompt sends nothing.
 *
 * `subject` and `issuer` are certificate fields. They name the user and their CA and are shown as
 * evidence for the choice — the user needs to see WHICH identity they would be handing over.
 */
export function ClientCertPicker({ origin, options, onChoose }: ClientCertPickerProps) {
  const t = useT(clientCertPickerDict);

  return (
    <div className="flex w-[26rem] flex-col gap-3 p-5">
      <h2 className="text-base font-semibold text-text-primary">{t.title}</h2>
      <p className="text-sm text-text-secondary">{t.intro}</p>
      <p className="break-all text-sm font-medium text-text-primary">{origin}</p>
      <p className="text-sm text-text-secondary">{t.explain}</p>

      <button
        type="button"
        autoFocus
        onClick={() => {
          onChoose(null);
        }}
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-fg hover:bg-primary-hover"
      >
        {t.sendNothing}
      </button>

      <ul className="flex flex-col gap-1.5">
        {options.map((option) => (
          <li key={option.index}>
            <button
              type="button"
              onClick={() => {
                onChoose(option.index);
              }}
              className="flex w-full flex-col gap-0.5 rounded-md border border-border px-3 py-2 text-left hover:bg-surface-overlay"
            >
              <span className="break-all text-sm text-text-primary">{option.subject}</span>
              <span className="break-all text-xs text-text-secondary">
                {t.issuer} {option.issuer}
              </span>
              <span className="text-xs text-text-secondary">
                {t.expiry} {option.expiry}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-center text-xs text-text-disabled">{t.rememberNote}</p>
    </div>
  );
}
