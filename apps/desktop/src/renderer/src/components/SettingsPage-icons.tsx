import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faCircleInfo,
  faCode,
  faCreditCard,
  faDesktop,
  faDownload,
  faFolderTree,
  faGauge,
  faGear,
  faGlobe,
  faKey,
  faLock,
  faMagnifyingGlass,
  faPalette,
  faPlug,
  faRotateLeft,
  faShield,
  faSliders,
  faUniversalAccess,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Sidebar section icons for `SettingsPage.tsx`. Split out (ADR-0010 250-line cap) — pure presentation,
 * no behavior. Each is a tiny wrapper so the section table reads as `<IconX />`.
 */

const ICON = 'h-4 w-4';

export const IconKey = () => <FontAwesomeIcon icon={faKey} className={ICON} aria-hidden />;
export const IconPalette = () => <FontAwesomeIcon icon={faPalette} className={ICON} aria-hidden />;
export const IconGlobe = () => <FontAwesomeIcon icon={faGlobe} className={ICON} aria-hidden />;
export const IconShield = () => <FontAwesomeIcon icon={faShield} className={ICON} aria-hidden />;
export const IconGauge = () => <FontAwesomeIcon icon={faGauge} className={ICON} aria-hidden />;
export const IconBell = () => <FontAwesomeIcon icon={faBell} className={ICON} aria-hidden />;
export const IconPlug = () => <FontAwesomeIcon icon={faPlug} className={ICON} aria-hidden />;
export const IconLock = () => <FontAwesomeIcon icon={faLock} className={ICON} aria-hidden />;
export const IconSearch = () => (
  <FontAwesomeIcon icon={faMagnifyingGlass} className={ICON} aria-hidden />
);
export const IconFiles = () => <FontAwesomeIcon icon={faFolderTree} className={ICON} aria-hidden />;
export const IconDownload = () => (
  <FontAwesomeIcon icon={faDownload} className={ICON} aria-hidden />
);
export const IconA11y = () => (
  <FontAwesomeIcon icon={faUniversalAccess} className={ICON} aria-hidden />
);
export const IconSliders = () => <FontAwesomeIcon icon={faSliders} className={ICON} aria-hidden />;
export const IconCard = () => <FontAwesomeIcon icon={faCreditCard} className={ICON} aria-hidden />;
export const IconDesktop = () => <FontAwesomeIcon icon={faDesktop} className={ICON} aria-hidden />;
export const IconReset = () => <FontAwesomeIcon icon={faRotateLeft} className={ICON} aria-hidden />;
export const IconInfo = () => <FontAwesomeIcon icon={faCircleInfo} className={ICON} aria-hidden />;
export const IconDeveloper = () => <FontAwesomeIcon icon={faCode} className={ICON} aria-hidden />;
export const IconGear = () => <FontAwesomeIcon icon={faGear} className="h-5 w-5" aria-hidden />;
