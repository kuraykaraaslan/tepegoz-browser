export const en = {
  /** Tab title / aria label for the start page. */
  title: 'New tab',
  /** Brand wordmark + logo alt text. */
  logoAlt: 'Tepegöz',
  /** The big centred search box (a "fakebox" — submitting navigates the tab). */
  searchPlaceholder: 'Search the web or type a URL',
  search: 'Search',
  /** The Chrome-style AI entry point in the corner (opens the Agent Console). */
  aiButton: 'AI',
  aiHint: 'Ask the agent',
  /** The shortcuts (favorites) grid below the search box. */
  favorites: {
    empty: 'No favorites yet. Star a page or add a shortcut to see it here.',
    /** The "+" tile that opens the add-shortcut dialog. */
    add: 'Add shortcut',
    /** Right-click menu on a shortcut tile. */
    edit: 'Edit',
    remove: 'Remove',
    /** Add/Edit dialog. */
    editTitle: 'Edit shortcut',
    addTitle: 'Add shortcut',
    nameLabel: 'Name',
    urlLabel: 'URL',
    save: 'Done',
    cancel: 'Cancel',
  },
};

export type NewTabStrings = typeof en;
