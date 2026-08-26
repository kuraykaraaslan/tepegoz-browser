import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Button, Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';

/**
 * Default-browser registration (Phase 2b, narrow scope). Deliberately a BUTTON, never an auto-applied
 * toggle: registering unprompted would rewrite the user's OS default the moment this page renders, and
 * a browser that did that on its own would be doing exactly what this settings row exists to let the
 * user decide instead.
 *
 * The status is re-fetched after every attempt rather than assumed from the click — on Windows 10+ this
 * call only OFFERS the change, the OS's own picker decides, so "the button was pressed" and "Tepegöz IS
 * the default" are different facts and only the second one is what the row reports.
 */
export function DefaultBrowserSection() {
  const s = useT(settingsDict).defaultBrowser;
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void window.tepegoz.getDefaultBrowserStatus().then(
      (status) => {
        setIsDefault(status.isDefault);
      },
      () => {
        setIsDefault(false);
      },
    );
  }, []);

  const handleMakeDefault = (): void => {
    setWorking(true);
    setFailed(false);
    void window.tepegoz.setAsDefaultBrowser().then(
      (status) => {
        setIsDefault(status.isDefault);
        setFailed(!status.isDefault);
        setWorking(false);
      },
      () => {
        setFailed(true);
        setWorking(false);
      },
    );
  };

  return (
    <Card title={s.title}>
      <div className="space-y-3">
        {isDefault === null ? (
          <p className="text-sm text-text-secondary">{s.checking}</p>
        ) : (
          <div className="flex items-start gap-2">
            <Badge variant={isDefault ? 'success' : 'neutral'} size="sm" dot>
              {isDefault ? s.isDefault : s.notDefault}
            </Badge>
          </div>
        )}
        {isDefault !== null && (
          <p className="text-sm text-text-secondary">{isDefault ? s.isDefaultDesc : s.notDefaultDesc}</p>
        )}
        {isDefault === false && (
          <Button variant="secondary" size="sm" loading={working} onClick={handleMakeDefault}>
            {s.makeDefault}
          </Button>
        )}
        {failed && <p className="text-xs text-error">{s.failed}</p>}
      </div>
    </Card>
  );
}
