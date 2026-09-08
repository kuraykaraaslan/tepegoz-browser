import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { Profile } from '@tepegoz/profiles';
import { profilesDict } from './i18n';

/** Fixed avatar palette (Chrome-style), indexed by `Profile.colorId` — polish (real Look-Packs theming)
 *  is a later PR; this just needs every profile to be visually distinguishable at a glance. */
const PROFILE_COLORS = [
  '#4f7cff',
  '#22b07d',
  '#ff8a3d',
  '#e85d75',
  '#8a63f2',
  '#14b8a6',
  '#f2b705',
  '#6b7280',
];

function colorFor(colorId: number): string {
  return PROFILE_COLORS[colorId % PROFILE_COLORS.length] ?? PROFILE_COLORS[0]!;
}

function initialFor(profile: Profile): string {
  return (profile.avatarInitial ?? profile.name.trim().charAt(0) ?? '?').toUpperCase();
}

export interface ProfilesPageProps {
  list: () => Promise<Profile[]>;
  getActive: () => Promise<Profile | null>;
  create: () => Promise<Profile>;
  rename: (input: { id: string; name: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  switchTo: (id: string) => Promise<void>;
}

export function ProfilesPage({ list, getActive, create, rename, remove, switchTo }: Readonly<ProfilesPageProps>) {
  const t = useT(profilesDict);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void Promise.all([list(), getActive()]).then(
      ([items, active]) => {
        setProfiles(items);
        setActiveId(active?.id ?? null);
      },
      () => {
        setProfiles([]);
        setActiveId(null);
      },
    );
  }, [list, getActive]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = useCallback(() => {
    void create()
      .then(refresh)
      .catch(() => setError(null));
  }, [create, refresh]);

  const handleDelete = useCallback(
    (id: string) => {
      setError(null);
      void remove(id)
        .then(refresh)
        .catch(() => setError(t.lastProfileError));
    },
    [remove, refresh, t.lastProfileError],
  );

  const handleRename = useCallback(
    (id: string, name: string) => {
      void rename({ id, name }).then(refresh).catch(() => undefined);
    },
    [rename, refresh],
  );

  const handleSwitch = useCallback(
    (id: string) => {
      void switchTo(id);
    },
    [switchTo],
  );

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <h1 className="text-base font-semibold">{t.title}</h1>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden />
            {t.addProfile}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              isActive={profile.id === activeId}
              onRename={(name) => handleRename(profile.id, name)}
              onDelete={() => handleDelete(profile.id)}
              onSwitch={() => handleSwitch(profile.id)}
            />
          ))}
        </div>
        {error !== null && <p className="mx-auto mt-4 max-w-3xl text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}

function ProfileCard({
  profile,
  isActive,
  onRename,
  onDelete,
  onSwitch,
}: {
  profile: Profile;
  isActive: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSwitch: () => void;
}) {
  const t = useT(profilesDict);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const commitRename = (): void => {
    const trimmed = draftName.trim();
    setEditing(false);
    if (trimmed.length > 0 && trimmed !== profile.name) onRename(trimmed);
    else setDraftName(profile.name);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
          style={{ backgroundColor: colorFor(profile.colorId) }}
          aria-hidden
        >
          {initialFor(profile)}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draftName}
              placeholder={t.namePlaceholder}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setDraftName(profile.name);
                  setEditing(false);
                }
              }}
              className="w-full rounded-md border border-border bg-surface-base px-2 py-1 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          ) : (
            <p className="truncate text-sm font-medium text-text-primary">{profile.name}</p>
          )}
          {isActive && <span className="text-xs text-text-secondary">{t.current}</span>}
        </div>
      </div>

      {confirmingDelete ? (
        <div className="rounded-md border border-danger/40 bg-danger/5 p-2.5">
          <p className="text-xs text-text-secondary">{t.deleteConfirmBody}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-overlay"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              {t.deleteConfirmButton}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {!isActive && (
            <button
              type="button"
              onClick={onSwitch}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-text-primary hover:bg-surface-overlay"
            >
              {t.switchTo}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
          >
            <FontAwesomeIcon icon={faPen} className="h-3 w-3" aria-hidden />
            {t.rename}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-overlay hover:text-danger"
          >
            <FontAwesomeIcon icon={faTrash} className="h-3 w-3" aria-hidden />
            {t.delete}
          </button>
        </div>
      )}
    </div>
  );
}
