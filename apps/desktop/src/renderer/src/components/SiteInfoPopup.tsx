import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCertificate,
  faCookieBite,
  faFile,
  faGear,
  faLock,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider, useT } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { SitePermissionState, WebPermissionCapability } from '@tepegoz/shared-types';
import type { PageInfo } from '@tepegoz/desktop-ipc';
import { siteInfoDict } from '../../../i18n';
import { applyTheme } from '../lib/theme';
import { CertificateView } from './SiteInfoCertificate';
import { PermissionsSection } from './SiteInfoPermissions';
import { Row, SubHeader } from './SiteInfoRows';

/**
 * The "Site information" bubble — Chrome's Page Info panel, as a native popup surface
 * (`?surface=site-info&url=<committed URL>`, the URL resolved by main from the sender window's active
 * tab). Floats over the live page.
 *
 * Shaped like Chrome's: three panes the user walks with a back arrow rather than one scrolling wall.
 * The panel itself is a short list of rows (connection, cookies, site settings), "Connection is secure"
 * drills into **Security**, and that drills into the **Certificate** viewer. Permissions are listed
 * only where there is something to say — a capability this site actually asked for, or one the user
 * already decided — because six always-present dropdowns for capabilities a site never wanted are
 * noise, not information; Site settings still reaches every capability.
 *
 * Permission writes go through the same `updatePreferences` path the Permissions Center uses, so there
 * is no parallel permission flow.
 */

const SHOWN_LEVELS = ['secure', 'not-secure', 'dangerous', 'internal', 'file'] as const;
type ShownLevel = (typeof SHOWN_LEVELS)[number];

const LEVEL_ICON: Record<ShownLevel, IconDefinition> = {
  secure: faLock,
  'not-secure': faTriangleExclamation,
  dangerous: faTriangleExclamation,
  internal: faGear,
  file: faFile,
};

/** Which of the three panes is showing. The bubble is a stack, not a scroll. */
type View = 'main' | 'security' | 'certificate';

export function SiteInfoPopup({ url }: { url: string }) {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme, p.themeColor);
        setLocale(
          p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language),
        );
      },
      () => {
        /* bridge unavailable — defaults */
      },
    );
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <SiteInfoBody url={url} />
      </div>
    </I18nProvider>
  );
}

