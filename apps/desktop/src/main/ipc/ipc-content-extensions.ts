import { BrowserWindow } from 'electron';
import {
  IpcChannels,
  type AdblockSettings,
  type AdblockState,
  type PopupBlockerRequest,
  type PopupBlockerSettings,
  type TranslatePageState,
  type TranslateSettings,
  type TranslateState,
  type TranslateTextResult,
  type TypoCheckResult,
  type TypoDictionaryInfo,
  type TypoSettings,
  type TypoState,
} from '@tepegoz/desktop-ipc';
import {
  AdblockPatchSchema,
  AdblockSiteEnabledSchema,
  PopupBlockerPatchSchema,
  PopupOriginSchema,
  TypoCheckInputSchema,
  TypoDictionaryIdSchema,
  TypoIgnoredWordAddSchema,
  TypoPatchSchema,
  TypoSiteEnabledSchema,
  TranslateCloudFallbackResponseSchema,
  TranslateGlossaryAddSchema,
  TranslateGlossaryIdSchema,
  TranslatePatchSchema,
  TranslateSiteEnabledSchema,
  TranslateTextInputSchema,
  UserAgentSelectionSchema,
} from '@tepegoz/desktop-ipc/schemas';
import userAgentHost from '../extensions/user-agent-host.electron';
import popupBlockerHost from '../extensions/popup-blocker-host.electron';
import adblockHost from '../extensions/adblock-host.electron';
import AdblockEngineService from '../extensions/adblock-engine.electron';
import typoHost from '../extensions/typo-host.electron';
import TypoDictionaryManager from '../extensions/typo-dictionary-manager.electron';
import translateHost, { respondTranslateCloudFallback } from '../extensions/translate-host.electron';
import TranslatePageInjector from '../extensions/translate-page-injector.electron';
import { handle, handleAsync, onAction } from './ipc-helpers';

/**
 * User-agent + popup-blocker + adblock + typo + translate extension IPC handlers (extracted from
 * `ipc-content.ts`, ADR-0010 250-line cap).
 */

