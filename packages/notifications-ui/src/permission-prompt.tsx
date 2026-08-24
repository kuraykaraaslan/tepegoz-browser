import { useState } from 'react';
import { Button, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { WebPermissionCapability } from '@tepegoz/shared-types';
import { notificationsUiDict } from './i18n';

export interface NotificationPermissionPromptProps {
  /** Origin (e.g. "https://example.com") requesting the Web Notification permission. */
  origin: string;
  capability?: WebPermissionCapability | undefined;
  /** The user's answer; `remember` persists it for the origin. */
  onDecision: (allow: boolean, remember: boolean) => void;
}

/**
 * Consent prompt body for a site's Web Notification permission request. Presentational — the host renders
 * it inside `@tepegoz/ui` `Modal` and wires `onDecision` back to the main process. Owns its i18n strings.
 */
export function NotificationPermissionPrompt({
  origin,
  capability = 'notifications',
  onDecision,
}: NotificationPermissionPromptProps) {
  const t = useT(notificationsUiDict);
  const [remember, setRemember] = useState(true);
  // One entry per brokered capability. A `Record` rather than a ternary chain so that adding a
  // capability to the union without giving it words is a type error rather than a prompt that quietly
  // says "wants to show notifications" while asking for the camera.
  const COPY: Record<WebPermissionCapability, { title: string; body: string }> = {
    notifications: { title: t.permissionTitle, body: t.permissionBody },
    clipboardRead: { title: t.permissionClipboardReadTitle, body: t.permissionClipboardReadBody },
    clipboardWrite: {
      title: t.permissionClipboardWriteTitle,
      body: t.permissionClipboardWriteBody,
    },
    camera: { title: t.permissionCameraTitle, body: t.permissionCameraBody },
    microphone: { title: t.permissionMicrophoneTitle, body: t.permissionMicrophoneBody },
    geolocation: { title: t.permissionGeolocationTitle, body: t.permissionGeolocationBody },
  };
  const copy = COPY[capability];
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-text-primary">{copy.title}</h2>
      <p className="text-sm text-text-primary">
        <span className="font-semibold break-all">{origin}</span> {copy.body}
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
