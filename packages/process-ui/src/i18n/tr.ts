import type { ProcessStrings } from './en';

export const tr: ProcessStrings = {
  title: 'Görev Yöneticisi',
  loading: 'Yükleniyor…',
  empty: 'İşlem yok',
  columns: {
    task: 'Görev',
    cpu: 'İşlemci',
    memory: 'Bellek',
    pid: 'İşlem kimliği',
  },
  kind: {
    browser: 'Tarayıcı',
    gpu: 'GPU işlemi',
    utility: 'Yardımcı',
    tab: 'Sekme',
  },
  noProcess: '—',
  discarded: 'Uyuyor',
  total: 'Toplam',
  endProcess: 'İşlemi sonlandır',
  endProcessConfirm: 'Bu sekmenin işlemi sonlandırılsın mı? Geri döndüğünüzde sayfa yeniden yüklenir.',
  refresh: 'Şimdi yenile',
};
