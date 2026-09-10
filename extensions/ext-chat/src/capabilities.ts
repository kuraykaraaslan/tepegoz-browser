import { z } from 'zod';
import { capability, defineCapabilities, type ExtensionCapabilitySet } from '@tepegoz/extension-sdk';
import { CHAT_PRESENCE } from '@tepegoz/shared-types';
import type { ChatCapabilityHost } from './types';
import { chatManifest } from './manifest';

/**
 * The Chat extension's **agent-callable capabilities** (`phases/extensions/ext-chat.md`, ADR-0021):
 * list / read / search / act on conversations through the single ToolGateway PEP, exactly like
 * builtin tools. Ids are `{domain}_{verb}_{noun}` on the approved verb set (so "join a room" is
 * modelled as *creating a membership*, not a bespoke `room_join`).
 *
 * Danger classes are fail-safe: reads auto-allow; `chat_create_message` and `chat_create_membership`
 * are `state_changing` (→ **unsuppressible HITL**) and carry an idempotency key; leaving a room is
 * `destructive`. `chat_get_media` is a read whose host implementation quarantines the bytes before
 * they touch the sandbox. Untrusted-content wrapping and the unknown-contact gate are the host's job
 * (X-chat.6) — this file is only the table.
 */

const AccountArg = z.object({ accountId: z.string().min(1).max(64) });
const ConversationArg = AccountArg.extend({ conversationId: z.string().min(1).max(128) });

