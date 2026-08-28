import { useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, Input, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { useCommitOnPause } from '../lib/use-commit-on-pause';
import { ConfirmAction } from './settings-confirm';

/**
 * Downloads — where files land, and how the list of finished ones is emptied.
 *
 * Three things were wrong with the old version and all three were about the folder path being treated
 * as a string rather than as a place: it could only be typed (a browser that ships a native directory
 * picker and makes you type an absolute path is asking for a typo), there was no way to open it, and
 * "clear history" ran one IPC per record with no confirmation, no count, and an unhandled rejection if
 * the list call itself failed.
 */
export function DownloadSettingsSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const [cleared, setCleared] = useState<number | null>(null);
  const [folderError, setFolderError] = useState(false);

  const dir = useCommitOnPause(prefs.downloadDirectory, (value) => {
    setPref({ downloadDirectory: value.trim() });
  });

  function browse(): void {
    void window.tepegoz.pickDownloadDirectory().then(
      (result) => {
        if (result.cancelled || result.path === '') return;
        dir.set(result.path);
        dir.flush();
      },
      () => undefined,
    );
  }

  function openFolder(): void {
    setFolderError(false);
    void window.tepegoz.openDownloadFolder().then(
      (opened) => {
        setFolderError(!opened);
      },
      () => {
        setFolderError(true);
      },
    );
  }

  function clearFinished(): void {
    setCleared(null);
    void window.tepegoz.clearFinishedDownloads().then(
      (count) => {
        setCleared(count);
      },
      () => {
        // A failed clear is REPORTED as zero removed rather than silently leaving the old count on
        // screen, which would read as success.
        setCleared(0);
      },
    );
  }

  return (
    <Card title={s.downloadsTitle} subtitle={s.downloadsSubtitle}>
      <div className="space-y-5">
        <div>
          <Input
            id="download-directory"
            label={s.downloadLocationLabel}
            hint={s.downloadLocationDesc}
            placeholder={s.downloadLocationPlaceholder}
            value={dir.draft}
            onChange={(e) => {
              dir.set(e.target.value);
            }}
            onBlur={dir.flush}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={browse}>
              {s.downloadLocationBrowse}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={prefs.downloadDirectory === ''}
              onClick={openFolder}
            >
              {s.downloadLocationOpen}
            </Button>
          </div>
          {folderError && (
            <p className="mt-1 text-xs text-error">{s.downloadLocationOpenFailed}</p>
          )}
        </div>

        <Toggle
          id="download-ask-each-time"
          label={s.downloadAskEachTime}
          description={s.downloadAskEachTimeDesc}
          checked={prefs.downloadAskEachTime}
          onChange={(v) => {
            setPref({ downloadAskEachTime: v });
          }}
        />

        <div>
          <p className="text-sm font-medium text-text-primary">{s.clearDownloadsLabel}</p>
          <p className="mb-2 text-xs text-text-secondary">{s.clearDownloadsDesc}</p>
          <ConfirmAction
            label={s.clearDownloadsButton}
            title={s.clearDownloadsLabel}
            body={s.clearDownloadsConfirm}
            confirmLabel={s.clearDownloadsButton}
            onConfirm={clearFinished}
          />
          {cleared !== null && (
            <p className="mt-2 text-xs text-text-secondary">
              {s.clearDownloadsResult.replace('{count}', String(cleared))}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
