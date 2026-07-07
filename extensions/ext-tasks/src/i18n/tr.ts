import type { TasksStrings } from './en';

export const tr: TasksStrings = {
  title: 'Zamanlanmış görevler',
  subtitle: 'Zamanlanmış ya da sayfa değiştiğinde çalışan ajan sohbetleri.',
  newTask: 'Yeni görev',
  newFromConversation: 'Sohbetten',
  empty: 'Henüz kayıtlı görev yok',
  emptyHint: 'Bir ajan sohbetini göreve çevirin ya da sıfırdan oluşturun.',
  loading: 'Yükleniyor…',
  searchPlaceholder: 'Görev ara',
  noResults: 'Eşleşen görev yok',
  none: '—',
  sourceChat: 'Sohbetten',

  columns: {
    name: 'Görev',
    schedule: 'Zamanlama',
    status: 'Durum',
    lastRun: 'Son çalışma',
    nextRun: 'Sonraki',
    actions: 'İşlemler',
  },

  actions: {
    runNow: 'Şimdi çalıştır',
    enable: 'Etkinleştir',
    disable: 'Devre dışı',
    edit: 'Düzenle',
    delete: 'Sil',
    viewChat: 'Sohbeti gör',
    cancel: 'Vazgeç',
    save: 'Kaydet',
    close: 'Kapat',
  },

  status: {
    enabled: 'Etkin',
    disabled: 'Devre dışı',
    archived: 'Arşivli',
  },
  runStatus: {
    queued: 'Kuyrukta',
    running: 'Çalışıyor',
    awaiting_approval: 'Onay bekliyor',
    succeeded: 'Başarılı',
    failed: 'Başarısız',
    canceled: 'İptal edildi',
  },

  scheduleSummary: {
    everyMinutes: '{n} dakikada bir',
    pageChange: 'Sayfa değişince',
    manual: 'Yalnızca elle',
  },

  modal: {
    createTitle: 'Yeni zamanlanmış görev',
    editTitle: 'Görevi düzenle',
    name: 'Ad',
    prompt: 'Talimat',
    promptHint: 'Bu görev her çalıştığında ajanın ne yapacağı.',
    targetUrl: 'Hedef sayfa (URL)',
    targetUrlHint: 'Görevin açıp üzerinde çalışacağı sayfa.',
    nameRequired: 'Göreve bir ad verin.',
    promptRequired: 'Görev için bir talimat ekleyin.',
    invalidUrl: 'https:// dahil geçerli bir URL girin.',
    saveFailed: 'Görev kaydedilemedi.',
    updated: 'Görev kaydedildi.',
  },

  schedule: {
    label: 'Zamanlama',
    continuous: 'Sürekli',
    continuousHint: 'Mümkün olan en sık — 5 dakikada bir.',
    interval: 'Aralıklı',
    intervalHint: 'Birkaç dakikada bir çalıştır.',
    pageChange: 'Sayfa değişince',
    pageChangeHint: 'Sayfayı izle ve içeriği değişince çalıştır.',
    everyMinutes: 'Her (dakika)',
    minInterval: 'En az 5 dakika.',
    selector: 'CSS seçici (isteğe bağlı)',
    selectorHint: 'Tüm sayfa yerine tek bir öğeyi izle.',
    changeMode: 'Karşılaştır',
    changeModeTextHash: 'Tüm sayfa metni',
    changeModeElementText: 'Seçili öğe metni',
  },

  autonomy: {
    label: 'Aksiyon gerektiğinde',
    notify: 'Bana bildir',
    notifyHint: 'Sayfayı değiştiren her aksiyondan önce durup bildir.',
    sameOrigin: 'Bu sitede aksiyon al',
    sameOriginHint: 'Hedef sitede sormadan tıklayıp yazsın. Bir hedef URL gerekir.',
  },

  runs: {
    title: 'Son çalışmalar',
    empty: 'Henüz çalışma yok',
    allTasks: 'Tüm görevler',
    clearFilter: 'Tümünü göster',
  },
  artifacts: {
    title: 'Sonuçlar',
    empty: 'Henüz sonuç yok',
  },

  picker: {
    title: 'Bir sohbet seç',
    search: 'Sohbet ara',
    empty: 'Sohbet bulunamadı',
    turns: 'tur',
    loading: 'Yükleniyor…',
  },

  deleteConfirm: 'Bu görev silinsin mi? Bu işlem geri alınamaz.',
};
