import type { PopupBlockerStrings } from './en';

/** Turkish — must match the shape of `en` exactly (enforced by the shared type). */
export const tr: PopupBlockerStrings = {
  title: 'Popup Engelleyici',
  description:
    'Pop-up’ları varsayılan olarak engeller. Tek tek pop-up’lara bildirimden izin verin ya da tüm siteye güvenin.',
  enabled: 'Etkin',
  enabledHint: 'Her sitede pop-up’ları engelle',
  showNotifications: 'Bir pop-up engellendiğinde beni bilgilendir',
  trustedSites: 'Güvenilen siteler',
  trustedEmpty: 'Henüz güvenilen site yok.',
  trustedHint: 'Bu sitelerden gelen pop-up’lara her zaman izin verilir.',
  remove: 'Kaldır',
  recentRequests: "Son engellenen pop-up'lar",
  recentRequestsEmpty: 'Bu oturumda hiç pop-up engellenmedi.',
  open: 'Aç',
  blockedTitle: 'Pop-up engellendi',
  allow: 'İzin ver',
  background: 'Arka planda',
  redirect: 'Yönlendir',
  trust: 'Siteye güven',
};
