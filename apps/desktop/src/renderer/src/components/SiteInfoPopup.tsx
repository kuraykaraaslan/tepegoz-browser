import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowLeft,
  faBell,
  faCertificate,
  faChevronRight,
  faClipboard,
  faCookieBite,
  faFile,
  faGear,
  faLocationDot,
  faLock,
  faMicrophone,
  faPaste,
  faTriangleExclamation,
  faUpRightFromSquare,
  faVideo,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider, useT } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type {
  CertificateSummary,
  SitePermissionState,
  WebPermissionCapability,
} from '@tepegoz/shared-types';
import type { PageInfo } from '@tepegoz/desktop-ipc';
import { siteInfoDict } from '../../../i18n';
import { applyTheme } from '../lib/theme';

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

/** A glyph per brokered capability, so a permission row reads at a glance (Chrome's row icons). */
const CAPABILITY_ICON: Record<WebPermissionCapability, IconDefinition> = {
  camera: faVideo,
  microphone: faMicrophone,
  geolocation: faLocationDot,
  notifications: faBell,
  clipboardRead: faClipboard,
  clipboardWrite: faPaste,
};

/** Which of the three panes is showing. The bubble is a stack, not a scroll. */
type View = 'main' | 'security' | 'certificate';

/** This bubble's strings for ONE locale — what `useT(siteInfoDict)` hands back. */
type SiteInfoStrings = (typeof siteInfoDict)['en'];

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

const LINK = 'text-xs font-medium text-primary-on-surface hover:underline';

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
        <section className="border-t border-border px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            {t.permissionsTitle}
          </p>
          <ul className="space-y-1.5">
            {info.permissions.map((p) => (
              <li key={p.capability} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2.5 text-xs text-text-primary">
                  <FontAwesomeIcon
                    icon={CAPABILITY_ICON[p.capability]}
                    className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                    aria-hidden
                  />
                  <span className="truncate">{s.capability[p.capability]}</span>
                </span>
                <select
                  aria-label={s.capability[p.capability]}
                  value={p.state}
                  onChange={(e) =>
                    setPermission(info.origin, p.capability, e.target.value as SitePermissionState)
                  }
                  className="h-7 w-32 shrink-0 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  {(['prompt', 'allowed', 'denied'] as SitePermissionState[]).map((st) => (
                    <option key={st} value={st}>
                      {s.state[st]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          {info.permissions.some((p) => p.state !== 'prompt') && (
            <button
              type="button"
              onClick={() => resetPermissions(info.origin)}
              className={`mt-2.5 ${LINK}`}
            >
              {t.resetPermissions}
            </button>
          )}
        </section>
      )}

      {info.trustLevel !== null && (
        <p className="border-t border-border px-4 py-2 text-xs text-text-secondary">
          {t.trustLevel.replace('{level}', info.trustLevel)}
        </p>
      )}
    </div>
  );
}

/**
 * A drill-down header: back arrow, the pane's title, the host beneath it, close on the right — the
 * shape Chrome's "Security" sub-page uses.
 */
function SubHeader({
  title,
  subtitle,
  backLabel,
  onBack,
  close,
}: {
  title: string;
  subtitle: string;
  backLabel: string;
  onBack: () => void;
  close: ReactNode;
}) {
  return (
    <header className="flex items-start gap-2.5 px-4 pb-2 pt-3">
      <button
        type="button"
        aria-label={backLabel}
        onClick={onBack}
        className="mt-0.5 shrink-0 rounded-full border border-border p-1.5 text-text-secondary hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        {subtitle !== '' && (
          <p className="truncate text-xs text-text-secondary" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
      {close}
    </header>
  );
}

/**
 * One list row of the panel: glyph, label, and a trailing affordance that says where the row goes —
 * a chevron for a pane inside the bubble, the "leaves this bubble" arrow for Site settings, an inline
 * word (`action`) for a row that acts in place. Rendered as a plain `div` when there is nothing to
 * click, so a non-row does not sit in the tab order pretending to be a button.
 */
function Row({
  icon,
  iconClass,
  title,
  titleClass = '',
  trailing = 'chevron',
  action,
  onClick,
}: {
  icon: IconDefinition;
  iconClass: string;
  title: string;
  titleClass?: string;
  trailing?: 'chevron' | 'external' | 'none';
  action?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <FontAwesomeIcon icon={icon} className={`h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
      <span className={`min-w-0 flex-1 truncate text-sm ${titleClass}`}>{title}</span>
      {action !== undefined && (
        <span className="shrink-0 text-xs font-medium text-primary-on-surface">{action}</span>
      )}
      {onClick !== undefined && trailing !== 'none' && (
        <FontAwesomeIcon
          icon={trailing === 'external' ? faUpRightFromSquare : faChevronRight}
          className="h-3 w-3 shrink-0 text-text-secondary"
          aria-hidden
        />
      )}
    </>
  );
  const box = 'flex w-full items-center gap-3 px-4 py-2.5 text-left';
  if (onClick === undefined) {
    return <div className={box}>{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${box} hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus`}
    >
      {inner}
    </button>
  );
}

/** Chrome's certificate viewer, General tab: who it was issued to and by, for how long, its prints. */
function CertificateView({
  cert,
  valid,
  t,
}: {
  cert: CertificateSummary;
  valid: boolean;
  t: SiteInfoStrings;
}) {
  return (
    <div className="px-4 pb-4">
      <p className={`mb-3 text-xs font-medium ${valid ? 'text-text-secondary' : 'text-error'}`}>
        {valid ? t.certificateValid : t.certificateInvalid}
      </p>
      <CertSection title={t.certSubjectName}>
        <CertRow label={t.certCommonName} value={cert.subjectName} />
        {cert.serialNumber !== '' && (
          <CertRow label={t.certSerial} value={cert.serialNumber} mono />
        )}
      </CertSection>
      <CertSection title={t.certIssuerName}>
        <CertRow label={t.certCommonName} value={cert.issuerName} />
      </CertSection>
      <CertSection title={t.certValidityPeriod}>
        <CertRow label={t.certValidFrom} value={fmtDate(cert.validFrom)} />
        <CertRow label={t.certValidTo} value={fmtDate(cert.validTo)} />
      </CertSection>
      <CertSection title={t.certFingerprint}>
        <CertRow label="SHA-256" value={cert.fingerprint} mono />
      </CertSection>
      {cert.subjectAltNames.length > 0 && (
        <CertSection title={t.certSan}>
          <p className="break-all text-xs text-text-primary">{cert.subjectAltNames.join(', ')}</p>
        </CertSection>
      )}
      {cert.chain.length > 0 && (
        <CertSection title={t.certChain}>
          <ol className="space-y-1 text-xs text-text-primary">
            {cert.chain.map((node, i) => (
              <li key={`${node.subjectName}-${String(i)}`} className="break-all">
                <span className="text-text-secondary">{'— '.repeat(i + 1)}</span>
                {node.subjectName}
              </li>
            ))}
          </ol>
        </CertSection>
      )}
    </div>
  );
}

function CertSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3 last:mb-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </p>
      <dl className="space-y-1 rounded-lg border border-border px-3 py-2">{children}</dl>
    </section>
  );
}

function CertRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd
        className={`min-w-0 break-all text-right text-text-primary ${mono === true ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}
