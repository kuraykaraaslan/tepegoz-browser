import type { TranslateStrings } from './en';

export const tr: TranslateStrings = {
  title: 'Çeviri',
  description: 'Tam sayfalar ve seçili metinler için cihaz öncelikli çeviri.',
  enabled: 'Çeviriyi etkinleştir',
  enabledHint: 'Yabancı dildeki sayfaları mümkün olduğunda otomatik çevir.',
  currentSite: 'Geçerli site',
  noSite: 'Web sitesi yok',
  pauseSite: 'Burada duraklat',
  resumeSite: 'Burada etkinleştir',
  page: 'Sayfa',
  status: 'Durum',
  targetLanguage: 'Hedef dil',
  engine: 'Motor',
  localFirst: 'Yerel öncelikli',
  cloudFallback: 'Bulut fallback',
  ask: 'Sor',
  allow: 'İzin ver',
  deny: 'Reddet',
  autoTranslate: 'Yabancı sayfaları otomatik çevir',
  translatePage: 'Sayfayı çevir',
  restoreOriginal: 'Orijinali geri yükle',
  quickTranslate: 'Hızlı çeviri',
  sourcePlaceholder: 'Çevrilecek metni yapıştır...',
  translate: 'Çevir',
  result: 'Sonuç',
  glossary: 'Sözlük',
  glossaryHint: 'Tercih edilen terimler eşleşen dil çiftlerinde uygulanır.',
  sourceTerm: 'Kaynak',
  targetTerm: 'Hedef',
  addTerm: 'Ekle',
  remove: 'Kaldır',
  glossaryEmpty: 'Henüz sözlük terimi yok.',
  disabledSites: 'Duraklatılan siteler',
  disabledSitesEmpty: 'Duraklatılan site yok.',
  cloudPromptTitle: 'Bulut çevirisi isteniyor',
  cloudPromptText: 'Çevirinin devam etmesi için bu sayfada bulut fallback gerekiyor.',
  allowCloud: 'Buluta izin ver',
  denyCloud: 'Reddet',
  rememberChoice: 'Seçimi hatırla',
  items: 'öğe',
  characters: 'karakter',

  /**
   * Masaüstü ana sürecinin bu eklenti için çizdiği YEREL yüzeyler: sayfa bağlam menüsü alt menüsü ve
   * bulut yedeği İZİN penceresi. Yukarıdaki panel `cloudPrompt*` anahtarlarından ayrıdır: yerel
   * pencere, sayfa içi istemin sunmadığı üçüncü bir seçenek ("şimdi değil") sunar ve düğmeleri panel
   * denetimleri değil işletim sistemi düğmeleridir.
   *
   * İzin penceresi, İngilizceye asla düşmemesi gereken metindir: kullanıcının sayfa metnini bir bulut
   * uç noktasına verdiği yer burasıdır ve okumadığınız bir dilde verilen izin, izin değildir.
   */
  native: {
    menuTitle: 'Çeviri',
    translatePage: 'Sayfayı çevir',
    translateSelection: 'Seçimi çevir',
    restoreOriginal: 'Orijinali geri yükle',
    resultTitle: 'Çeviri sonucu',
    cloudTitle: 'Bulut çevirisi isteniyor',
    cloudMessage: 'Sayfa çevirisi için bulut yedeği gerekiyor.',
    /** `{target}` bir dil adı, `{count}` yerel biçime çevrilmiş bir sayıdır. */
    cloudDetailTarget: 'Hedef: {target}',
    cloudDetailText: 'Metin: {count} karakter',
    cloudAllowRemember: 'İzin ver ve hatırla',
    cloudDenyRemember: 'Reddet ve hatırla',
    cloudNotNow: 'Şimdi değil',
  },
};
