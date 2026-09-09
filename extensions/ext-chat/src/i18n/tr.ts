import type { ChatStrings } from './en';

export const tr: ChatStrings = {
  name: 'Sohbet',
  title: 'Sohbet',
  sidebarTitle: 'Sohbet',
  comingSoonTitle: 'Mesajlaşma yapım aşamasında',
  comingSoonBody:
    'XMPP, IRC ve Matrix protokol motoru hazır. Hesap kurulumu, kişi listesi ve konuşma görünümü sırada.',
  protocols: {
    heading: 'Protokoller',
    xmpp: 'XMPP — yerel (SASL SCRAM, STARTTLS, stream management, MAM geçmişi)',
    irc: 'IRC — yerel (RFC 2812 + IRCv3), şifrelenmez',
    matrix: 'Matrix — yerel (Olm/Megolm şifreleme)',
    bridges: 'Telegram · Slack · Discord — sanal kutulanmış ayrı süreç köprüleriyle',
  },
  addAccount: 'Hesap ekle',
  close: 'Kapat',
};
