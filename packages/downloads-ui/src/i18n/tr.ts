import type { DownloadsStrings } from './en';

export const tr: DownloadsStrings = {
  title: 'İndirilenler',
  empty: 'Henüz indirme yok',
  loading: 'Yükleniyor...',
  progressUnknown: 'İlerleme bilinmiyor',
  perSecond: '/sn',
  etaLeft: 'kaldı',
  bytes: {
    b: 'B',
    kb: 'KB',
    mb: 'MB',
    gb: 'GB',
  },
  status: {
    requested: 'İstendi',
    in_progress: 'İndiriliyor',
    paused: 'Duraklatıldı',
    quarantined: 'Karantinada',
    completed: 'Tamamlandı',
    blocked: 'Engellendi',
    canceled: 'İptal edildi',
    failed: 'Başarısız',
  },
  trust: {
    safe: 'Güvenli',
    unknown: 'Kontrol edilmedi',
    blocked: 'Engellendi',
  },
  risk: {
    normal: 'Normal',
    archive: 'Arşiv',
    script: 'Betik',
    executable: 'Çalıştırılabilir',
  },
  action: {
    pause: 'Duraklat',
    resume: 'Sürdür',
    cancel: 'İptal et',
    release: 'Serbest bırak',
    open: 'Aç',
    reveal: 'Klasörde göster',
    clear: 'Temizle',
    retry: 'Yeniden dene',
  },
  riskyRelease: 'Bu dosya karantinadan çıkmadan önce onayınızı gerektirir.',
};
