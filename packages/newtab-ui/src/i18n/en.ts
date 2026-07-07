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
  /** The shortcuts grid below the search box (the user's own list, independent of bookmarks). */
  favorites: {
    empty: 'No shortcuts yet. Add one to see it here.',
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
  /** The corner "Customize" button + its background/appearance panel. */
  customize: {
    button: 'Customize',
    title: 'Customize this page',
    close: 'Close',
    /** Background-type segmented control. */
    type: 'Background',
    default: 'Default',
    color: 'Color',
    image: 'Image',
    customColor: 'Custom color',
    /** SVG pattern picker (shown for a color background). */
    pattern: 'Pattern',
    patternNone: 'None',
    patterns: {
      dots: 'Dots',
      grid: 'Grid',
      diagonal: 'Diagonal',
      waves: 'Waves',
      hexagons: 'Hexagons',
      topography: 'Topography',
    },
    uploadImage: 'Upload image',
    changeImage: 'Change image',
    removeImage: 'Remove image',
    /** The image adjust popup (opened by clicking the image thumbnail): fit + alignment. */
    adjustImage: 'Adjust image',
    adjustHint: 'Click to adjust fit & position',
    dragHint: 'Drag to reposition',
    zoom: 'Zoom',
    done: 'Done',
    fit: 'Fit',
    fits: {
      cover: 'Cover',
      contain: 'Fit',
      fill: 'Fill',
      center: 'Center',
      tile: 'Tile',
    },
    position: 'Position',
    positions: {
      'top-left': 'Top left',
      top: 'Top',
      'top-right': 'Top right',
      left: 'Left',
      center: 'Center',
      right: 'Right',
      'bottom-left': 'Bottom left',
      bottom: 'Bottom',
      'bottom-right': 'Bottom right',
    },
    /** Opacity slider — fades the background toward the theme surface. */
    dimness: 'Dimness',
  },
};

export type NewTabStrings = typeof en;