function SiteInfoBody({ url }: { url: string }) {
  const t = useT(siteInfoDict);
  const s = useT(settingsDict).permissionsCenter;
  const [info, setInfo] = useState<PageInfo | null | 'error'>(null);
  const [view, setView] = useState<View>('main');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    void window.tepegoz.getPageInfo(url).then(
      (next) => setInfo(next ?? 'error'),
      () => setInfo('error'),
    );
  }, [url]);
  useEffect(load, [load]);

  // Shrink the native popup window to the rendered content (like MainMenuPopup). The ResizeObserver
  // covers content that changes height after mount (a drill-down into Security or the certificate, the
  // clear confirm opening), so the effect itself has no reason to re-run.
  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return undefined;
    const report = (): void =>
      window.tepegoz.resizePopup(Math.ceil(el.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function setPermission(
    origin: string,
    capability: WebPermissionCapability,
    state: SitePermissionState,
  ): void {
    void window.tepegoz.getPreferences().then((p) => {
      void window.tepegoz
        .updatePreferences({
          sitePermissions: {
            ...p.sitePermissions,
            [origin]: { ...p.sitePermissions[origin], [capability]: state },
          },
        })
        .then(load);
    });
  }

  function resetPermissions(origin: string): void {
    void window.tepegoz.getPreferences().then((p) => {
      const next = { ...p.sitePermissions };
      delete next[origin];
      void window.tepegoz.updatePreferences({ sitePermissions: next }).then(load);
    });
  }

  function clearSiteData(): void {
    void window.tepegoz.clearSiteData(url).then(() => {
      setConfirmingClear(false);
      load();
    });
  }

  const headerLabel =
    info !== null && info !== 'error' && info.host !== ''
      ? info.host
      : info !== null && info !== 'error' && info.scheme !== ''
        ? info.scheme.replace(':', '')
        : '';

  const closeButton = (
    <button
      type="button"
      aria-label={t.close}
      onClick={() => window.tepegoz.closePopup()}
      className="-mr-1 shrink-0 rounded-full p-1.5 text-text-secondary hover:bg-surface-overlay"
    >
      <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" aria-hidden />
    </button>
  );

  if (info === null || info === 'error') {
    return (
      <div ref={contentRef} className="flow-root">
        <header className="flex items-center justify-between gap-2 px-4 py-3">
          <span className="min-w-0 truncate text-sm font-medium">{headerLabel}</span>
          {closeButton}
        </header>
        <p
          className={`px-4 pb-5 text-sm ${info === 'error' ? 'text-error' : 'text-text-secondary'}`}
        >
          {info === 'error' ? t.loadError : s.agentLoading}
        </p>
      </div>
    );
  }

  const level: ShownLevel = SHOWN_LEVELS.includes(info.level as ShownLevel)
    ? (info.level as ShownLevel)
    : 'internal';
  const alarm = level === 'not-secure' || level === 'dangerous';
  const connText: Record<ShownLevel, { title: string; body: string }> = {
    secure: { title: t.connectionSecureTitle, body: t.connectionSecureBody },
    'not-secure': { title: t.connectionNotSecureTitle, body: t.connectionNotSecureBody },
    dangerous: { title: t.connectionDangerousTitle, body: t.connectionDangerousBody },
    internal: { title: t.connectionInternalNote, body: '' },
    file: { title: t.connectionFileNote, body: '' },
  };
  const conn = connText[level];
  const isWeb = info.scheme === 'http:' || info.scheme === 'https:';
  const certValid = info.certErrorCode === null;
  const cookieText =
    info.cookieCount === 0
      ? t.cookiesNone
      : info.cookieCount === 1
        ? t.cookiesInUseOne
        : t.cookiesInUse.replace('{count}', String(info.cookieCount));

  // Security — the "Connection is secure" drill-down.
  if (view === 'security') {
    return (
      <div ref={contentRef} className="flow-root">
        <SubHeader
          title={t.securityTitle}
          subtitle={headerLabel}
          backLabel={t.back}
          onBack={() => setView('main')}
          close={closeButton}
        />
        <section className={`px-4 pb-3 pt-1 ${alarm ? 'bg-error-subtle' : ''}`}>
          <div className="flex items-start gap-3">
            <FontAwesomeIcon
              icon={LEVEL_ICON[level]}
              className={`mt-0.5 h-4 w-4 shrink-0 ${alarm ? 'text-error' : 'text-text-secondary'}`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className={`text-sm font-medium ${alarm ? 'text-error' : 'text-text-primary'}`}>
                {conn.title}
              </p>
              {conn.body !== '' && (
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">{conn.body}</p>
              )}
            </div>
          </div>
        </section>
        {info.certificate !== null && (
          <div className="border-t border-border py-1">
            <Row
              icon={faCertificate}
              iconClass={certValid ? 'text-text-secondary' : 'text-error'}
              title={certValid ? t.certificateValid : t.certificateInvalid}
              titleClass={certValid ? '' : 'text-error'}
              onClick={() => setView('certificate')}
            />
          </div>
        )}
      </div>
    );
  }

  // The certificate viewer.
  if (view === 'certificate' && info.certificate !== null) {
    return (
      <div ref={contentRef} className="flow-root">
        <SubHeader
          title={t.certificate}
          subtitle={headerLabel}
          backLabel={t.back}
          onBack={() => setView('security')}
          close={closeButton}
        />
        <CertificateView cert={info.certificate} valid={certValid} t={t} />
      </div>
    );
  }

  // The panel itself.
  return (
    <div ref={contentRef} className="flow-root">
      <header className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <span className="min-w-0 truncate text-sm font-medium" title={headerLabel}>
          {headerLabel}
        </span>
        {closeButton}
      </header>

      <div className="py-1">
        <Row
          icon={LEVEL_ICON[level]}
          iconClass={alarm ? 'text-error' : 'text-text-secondary'}
          title={conn.title}
          titleClass={alarm ? 'text-error' : ''}
          onClick={() => setView('security')}
        />
        {info.tunnelExit !== null && info.scheme === 'http:' && (
          // Phase 5: a tunnel exit (Tor especially) is untrusted, and on a cleartext page it can read
          // and rewrite everything. The connection row already says "not secure"; this says who sees it.
          <p className="mx-4 mb-2 flex gap-2 rounded-lg border border-error/40 bg-error/5 px-3 py-2 text-xs text-error">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden
            />
            <span>
              {info.tunnelExit === 'tor'
                ? t.cleartextOverTor
                : info.tunnelExit === 'vpn'
                  ? t.cleartextOverVpn
                  : t.cleartextOverProxy}
            </span>
          </p>
        )}
        {isWeb && (
          <Row
            icon={faCookieBite}
            iconClass="text-text-secondary"
            title={cookieText}
            trailing="none"
            {...(info.cookieCount > 0 && !confirmingClear
              ? { onClick: () => setConfirmingClear(true), action: t.clearSiteData }
              : {})}
          />
        )}
        {confirmingClear && (
          <div className="mx-4 mb-2 rounded-lg border border-border px-3 py-2 text-xs">
            <p className="text-text-secondary">
              {t.clearSiteDataBody.replace('{site}', info.host)}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={clearSiteData}
                className="rounded-md bg-error px-2.5 py-1 font-medium text-white"
              >
                {t.clearSiteDataConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="rounded-md px-2.5 py-1 text-text-secondary hover:bg-surface-overlay"
              >
                {t.close}
              </button>
            </div>
          </div>
        )}
        <Row
          icon={faGear}
          iconClass="text-text-secondary"
          title={t.siteSettings}
          trailing="external"
          onClick={() => {
            window.tepegoz.navigateTab('tepegoz://settings#privacy');
            window.tepegoz.closePopup();
          }}
        />
      </div>

      {isWeb && info.permissions.length > 0 && (
        <PermissionsSection
          permissions={info.permissions}
          t={t}
          s={s}
          onChange={(capability, state) => setPermission(info.origin, capability, state)}
          onReset={() => resetPermissions(info.origin)}
        />
      )}

      {info.trustLevel !== null && (
        <p className="border-t border-border px-4 py-2 text-xs text-text-secondary">
          {t.trustLevel.replace('{level}', info.trustLevel)}
        </p>
      )}
    </div>
  );
}
