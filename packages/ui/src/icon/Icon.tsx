import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowsRotate,
  faBell,
  faBookmark,
  faCheck,
  faBookOpen,
  faChevronRight,
  faCircleQuestion,
  faCircleUser,
  faClockRotateLeft,
  faDownload,
  faEllipsisVertical,
  faKey,
  faLanguage,
  faLaptop,
  faLayerGroup,
  faMagnifyingGlass,
  faPenToSquare,
  faPrint,
  faPuzzlePiece,
  faQrcode,
  faScrewdriverWrench,
  faShareNodes,
  faTrashCan,
  faUser,
  faUserPlus,
  faUsers,
  faUserSecret,
  faWindowMaximize,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '../libs/utils/cn';

/**
 * Shared FontAwesome icon surface for APP/menu chrome that references icons by a semantic `name`
 * (e.g. the main-menu model). Presentational leaf packages (window-controls, nav-toolbar, tab-strip,
 * omnibox, …) import FontAwesome directly instead — this wrapper exists for the name-keyed menu model
 * where a data structure carries `icon: IconName`. Add a `name → fa*` entry as menu items need it.
 * Decorative by default (aria-hidden); pass `label` for an accessible name. Brand logo → `BrandMark`.
 */
const ICONS = {
  newWindow: faWindowMaximize,
  incognito: faUserSecret,
  trash: faTrashCan,
  key: faKey,
  download: faDownload,
  bell: faBell,
  bookmark: faBookmark,
  check: faCheck,
  layers: faLayerGroup,
  history: faClockRotateLeft,
  puzzle: faPuzzlePiece,
  print: faPrint,
  search: faMagnifyingGlass,
  translate: faLanguage,
  edit: faPenToSquare,
  share: faShareNodes,
  qrcode: faQrcode,
  devices: faLaptop,
  book: faBookOpen,
  tools: faScrewdriverWrench,
  help: faCircleQuestion,
  chevronRight: faChevronRight,
  ellipsisVertical: faEllipsisVertical,
  // User (profile) menu
  user: faUser,
  userCircle: faCircleUser,
  userPlus: faUserPlus,
  users: faUsers,
  sync: faArrowsRotate,
  close: faXmark,
} satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  className?: string;
  /** Accessible name — when omitted the icon is decorative (aria-hidden). */
  label?: string;
  /** Native tooltip text (also aids accessibility). */
  title?: string;
}

export function Icon({ name, className, label, title }: IconProps) {
  return (
    <FontAwesomeIcon
      icon={ICONS[name]}
      className={cn('h-4 w-4', className)}
      {...(label !== undefined ? { 'aria-label': label, role: 'img' } : { 'aria-hidden': true })}
      {...(title !== undefined ? { title } : {})}
    />
  );
}
