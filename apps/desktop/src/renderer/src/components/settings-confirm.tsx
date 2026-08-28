import { useState, type ReactNode } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Modal } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';

/**
 * A button whose action is irreversible, and the dialog that says so before it runs.
 *
 * Several controls on these pages destroy something that cannot be got back — a stored API key whose
 * raw value never returns, a multi-gigabyte model, a saved tunnel — and every one of them fired on the
 * first click. The two that did ask used `window.confirm`, which on a real `tepegoz://` page is a
 * NATIVE dialog: unstyled, localized by Chromium rather than by this app, and suppressible by the same
 * dialog interception the browser applies to web pages.
 *
 * One component so the wording, the button order and the destructive styling are the same everywhere;
 * a confirmation people meet in four different shapes is one they stop reading.
 */
export function ConfirmAction({
  label,
  title,
  body,
  confirmLabel,
  onConfirm,
  buttonVariant = 'outline',
  disabled = false,
}: {
  label: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  buttonVariant?: 'outline' | 'danger' | 'ghost';
  disabled?: boolean;
}) {
  const s = useT(settingsDict);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant={buttonVariant}
        disabled={disabled}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={title}
        size="sm"
      >
        <div className="mt-3 text-sm text-text-secondary">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(false);
            }}
          >
            {s.cancel}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </Modal>
    </>
  );
}
