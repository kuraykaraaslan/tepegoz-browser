import { useState } from 'react';
import { Button, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { notificationsUiDict } from './i18n';

export interface NotificationPermissionPromptProps {
  /** Origin (e.g. "https://example.com") requesting the Web Notification permission. */
  origin: string;
  /** The user's answer; `remember` persists it for the origin. */
  onDecision: (allow: boolean, remember: boolean) => void;
}

/**
 * Consent prompt body for a site's Web Notification permission request. Presentational — the host renders
 * it inside `@tepegoz/ui` `Modal` and wires `onDecision` back to the main process. Owns its i18n strings.
 */
export function NotificationPermissionPrompt({ origin, onDecision }: NotificationPermissionPromptProps) {
  const t = useT(notificationsUiDict);
  const [remember, setRemember] = useState(true);
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-text-primary">{t.permissionTitle}</h2>
      <p className="text-sm text-text-primary">
        <span className="font-semibold break-all">{origin}</span> {t.permissionBody}
      </p>
      <Toggle
        id="notif-perm-remember"
        label={t.permissionRemember}
        checked={remember}
        onChange={setRemember}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => onDecision(false, remember)}>
          {t.permissionBlock}
        </Button>
        <Button size="sm" onClick={() => onDecision(true, remember)}>
          {t.permissionAllow}
        </Button>
      </div>
    </div>
  );
}
