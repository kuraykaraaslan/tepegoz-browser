import { useEffect, useState } from 'react';
import { SettingsLayout, settingsDict } from '@tepegoz/settings-ui';
import { AlertBanner } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import type {
  CredentialsStatus,
  LoginCredentialMeta,
  LoginImportResult,
  Preferences,
  ProviderId,
} from '@tepegoz/desktop-ipc';
import { IconGear } from './SettingsPage-icons';
import { buildSettingsSections } from './SettingsPage-sections';
import { isDeveloperSettingsVisible, nodeEnv } from '../lib/developer-env';
import type { SitePermissionState, WebPermissionCapability } from '@tepegoz/shared-types';

interface SettingsPageProps {
  initialSectionId?: string;
  prefs: Preferences;
  status: CredentialsStatus;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  /** Reset every preference to its default (leaves stored credentials untouched). */
  onResetPrefs: () => Promise<void>;
  onAddKey: (provider: ProviderId, label: string, apiKey: string) => Promise<void>;
  onRemoveKeyById: (id: string) => Promise<void>;
  onRenameKey: (id: string, label: string) => Promise<void>;
  onSetKeyModel: (id: string, model: string) => Promise<void>;
  onReorderKeys: (orderedIds: string[]) => Promise<void>;
  loginCredentials: LoginCredentialMeta[];
  onLoginSectionMount: () => Promise<void>;
  onAddLogin: (c: {
    url: string;
    username: string;
    password: string;
    title?: string;
    notes?: string;
  }) => Promise<void>;
  onRemoveLogin: (id: string) => Promise<void>;
  onImportLogins: (data: string, format: string) => Promise<LoginImportResult>;
  onExportLogins: (format: string) => Promise<string>;
}

export function SettingsPage({
  initialSectionId,
  prefs,
  status,
  onUpdatePrefs,
  onResetPrefs,
  onAddKey,
  onRemoveKeyById,
  onRenameKey,
  onSetKeyModel,
  onReorderKeys,
  loginCredentials,
  onLoginSectionMount,
  onAddLogin,
  onRemoveLogin,
  onImportLogins,
  onExportLogins,
}: SettingsPageProps) {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'error';
    message: string;
  } | null>(null);
  const [feedbackKey, setFeedbackKey] = useState(0);

  function notify(variant: 'success' | 'error', message: string): void {
    setFeedback({ variant, message });
    setFeedbackKey((k) => k + 1);
  }

  // Transient feedback auto-dismisses — no manual close button (avoids a non-localized control).
  useEffect(() => {
    if (feedbackKey === 0) return undefined;
    const id = setTimeout(() => {
      setFeedback(null);
    }, 4000);
    return () => {
      clearTimeout(id);
    };
  }, [feedbackKey]);

  function setPref(patch: Partial<Preferences>): void {
    void onUpdatePrefs(patch).catch(() => {
      notify('error', c.errors.upstreamDown);
    });
  }

  async function setDeveloperPref(patch: Partial<Preferences>): Promise<void> {
    try {
      await onUpdatePrefs(patch);
      notify('success', s.developerSaved);
    } catch (err) {
      notify('error', c.errors.upstreamDown);
      throw err;
    }
  }

  /**
   * Set one capability for one origin. Goes through the ordinary preferences write — the same
   * validated boundary every other setting uses — rather than a second IPC path to the same store,
   * which would be a second thing to keep in agreement with it.
   */
  function setSitePermission(
    origin: string,
    capability: WebPermissionCapability,
    state: SitePermissionState,
  ): void {
    setPref({
      sitePermissions: {
        ...prefs.sitePermissions,
        [origin]: { ...prefs.sitePermissions[origin], [capability]: state },
      },
    });
  }

  function resetSitePermission(origin: string): void {
    const next = { ...prefs.sitePermissions };
    delete next[origin];
    setPref({ sitePermissions: next });
  }

  function clearBrowsingHistory(): void {
    void window.tepegoz.clearHistory().then(
      () => {
        notify('success', s.historyCleared);
      },
      () => {
        notify('error', c.errors.upstreamDown);
      },
    );
  }

  function resetToDefaults(): void {
    if (!window.confirm(s.resetConfirm)) return;
    void onResetPrefs().then(
      () => {
        notify('success', s.resetDone);
      },
      () => {
        notify('error', c.errors.upstreamDown);
      },
    );
  }

  const sections = buildSettingsSections({
    s,
    prefs,
    status,
    developerVisible: isDeveloperSettingsVisible(nodeEnv),
    setPref,
    notify,
    setDeveloperPref,
    clearBrowsingHistory,
    resetSitePermission,
    setSitePermission,
    resetToDefaults,
    onAddKey,
    onRemoveKeyById,
    onRenameKey,
    onSetKeyModel,
    onReorderKeys,
    loginCredentials,
    onLoginSectionMount,
    onAddLogin,
    onRemoveLogin,
    onImportLogins,
    onExportLogins,
  });

  return (
    <SettingsLayout
      titleIcon={<IconGear />}
      sections={sections}
      initialSectionId={initialSectionId}
      banner={
        feedback ? (
          <AlertBanner key={feedbackKey} variant={feedback.variant} message={feedback.message} />
        ) : null
      }
    />
  );
}
