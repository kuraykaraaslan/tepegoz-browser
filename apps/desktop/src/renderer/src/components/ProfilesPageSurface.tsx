import { I18nProvider } from '@tepegoz/i18n/react';
import { ProfilesPage } from '@tepegoz/profiles-ui';
import { useSurfaceLocale } from '../app-surface-locale';

/** Desktop host for `tepegoz://profiles` loaded as a real page (ADR-0045,
 *  docs/tracks/multi-profile-isolation.md) — mirrors `BookmarksPageSurface.tsx`'s pattern. `ProfilesPage`
 *  re-fetches the list itself after every mutation; there is no cross-process push (a rename made in
 *  another profile's window lands on the next refetch or reopen). */
export function ProfilesPageSurface() {
  const locale = useSurfaceLocale();

  return (
    <I18nProvider locale={locale}>
      {/* `fixed`, not `absolute`: this is a standalone document whose shell must BE the viewport
          (see BookmarksPageSurface.tsx for why). */}
      <div className="fixed inset-0 bg-surface-system">
        <ProfilesPage
          list={() => window.tepegoz.listProfiles()}
          getActive={() => window.tepegoz.getActiveProfile()}
          create={() => window.tepegoz.createProfile()}
          rename={(input) => window.tepegoz.renameProfile(input)}
          remove={(id) => window.tepegoz.deleteProfile(id)}
          switchTo={(id) => window.tepegoz.switchProfile(id)}
        />
      </div>
    </I18nProvider>
  );
}
