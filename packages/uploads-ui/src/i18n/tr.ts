import type { UploadsStrings } from './en';

export const tr: UploadsStrings = {
  title: 'Yüklemeler',
  empty: 'Henüz yükleme yok',
  loading: 'Yükleniyor...',
  files: 'Dosyalar',
  bytes: {
    b: 'B',
    kb: 'KB',
    mb: 'MB',
    gb: 'GB',
  },
  status: {
    staged: 'Hazırlandı',
    bound: 'Hazır',
    submitting: 'Yükleniyor',
    completed: 'Tamamlandı',
    failed: 'Başarısız',
    canceled: 'İptal edildi',
    cleared: 'Temizlendi',
  },
  risk: {
    normal: 'Normal',
    archive: 'Arşiv',
    script: 'Betik',
    executable: 'Çalıştırılabilir',
    large: 'Büyük',
  },
  actor: {
    user: 'Kullanıcı',
    agent: 'Ajan',
    site: 'Site',
  },
  action: {
    cancel: 'İptal et',
    clear: 'Temizle',
  },
  redacted: 'Yerel dosya yolları gizlenir.',
};
