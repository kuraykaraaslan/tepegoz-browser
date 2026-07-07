import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { AppInfo } from '@tepegoz/desktop-ipc';
import type { RendererBuildKind } from '../lib/developer-env';

export interface DeveloperSectionProps {
  nodeEnv: string;
  viteMode: string;
  rendererBuild: RendererBuildKind;
}

export function DeveloperSection({ nodeEnv, viteMode, rendererBuild }: DeveloperSectionProps) {
  const s = useT(settingsDict);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.tepegoz.getAppInfo().then(setInfo, () => {
      /* leave null */
    });
  }, []);

  const rows = [
    { label: s.developerNodeEnv, value: nodeEnv },
    { label: s.developerViteMode, value: viteMode },
    { label: s.developerRendererBuild, value: rendererBuild },
    { label: s.developerAppVersion, value: info?.version ?? '...' },
    { label: s.developerPlatform, value: info?.platform ?? '...' },
  ];

  return (
    <Card title={s.developerTitle}>
      <p className="mb-4 text-sm text-text-secondary">{s.developerDesc}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-text-secondary">{row.label}</dt>
            <dd className="font-mono text-text-primary">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
