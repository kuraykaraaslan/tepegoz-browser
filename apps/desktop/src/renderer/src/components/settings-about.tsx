import { useEffect, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, BrandMark, Button, Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { AppInfo } from '@tepegoz/desktop-ipc';
import {
  AUTHOR_LINKS,
  LICENSE_URL,
  PROJECT_LINKS,
  RELEASES_URL,
  THIRD_PARTY_NOTICES_FALLBACK_URL,
  type AboutLink,
} from './settings-about-links';

/**
 * `tepegoz://settings#about` — what this build IS.
 *
 * A browser's About page is not a credits screen: it is the one place a user can answer "which
 * Chromium am I running, which build is this, and where is the source" — the three questions every
 * useful bug report and every AGPL obligation turn on. So the engine and build rows come from MAIN
 * (`AppInfo`), the copy button is a main-composed clipboard write, and a value nobody stamped is shown
 * as unstamped rather than hidden. Split out of `settings-privacy-files.tsx`, whose name never
 * described it (ADR-0010 250-line cap).
 */

/** One `label: value` row of the build table. `mono` marks values people copy digit-for-digit. */
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-text-secondary">{label}</dt>
      <dd className={mono === true ? 'font-mono text-text-primary' : 'text-text-primary'}>{value}</dd>
    </>
  );
}

/**
 * An address, rendered as an anchor rather than a button. The visual is the outline button, but the
 * element is a link — so it gets the URL preview, middle-click, and "copy link address" that a
 * `<button onClick>` silently takes away. The click is still intercepted: this browser opens its own
 * links in its own tab, not in the OS's default one.
 */
function ExternalLink({ url, label, hint }: { url: string; label: string; hint: string }) {
  return (
    <Button
      as="a"
      href={url}
      title={hint}
      size="sm"
      variant="outline"
      iconRight={<FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        window.tepegoz.createTab(url);
      }}
    >
      {label}
    </Button>
  );
}

function LinkRow({
  links,
  hint,
  label,
}: {
  links: readonly AboutLink[];
  hint: string;
  label: (l: AboutLink) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <ExternalLink key={link.id} url={link.url} label={label(link)} hint={hint} />
      ))}
    </div>
  );
}

export function AboutSection() {
  const s = useT(settingsDict);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [noticesFellBack, setNoticesFellBack] = useState(false);

  useEffect(() => {
    void window.tepegoz.getAppInfo().then(setInfo, () => {
      // Leave `info` null: the rows below then render an explicit dash rather than vanishing, so a
      // broken bridge looks broken instead of looking like a build with no version.
      setInfo(null);
    });
  }, []);

  const unknown = '—';
  const build = info?.build;
  const stamped = build !== undefined && (build.commit !== '' || build.builtAt !== '');
  const buildLine = stamped
    ? [build.commit, build.builtAt].filter((part) => part !== '').join(' · ')
    : s.aboutBuildUnstamped;
  const osLine =
    info === null ? unknown : `${info.os.name} ${info.os.version} (${info.os.arch})`;

  function copyDiagnostics(): void {
    window.tepegoz.copyDiagnostics().then(
      () => {
        setCopy('copied');
      },
      () => {
        setCopy('failed');
      },
    );
  }

  function openNotices(): void {
    window.tepegoz.openThirdPartyNotices().then(
      (opened) => {
        if (opened) return;
        setNoticesFellBack(true);
        window.tepegoz.createTab(THIRD_PARTY_NOTICES_FALLBACK_URL);
      },
      () => {
        setNoticesFellBack(true);
        window.tepegoz.createTab(THIRD_PARTY_NOTICES_FALLBACK_URL);
      },
    );
  }

  const copyStatus: Record<'idle' | 'copied' | 'failed', ReactNode> = {
    idle: <span className="text-xs text-text-secondary">{s.aboutCopyDiagnosticsHint}</span>,
    copied: (
      <Badge variant="success" size="sm">
        {s.aboutCopied}
      </Badge>
    ),
    failed: (
      <Badge variant="error" size="sm">
        {s.aboutCopyFailed}
      </Badge>
    ),
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start gap-4">
          <BrandMark className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">{s.aboutProjectTitle}</h2>
              {info !== null && (
                <Badge variant="neutral" size="sm" className="font-mono">
                  {info.version}
                </Badge>
              )}
              {build?.packaged === false && (
                <Badge variant="warning" size="sm">
                  {s.aboutChannelDev}
                </Badge>
              )}
            </div>
            <p className="mt-2 text-sm text-text-secondary">{s.aboutProjectDesc}</p>
          </div>
        </div>
      </Card>

      <Card
        title={s.aboutBuildTitle}
        headerRight={
          <Button size="sm" variant="outline" onClick={copyDiagnostics}>
            {s.aboutCopyDiagnostics}
          </Button>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-primary">{s.aboutUpdatesTitle}</p>
              <p className="text-xs text-text-secondary">{s.aboutUpdatesUnavailable}</p>
            </div>
            <ExternalLink url={RELEASES_URL} label={s.aboutReleases} hint={s.aboutOpensInNewTab} />
          </div>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <InfoRow label={s.aboutVersion} value={info?.version ?? unknown} mono />
          <InfoRow label={s.aboutChannel} value={build?.channel ?? unknown} />
          <InfoRow label={s.aboutBuildLabel} value={buildLine} mono={stamped} />
          <InfoRow label={s.aboutChromium} value={info?.engines.chromium ?? unknown} mono />
          <InfoRow label={s.aboutElectron} value={info?.engines.electron ?? unknown} mono />
          <InfoRow label={s.aboutNode} value={info?.engines.node ?? unknown} mono />
          <InfoRow label={s.aboutV8} value={info?.engines.v8 ?? unknown} mono />
          <InfoRow label={s.aboutPlatform} value={osLine} />
        </dl>
        <div className="mt-4">{copyStatus[copy]}</div>
      </Card>

      <Card title={s.aboutLegalTitle}>
        <p className="text-sm text-text-secondary">
          {s.aboutLicenseDesc.replace('{license}', info?.license ?? unknown)}
        </p>
        <p className="mt-4 text-sm font-medium text-text-primary">{s.aboutThirdPartyTitle}</p>
        <p className="mt-1 text-sm text-text-secondary">{s.aboutThirdPartyDesc}</p>
        {noticesFellBack && (
          <p className="mt-1 text-xs text-text-secondary">{s.aboutThirdPartyMissing}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <ExternalLink
            url={LICENSE_URL}
            label={s.aboutLicenseText}
            hint={s.aboutOpensInNewTab}
          />
          <Button size="sm" variant="outline" onClick={openNotices}>
            {s.aboutThirdPartyOpen}
          </Button>
        </div>
      </Card>

      <Card title={s.aboutProjectLinksTitle}>
        <LinkRow links={PROJECT_LINKS} hint={s.aboutOpensInNewTab} label={(l) => s[l.labelKey]} />
      </Card>

      <Card title={s.aboutAuthorTitle}>
        <p className="mb-3 text-sm font-medium text-text-primary">{s.authorName}</p>
        <LinkRow links={AUTHOR_LINKS} hint={s.aboutOpensInNewTab} label={(l) => s[l.labelKey]} />
      </Card>
    </div>
  );
}
