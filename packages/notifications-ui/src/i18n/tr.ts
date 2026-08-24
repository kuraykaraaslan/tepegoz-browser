import type { NotificationsUiStrings } from './en';

/** Turkish translations — must match the `en` shape exactly (compile-time checked). */
export const tr: NotificationsUiStrings = {
  title: 'Bildirimler',
  empty: 'Henüz bildirim yok',
  markAllRead: 'Tümünü okundu işaretle',
  clearAll: 'Tümünü temizle',
  dismiss: 'Kapat',
  markRead: 'Okundu işaretle',
  unread: 'Okunmadı',
  permissionTitle: 'Bildirimlere izin verilsin mi?',
  permissionBody: 'bildirim göstermek istiyor.',
  permissionClipboardReadTitle: 'Pano okumasına izin verilsin mi?',
  permissionClipboardReadBody: 'panodaki metni okumak istiyor.',
  permissionClipboardWriteTitle: 'Panoya yazmaya izin verilsin mi?',
  permissionClipboardWriteBody: 'panoya metin yazmak istiyor.',
  permissionAllow: 'İzin ver',
  permissionBlock: 'Engelle',
  permissionRemember: 'Bu kararı hatırla',
  // Kamera / mikrofon / konum, İzin Merkezi ile birlikte aracılık edilen kümeye katıldı. Metin, API'nin
  // adını değil sitenin NE ELDE ETTİĞİNİ söylüyor: insan "kameranı kullanmak" hakkında karar veriyor,
  // "mediaDevices izni talep ediyor" hakkında değil.
  permissionCameraTitle: 'Kameranı kullansın mı?',
  permissionCameraBody: "kameranı kullanmak istiyor. Bunu sonradan Ayarlar'dan değiştirebilirsin.",
  permissionMicrophoneTitle: 'Mikrofonunu kullansın mı?',
  permissionMicrophoneBody:
    "mikrofonunu kullanmak istiyor. Bunu sonradan Ayarlar'dan değiştirebilirsin.",
  permissionGeolocationTitle: 'Konumunu bilsin mi?',
  permissionGeolocationBody:
    "nerede olduğunu bilmek istiyor. Bunu sonradan Ayarlar'dan değiştirebilirsin.",
};
