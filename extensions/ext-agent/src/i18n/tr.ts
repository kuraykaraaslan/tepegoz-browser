import type { AgentStrings } from './en';

/** Turkish — first-class; must match the English (source) shape exactly. */
export const tr: AgentStrings = {
  title: 'Ajan Konsolu',
  progress: 'İlerleme',
  tokens: 'Token',
  noActiveTasks: 'Aktif görev yok',
  awaitingApproval: 'Onayınız bekleniyor',
  open: 'Ajan',
  runPlaceholder: 'Tepegöz bu sayfada ne yapsın…',
  run: 'Çalıştır',
  running: 'Çalışıyor…',
  runFailed: 'Ajan başlatılamadı.',
  approvalTitle: 'Onay gerekli',
  approvalBody: 'Ajan, durumu değiştiren bir araç çalıştırmak istiyor. İzin veriyor musunuz?',
  biometricNote: 'Bu yüksek riskli bir işlem (Windows Hello ileri bir sürümde gerekli olacak).',
  approve: 'Onayla',
  deny: 'Reddet',
  aiDisclaimer: 'AI üretti, hatalı olabilir.',
  planTitle: 'Planı gözden geçirin',
  planBody:
    'İstemediğiniz adımların işaretini kaldırıp çalıştırın. Onaylayana kadar hiçbir şey yürütülmez.',
  planRun: 'Planı çalıştır',
  // İnsana Devir Denetleyicisi — CAPTCHA / 2FA algılandığında ajan kontrolü geri verir.
  handoff: {
    notifyTitle: 'Sıra sizde — Tepegöz duraklattı',
    captcha:
      'Bir CAPTCHA algılandı. Tepegöz durdu ve kontrolü size geri verdi — otomatik olarak çözmeyecek. Kendiniz tamamlayın, sonra yeni bir görev başlatın.',
    twofa:
      'Bir doğrulama adımı (2FA / tek kullanımlık kod) algılandı. Tepegöz durdu ve kontrolü size geri verdi — girişi kendiniz tamamlayın, sonra yeni bir görev başlatın.',
  },
  // Token Defteri kotası — %80 uyarısı (kümülatif kullanım eşiği aştığında bir kez gösterilir).
  quota: {
    warnTitle: 'Token kotanıza yaklaşıyorsunuz',
    warnBody: "Bu hesap token kotasının %80'inden fazlasını kullandı. Ayarlar → Ajan'dan düzenleyin.",
  },
  // Agentic komut paleti (Sohbet/Yap/Üret/Görevler) — bu yüzeyin sahibi bu eklenti.
  commandPalette: {
    placeholder: "Bir komut yazın ya da Tepegöz'e sorun…",
    modeChat: 'Sohbet',
    modeDo: 'Yap',
    modeMake: 'Üret',
    modeTasks: 'Görevler',
  },
  // Zaman çizelgesi tekrarı — bir çalışmanın olay akışını adım adım gözden geçirin (canlı = en yeniyi izler).
  replay: {
    timeline: 'Tekrar zaman çizelgesi',
    stepLabel: 'Adım',
    live: 'Canlı',
  },
  // Besteci / çerçeve.
  newTask: 'Yeni görev',
  history: {
    label: 'Konuşma geçmişi',
    search: 'Konuşmalarda ara...',
    empty: 'Henüz konuşma yok',
    loading: 'Yükleniyor...',
    full: 'Tüm konuşma geçmişi',
  },
  historyPage: {
    title: 'Ajan geçmişi',
    search: 'Konuşmalarda ara',
    empty: 'Henüz konuşma yok',
    loading: 'Yükleniyor...',
    clear: 'Tümünü temizle',
    delete: 'Kaldır',
    openInPanel: 'Panelde aç',
    turns: 'tur',
    detailEmpty: 'Önizlemek için bir konuşma seçin.',
  },
  send: 'Gönder',
  stop: 'Durdur',
  modelLabel: 'Model',
  // Otonomi 'ask' değilken gösterilen amber risk bandı (seviyeye duyarlı).
  risk: {
    actTitle: 'Sormadan uyguluyor',
    actBody: 'Rutin adımları kendi çalıştırır, ama yıkıcı veya finansal işlemler için yine durur.',
    autoTitle: 'Tam otonom',
    autoBody: 'Bu sayfada ve internette durmadan işlem yapar — zaman çizelgesini gözden geçir.',
  },
  // Kademeli otonomi seviyeleri (besteci açılır menüsü).
  autonomy: {
    ask: { title: 'Uygulamadan önce sor', desc: 'Planı ve durum değiştiren her adımı gözden geçirir.' },
    act: {
      title: 'Sormadan uygula',
      desc: 'Rutin adımları çalıştırır; yıkıcı veya finansal işlemler için yine sorar.',
    },
    auto: { title: 'Otomatik', desc: 'Tam otonom — durmadan işlem yapar.' },
    dangerous: { title: 'Tehlikeli', desc: 'Yakında — güvenlik kilitleri olmayan kısıtsız mod.' },
  },
  // Akıl yürütme çabası ön ayarları (besteci çaba açılır menüsü). Yüksek çaba → daha derin akıl + daha çok token.
  effort: {
    title: 'Çaba',
    low: { title: 'Düşük', desc: 'En hızlı ve en ucuz — kısa akıl yürütme.' },
    medium: { title: 'Orta', desc: 'Dengeli akıl yürütme ve maliyet.' },
    high: { title: 'Yüksek', desc: 'Daha derin akıl yürütme (varsayılan).' },
    xhigh: { title: 'Çok yüksek', desc: 'Genişletilmiş akıl yürütme, daha uzun yanıtlar.' },
    max: { title: 'Azami', desc: 'Azami akıl yürütme ve token bütçesi.' },
  },
  // Katlanabilir akıl yürütme bölümü (ajanın plan hedefi + adım gerekçeleri).
  reasoning: {
    title: 'Akıl yürütme',
    show: 'Göster',
    hide: 'Gizle',
  },
  // Markdown kod bloklarındaki kopyala düğmesi.
  copy: 'Kopyala',
  // Sohbet akışı — her tur, kullanıcının mesajı ve ardından ajanın yanıtı.
  thread: {
    you: 'Sen',
    working: 'Çalışıyor…',
  },
  // Besteci ek chip'leri (seçili metin / dosya / ekran görüntüsü).
  attach: {
    selection: 'Seçili metin',
    file: 'Dosya',
    screenshot: 'Ekran görüntüsü',
    removeLabel: 'Eki kaldır',
    selectionEmpty: 'Sayfada seçili metin yok.',
    addSelection: 'Seçili metni ekle',
    addFile: 'Dosya ekle',
    addScreenshot: 'Ekran görüntüsü ekle',
    lines: 'satır',
  },
  // "Göreve çevir" — bu sohbeti tekrarlı bir göreve dönüştür (bkz. Zamanlanmış Görevler eklentisi).
  scheduleTask: {
    action: 'Göreve çevir',
    title: 'Zamanlanmış göreve çevir',
    desc: 'Bu sohbeti zamanlanmış olarak ya da sayfa değişince otomatik çalıştır.',
    name: 'Ad',
    instruction: 'Talimat',
    instructionHint: 'Bu görev her çalıştığında ajanın ne yapacağı.',
    targetUrl: 'Hedef sayfa (URL)',
    schedule: 'Zamanlama',
    presetContinuous: 'Sürekli (5 dakikada bir)',
    presetInterval: 'Aralıklı',
    presetPageChange: 'Sayfa değişince',
    everyMinutes: 'Her (dakika)',
    minInterval: 'En az 5 dakika.',
    autonomy: 'Aksiyon gerektiğinde',
    autonomyNotify: 'Bana bildir',
    autonomySameOrigin: 'Bu sitede aksiyon al',
    save: 'Görevi kaydet',
    cancel: 'Vazgeç',
    nameRequired: 'Göreve bir ad verin.',
    instructionRequired: 'Görev için bir talimat ekleyin.',
    saveFailed: 'Görev kaydedilemedi.',
    saved: '✓ Görev kaydedildi',
    openManager: 'Görevleri aç',
  },
};
