import type { ReaderStrings } from './en';

export const tr: ReaderStrings = {
  toggle: 'Okuma görünümü',
  exit: 'Okuma görünümünden çık',
  readingTime: '{minutes} dk okuma',
  /**
   * Çıkarma bir makale bulamadığında gösterilir. Sebep olarak ÖZELLİĞİ değil SAYFAYI adlandırıyor:
   * "bu sayfada okunacak bir makale yok" kullanıcının üzerine hareket edebileceği bir olgudur;
   * "okuyucu başarısız oldu" bir hata gibi okunur ve onu hata aramaya gönderir.
   */
  noArticleTitle: 'Burada okunacak bir şey yok',
  noArticleBody:
    'Bu sayfa bir makaleye benzemiyor — okuma görünümü çoğunlukla metinden oluşan sayfalarda çalışır.',
  working: 'Sayfa okunuyor…',
};