/** Register user-agent + popup-blocker + adblock + typo + translate extension handlers. */
export function registerExtensionsIpc(): void {
  // User-Agent switcher extension: read/apply the UA override for browsed pages.
  handle(IpcChannels.userAgentGet, (): string | null => userAgentHost.get());
  handle(IpcChannels.userAgentSet, (_event, payload): string | null => {
    const ua = UserAgentSelectionSchema.parse(payload);
    return userAgentHost.set(ua);
  });

  // Popup Blocker (strict) extension: read/patch settings + trust an origin.
  handle(IpcChannels.popupBlockerGet, (): PopupBlockerSettings => popupBlockerHost.get());
  handle(IpcChannels.popupBlockerSet, (_event, payload): PopupBlockerSettings => {
    const patch = PopupBlockerPatchSchema.parse(payload) as Partial<PopupBlockerSettings>;
    return popupBlockerHost.update(patch);
  });
  onAction(IpcChannels.popupBlockerTrust, PopupOriginSchema, (origin) => {
    popupBlockerHost.trustOrigin(origin);
  });
  handle(IpcChannels.popupBlockerRecentRequests, (): PopupBlockerRequest[] =>
    popupBlockerHost.getRecentRequests(),
  );

  // Adblock Shield extension: read/patch settings, per-site pause, session state, and safe refresh.
  handle(IpcChannels.adblockGet, (): AdblockSettings => adblockHost.get());
  handle(IpcChannels.adblockSet, (_event, payload): AdblockSettings => {
    const patch = AdblockPatchSchema.parse(payload) as Partial<AdblockSettings>;
    return adblockHost.update(patch);
  });
  handle(IpcChannels.adblockState, (): AdblockState => adblockHost.state());
  handle(IpcChannels.adblockSiteSet, (_event, payload): AdblockSettings => {
    const { origin, enabled } = AdblockSiteEnabledSchema.parse(payload);
    return adblockHost.setSiteEnabled(origin, enabled);
  });
  handleAsync(IpcChannels.adblockRefresh, async (): Promise<AdblockState> => {
    await AdblockEngineService.refresh({ manual: true });
    return adblockHost.state();
  });

  // Typo extension: settings, live checks, per-site pause, ignored words, and downloadable dictionaries.
  handle(IpcChannels.typoGet, (): TypoSettings => typoHost.get());
  handle(IpcChannels.typoSet, (_event, payload): TypoSettings => {
    const patch = TypoPatchSchema.parse(payload) as Partial<TypoSettings>;
    return typoHost.update(patch);
  });
  handle(IpcChannels.typoState, (): TypoState => typoHost.state());
  handleAsync(IpcChannels.typoCheck, async (_event, payload): Promise<TypoCheckResult> => {
    return typoHost.check(TypoCheckInputSchema.parse(payload));
  });
  handle(IpcChannels.typoDictionariesList, (): TypoDictionaryInfo[] =>
    TypoDictionaryManager.list(),
  );
  TypoDictionaryManager.setProgressListener((dictionaries) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IpcChannels.typoDictionariesState, dictionaries);
    }
  });
  handleAsync(IpcChannels.typoDictionaryDownload, async (_event, payload): Promise<void> => {
    await TypoDictionaryManager.download(TypoDictionaryIdSchema.parse(payload));
  });
  onAction(IpcChannels.typoDictionaryCancel, TypoDictionaryIdSchema, (id) => {
    TypoDictionaryManager.cancel(id);
  });
  handle(IpcChannels.typoDictionaryDelete, (_event, payload): void => {
    TypoDictionaryManager.remove(TypoDictionaryIdSchema.parse(payload));
  });
  handleAsync(IpcChannels.typoDictionaryShowFolder, (): Promise<void> =>
    TypoDictionaryManager.showFolder(),
  );
  handle(IpcChannels.typoSiteSet, (_event, payload): TypoSettings => {
    const { origin, enabled } = TypoSiteEnabledSchema.parse(payload);
    return typoHost.setSiteEnabled(origin, enabled);
  });
  handle(IpcChannels.typoIgnoredWordAdd, (_event, payload): TypoSettings => {
    const { word, language } = TypoIgnoredWordAddSchema.parse(payload);
    return typoHost.addIgnoredWord(word, language);
  });

  // Translate extension: settings, text translation, full-page actions, per-site pause, glossary.
  handle(IpcChannels.translateGet, (): TranslateSettings => translateHost.get());
  handle(IpcChannels.translateSet, (_event, payload): TranslateSettings => {
    const patch = TranslatePatchSchema.parse(payload) as Partial<TranslateSettings>;
    return translateHost.update(patch);
  });
  handle(IpcChannels.translateState, (): TranslateState => translateHost.state());
  handleAsync(IpcChannels.translateText, async (_event, payload): Promise<TranslateTextResult> => {
    return translateHost.translateText(TranslateTextInputSchema.parse(payload));
  });
  handleAsync(IpcChannels.translatePageStart, async (): Promise<TranslatePageState | null> => {
    return TranslatePageInjector.translateActive();
  });
  handleAsync(IpcChannels.translatePageRestore, async (): Promise<TranslatePageState | null> => {
    return TranslatePageInjector.restoreActive();
  });
  handle(IpcChannels.translateSiteSet, (_event, payload): TranslateSettings => {
    const { origin, enabled } = TranslateSiteEnabledSchema.parse(payload);
    return translateHost.setSiteEnabled(origin, enabled);
  });
  handle(IpcChannels.translateGlossaryAdd, (_event, payload): TranslateSettings => {
    return translateHost.addGlossaryTerm(TranslateGlossaryAddSchema.parse(payload));
  });
  handle(IpcChannels.translateGlossaryRemove, (_event, payload): TranslateSettings => {
    return translateHost.removeGlossaryTerm(TranslateGlossaryIdSchema.parse(payload));
  });
  onAction(IpcChannels.translateCloudFallbackRespond, TranslateCloudFallbackResponseSchema, (response) => {
    respondTranslateCloudFallback(response);
  });
}
