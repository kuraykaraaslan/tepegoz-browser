import { defineExtension } from '@tepegoz/extension-sdk';

/**
 * The Scheduled Tasks extension manifest — validated against the SDK schema at module load. This is the
 * "extension on top of an extension": it manages agent conversations that were saved as recurring tasks
 * (see @tepegoz/ext-agent), presenting them in a single internal page at `tepegoz://com.tepegoz.tasks`.
 */
export const tasksManifest = defineExtension({
  id: 'com.tepegoz.tasks',
  name: 'Scheduled Tasks',
  version: '0.1.0',
  description:
    'Run saved agent chats on a schedule or when a page changes, and manage them in one place.',
  icon: 'list-check',
  surfaces: ['page'],
  actions: { click: 'page' },
  labels: {
    tr: {
      name: 'Görevler',
      description:
        'Kayıtlı ajan sohbetlerini zamanlanmış ya da sayfa değiştiğinde çalıştırın ve tek yerden yönetin.',
    },
  },
  permissions: [],
});