const HistoryArgs = ConversationArg.extend({
  before: z.string().max(256).nullable().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const SearchArgs = z.object({
  text: z.string().min(1).max(256),
  accountId: z.string().min(1).max(64).optional(),
  conversationId: z.string().min(1).max(128).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const CreateMessageArgs = ConversationArg.extend({
  body: z.string().min(1).max(100_000),
  replyToId: z.string().max(128).nullable().optional(),
});

const UpdateItemArgs = ConversationArg.extend({
  markReadUpTo: z.string().min(1).max(512).optional(),
  muted: z.boolean().optional(),
  reaction: z
    .object({
      messageId: z.string().min(1).max(512),
      emoji: z.string().min(1).max(64),
      on: z.boolean(),
    })
    .optional(),
});

const UpdatePresenceArgs = AccountArg.extend({
  presence: z.enum(CHAT_PRESENCE),
  statusText: z.string().max(512).optional(),
});

const CreateMembershipArgs = AccountArg.extend({ address: z.string().min(3).max(512) });

const GetMediaArgs = ConversationArg.extend({ messageId: z.string().min(1).max(512) });

export function chatCapabilities(): ExtensionCapabilitySet<ChatCapabilityHost> {
  return defineCapabilities(chatManifest.id, [
    capability<z.infer<typeof AccountArg>, ChatCapabilityHost>({
      id: 'chat_list_items',
      description:
        'List an account’s conversations. args: { accountId: string } — returns [{ conversationId, ' +
        'kind: "dm"|"room", title, unread, lastMessagePreview, isKnownContact }]. Unknown-contact DMs are ' +
        'omitted unless the user opted that conversation in.',
      dangerClass: 'read',
      inputSchema: AccountArg,
      handler: (args, host) => host.listItems(args.accountId),
    }),
    capability<z.infer<typeof ConversationArg>, ChatCapabilityHost>({
      id: 'chat_get_item',
      description:
        'Get one conversation’s metadata + participants. args: { accountId, conversationId } — ' +
        'returns the detail object or null (unknown / gated).',
      dangerClass: 'read',
      inputSchema: ConversationArg,
      handler: (args, host) => host.getItem(args.accountId, args.conversationId),
    }),
    capability<z.infer<typeof HistoryArgs>, ChatCapabilityHost>({
      id: 'chat_get_history',
      description:
        'Read recent messages oldest-first; each body is wrapped untrusted content. args: { accountId, ' +
        'conversationId, before?: cursor, limit?: 1-200 } — returns { messages, nextCursor }.',
      dangerClass: 'read',
      aiTask: 'none',
      inputSchema: HistoryArgs,
      handler: (args, host) =>
        host.getHistory({
          accountId: args.accountId,
          conversationId: args.conversationId,
          ...(args.before !== undefined ? { before: args.before } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        }),
    }),
    capability<z.infer<typeof SearchArgs>, ChatCapabilityHost>({
      id: 'chat_search_items',
      description:
        'Search local chat history. args: { text: string, accountId?, conversationId?, limit?: 1-100 } — ' +
        'returns [{ conversationId, accountId, message }] with wrapped bodies; gated conversations excluded.',
      dangerClass: 'read',
      inputSchema: SearchArgs,
      handler: (args, host) =>
        host.searchItems({
          text: args.text,
          ...(args.accountId !== undefined ? { accountId: args.accountId } : {}),
          ...(args.conversationId !== undefined ? { conversationId: args.conversationId } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        }),
    }),
    capability<z.infer<typeof CreateMessageArgs>, ChatCapabilityHost>({
      id: 'chat_create_message',
      description:
        'Send one message to one conversation. args: { accountId, conversationId, body, replyToId? } — ' +
        'returns { protocolId }. ALWAYS shows an unsuppressible HITL confirm (target conversation + rendered ' +
        'body); one conversation per call, never a broadcast.',
      dangerClass: 'state_changing',
      requiresIdempotencyKey: true,
      inputSchema: CreateMessageArgs,
      confirmSummary: async (args, host) => {
        const item = await Promise.resolve(host.getItem(args.accountId, args.conversationId)).catch(
          () => null,
        );
        const target =
          item !== null
            ? `${item.kind === 'room' ? 'room' : 'chat'} “${item.title}” · account ${args.accountId}`
            : `conversation ${args.conversationId} · account ${args.accountId}`;
        return `Send this message to ${target}:\n\n${args.body}`;
      },
      handler: (args, host) =>
        host.createMessage({
          accountId: args.accountId,
          conversationId: args.conversationId,
          body: args.body,
          ...(args.replyToId !== undefined ? { replyToId: args.replyToId } : {}),
        }),
    }),
    capability<z.infer<typeof UpdateItemArgs>, ChatCapabilityHost>({
      id: 'chat_update_item',
      description:
        'Update one conversation: mark read (markReadUpTo), set a mute (muted), or toggle a reaction ' +
        '(reaction: { messageId, emoji, on }). args: { accountId, conversationId, ...one of the above } — ' +
        'returns { ok: true }.',
      dangerClass: 'state_changing',
      inputSchema: UpdateItemArgs,
      handler: (args, host) =>
        host.updateItem({
          accountId: args.accountId,
          conversationId: args.conversationId,
          ...(args.markReadUpTo !== undefined ? { markReadUpTo: args.markReadUpTo } : {}),
          ...(args.muted !== undefined ? { muted: args.muted } : {}),
          ...(args.reaction !== undefined ? { reaction: args.reaction } : {}),
        }),
    }),
    capability<z.infer<typeof UpdatePresenceArgs>, ChatCapabilityHost>({
      id: 'chat_update_presence',
      description:
        'Set the account’s presence and optional status text. args: { accountId, presence: ' +
        '"online"|"away"|"xa"|"dnd"|"offline", statusText? } — returns { ok: true }.',
      dangerClass: 'state_changing',
      inputSchema: UpdatePresenceArgs,
      handler: (args, host) =>
        host.updatePresence({
          accountId: args.accountId,
          presence: args.presence,
          ...(args.statusText !== undefined ? { statusText: args.statusText } : {}),
        }),
    }),
    capability<z.infer<typeof CreateMembershipArgs>, ChatCapabilityHost>({
      id: 'chat_create_membership',
      description:
        'Join a room / channel by address (a room JID, an IRC #channel, a Matrix room id or alias). ' +
        'args: { accountId, address } — returns { conversationId }. HITL-gated.',
      dangerClass: 'state_changing',
      requiresIdempotencyKey: true,
      inputSchema: CreateMembershipArgs,
      handler: (args, host) => host.createMembership(args),
    }),
    capability<z.infer<typeof ConversationArg>, ChatCapabilityHost>({
      id: 'chat_delete_item',
      description:
        'Leave a room, or drop the local copy of a conversation. args: { accountId, conversationId } — ' +
        'returns { ok: true }.',
      dangerClass: 'destructive',
      inputSchema: ConversationArg,
      handler: (args, host) => host.deleteItem(args),
    }),
    capability<z.infer<typeof GetMediaArgs>, ChatCapabilityHost>({
      id: 'chat_get_media',
      description:
        'Materialize a message attachment into the file-operations sandbox after quarantine. args: ' +
        '{ accountId, conversationId, messageId } — returns { sandboxPath } or null.',
      dangerClass: 'read',
      inputSchema: GetMediaArgs,
      handler: (args, host) => host.getMedia(args),
    }),
  ]);
}
