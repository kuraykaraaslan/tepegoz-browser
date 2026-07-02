import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faCircleInfo,
  faCircleXmark,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import type { NotificationKind } from '@tepegoz/shared-types/notifications';

/**
 * Kind → icon + container classes, shared by the center rows and toasts. Mirrors the `AlertBanner`
 * variant map ([@tepegoz/ui]) so notifications look identical to the app's inline alerts.
 */
export const KIND_VISUALS: Record<NotificationKind, { container: string; icon: ReactNode }> = {
  success: {
    container: 'bg-success-subtle border-success text-success-fg',
    icon: <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" />,
  },
  warning: {
    container: 'bg-warning-subtle border-warning text-warning-fg',
    icon: <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />,
  },
  error: {
    container: 'bg-error-subtle border-error text-error-fg',
    icon: <FontAwesomeIcon icon={faCircleXmark} className="h-4 w-4" />,
  },
  info: {
    container: 'bg-info-subtle border-info text-info-fg',
    icon: <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />,
  },
};
