import { useEffect, useState } from 'react';
import { SettingsLayout, settingsDict } from '@tepegoz/settings-ui';
import { AlertBanner, Badge, Button, Modal } from '@tepegoz/ui';
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
  onAddKey: (provider: ProviderId, label: string, apiKey: string, region?: string) => Promise<void>;
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
  const [savedTick, setSavedTick] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);

  function notify(variant: 'success' | 'error', message: string): void {
    setFeedback({ variant, message });
    setFeedbackKey((k) => k + 1);
  }

  /**
   * Confirm an ordinary write. Settings here apply instantly and there is no Save button, so without
   * this the ONLY thing the page ever said about a write was when it failed — a toggle that took and a
   * toggle that silently did nothing looked identical. It is a header pill rather than the banner
   * because a banner on every toggle would push the whole page down under the user's cursor.
   */
  function notifySaved(): void {
    setSavedTick((n) => n + 1);
  }

  useEffect(() => {
    if (savedTick === 0) return undefined;
    const id = setTimeout(() => {
      setSavedTick(0);
    }, 1600);
    return () => {
      clearTimeout(id);
    };
  }, [savedTick]);

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
    void onUpdatePrefs(patch).then(notifySaved, () => {
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

  /**
   * Opens the app's own confirm dialog. It used to call `window.confirm`, which on a real
   * `tepegoz://` page is a NATIVE dialog: unstyled, localized by Chromium rather than by this app's
   * locale, and suppressible by the same dialog interception the browser applies to web pages — so the
   * one irreversible control on this screen could lose its confirmation without anything failing.
   */
  function resetToDefaults(): void {
    setResetOpen(true);
  }

  function confirmReset(): void {
    setResetOpen(false);
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
    <>
      <SettingsLayout
        titleIcon={<IconGear />}
        sections={sections}
        initialSectionId={initialSectionId}
        banner={
          feedback ? (
            <AlertBanner key={feedbackKey} variant={feedback.variant} message={feedback.message} />
          ) : null
        }
        status={
          savedTick > 0 ? (
            <Badge variant="success" size="sm" dot>
              {s.savedIndicator}
            </Badge>
          ) : null
        }
      />
      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
        }}
        title={s.resetTitle}
        size="sm"
      >
        <p className="mt-3 text-sm text-text-secondary">{s.resetConfirm}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setResetOpen(false);
            }}
          >
            {s.cancel}
          </Button>
          <Button size="sm" variant="danger" onClick={confirmReset}>
            {s.resetButton}
          </Button>
        </div>
      </Modal>
    </>
  );
}
