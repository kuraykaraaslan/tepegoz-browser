import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrash } from '@fortawesome/free-solid-svg-icons';

/** Right-click menu on a shortcut tile — Edit / Remove. A transparent full-screen backdrop catches the
 *  next click (and right-click) to dismiss; Escape closes too. */
export function ShortcutMenu({
  x,
  y,
  canEdit,
  canRemove,
  labels,
  onEdit,
  onRemove,
  onClose,
}: Readonly<{
  x: number;
  y: number;
  canEdit: boolean;
  canRemove: boolean;
  labels: { edit: string; remove: string };
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
}>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        role="menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
        className="fixed min-w-40 overflow-hidden rounded-lg border border-border bg-surface-base py-1 text-sm text-text-primary shadow-lg"
      >
        {canEdit && (
          <button
            type="button"
            role="menuitem"
            onClick={onEdit}
            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-raised"
          >
            <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
            {labels.edit}
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            role="menuitem"
            onClick={onRemove}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-error hover:bg-surface-raised"
          >
            <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" aria-hidden />
            {labels.remove}
          </button>
        )}
      </div>
    </div>
  );
}
