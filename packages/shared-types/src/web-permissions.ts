/**
 * The web capabilities this browser brokers PER SITE.
 *
 * Lives in `shared-types` rather than `desktop-ipc` because the consent prompt is a leaf UI package
 * that may not depend on the IPC layer — and a second copy of this union in that leaf is exactly the
 * drift that ends with a prompt saying "wants to show notifications" while asking for the camera.
 *
 * Everything NOT in this union is refused outright by the main process, and `security.test.ts` asserts
 * that by enumerating Electron's whole permission set, so adding a name here is the only way to make a
 * capability reachable at all.
 *
 * `display-capture` (screen sharing) is deliberately absent: it is the one request where a single
 * mistaken "allow" hands over everything else on the screen, including windows this browser does not
 * own, and nothing in this product needs it.
 */
export type WebPermissionCapability =
  'notifications' | 'clipboardRead' | 'clipboardWrite' | 'camera' | 'microphone' | 'geolocation';

/** Every brokered capability, for exhaustive UI rendering and for the security tests. `as const` so
 *  `z.enum` can be built straight from it (see `WebPermissionCapabilityEnum` in `enums.ts`); the
 *  `satisfies` keeps this list and the `WebPermissionCapability` union from drifting apart. */
export const WEB_PERMISSION_CAPABILITIES = [
  'camera',
  'microphone',
  'geolocation',
  'notifications',
  'clipboardRead',
  'clipboardWrite',
] as const satisfies readonly WebPermissionCapability[];
