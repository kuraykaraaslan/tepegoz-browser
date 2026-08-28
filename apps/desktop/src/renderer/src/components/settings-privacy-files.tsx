import { useEffect } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { LoginCredentialMeta, LoginImportResult } from '@tepegoz/desktop-ipc';
import { CredentialsSettings, ImportExportPanel } from '@tepegoz/password-ui';

/**
 * Passwords, plus the re-exports that keep this module's public surface stable while the sections it
 * used to hold move to files named after them: About → `settings-about.tsx`, downloads →
 * `settings-downloads.tsx`, search/startup and file operations to their own siblings.
 *
 * `SitePermissionsSection` also lived here. It was deleted rather than moved: `PermissionsCenter` had
 * replaced it, and it had been exported-but-never-rendered ever since — dead code that still had to be
 * read, typechecked and kept compiling.
 */
export { SearchStartupSection } from './settings-privacy-files-search';
export { FileOperationsSection } from './settings-privacy-files-file-ops';

export function PasswordsSection({
  credentials,
  onMount,
  onAdd,
  onRemove,
  onImport,
  onExport,
}: {
  credentials: LoginCredentialMeta[];
  onMount: () => Promise<void>;
  onAdd: (c: {
    url: string;
    username: string;
    password: string;
    title?: string;
    notes?: string;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onImport: (data: string, format: string) => Promise<LoginImportResult>;
  onExport: (format: string) => Promise<string>;
}) {
  const s = useT(settingsDict);
  useEffect(() => {
    void onMount();
  }, []);

  return (
    <Card title={s.passwordsTitle}>
      <div className="space-y-4">
        <CredentialsSettings credentials={credentials} onAdd={onAdd} onRemove={onRemove} />
        <ImportExportPanel onImport={onImport} onExport={onExport} />
      </div>
    </Card>
  );
}
