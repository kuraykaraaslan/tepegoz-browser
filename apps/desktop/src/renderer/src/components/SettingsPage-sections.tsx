import { type SettingsSection, type SettingsStrings } from '@tepegoz/settings-ui';
import type {
  CredentialsStatus,
  LoginCredentialMeta,
  LoginImportResult,
  Preferences,
  ProviderId,
} from '@tepegoz/desktop-ipc';
import { generalAndAiSections } from './SettingsPage-sections-general';
import { privacyAndAdvancedSections } from './SettingsPage-sections-privacy';
import type { SitePermissionState, WebPermissionCapability } from '@tepegoz/shared-types';

/**
 * The section table for `SettingsPage.tsx`, split out (ADR-0010 250-line cap). The page owns all state
 * and handlers, passing them here as a single context so these builders stay pure/behavior-free.
 */
export interface SettingsSectionsCtx {
  s: SettingsStrings;
  prefs: Preferences;
  status: CredentialsStatus;
  developerVisible: boolean;
  setPref: (patch: Partial<Preferences>) => void;
  notify: (variant: 'success' | 'error', message: string) => void;
  setDeveloperPref: (patch: Partial<Preferences>) => Promise<void>;
  clearBrowsingHistory: () => void;
  resetSitePermission: (origin: string) => void;
  setSitePermission: (
    origin: string,
    capability: WebPermissionCapability,
    state: SitePermissionState,
  ) => void;
  resetToDefaults: () => void;
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

export function buildSettingsSections(ctx: SettingsSectionsCtx): SettingsSection[] {
  return [...generalAndAiSections(ctx), ...privacyAndAdvancedSections(ctx)];
}
