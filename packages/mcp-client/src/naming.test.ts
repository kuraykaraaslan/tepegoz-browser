import { describe, it, expect } from 'vitest';
import { ToolNameSchema } from '@tepegoz/shared-types';
import NameMapper, {
  APPROVED_VERBS,
  buildSyntheticId,
  serverSlug,
  tokenize,
  verbFor,
} from './naming';

describe('APPROVED_VERBS', () => {
  it('every verb the mapper may emit is accepted by the live ToolNameSchema', () => {
    for (const verb of APPROVED_VERBS) {
      expect(ToolNameSchema.safeParse(`mcpx_${verb}_thing`).success).toBe(true);
    }
  });
});

describe('serverSlug / tokenize', () => {
  it('slugs a reverse-DNS server id to lowercase alphanumerics', () => {
    expect(serverSlug('com.tepegoz.gmail')).toBe('comtepegozgmail');
    expect(serverSlug('filesystem')).toBe('filesystem');
  });
  it('tokenizes snake, kebab and camelCase', () => {
    expect(tokenize('read_file')).toEqual(['read', 'file']);
    expect(tokenize('slack-post-message')).toEqual(['slack', 'post', 'message']);
    expect(tokenize('createEvent')).toEqual(['create', 'event']);
  });
});

describe('verbFor', () => {
  it('maps tokens to approved verbs', () => {
    expect(verbFor('read_file')).toBe('get');
    expect(verbFor('list_dirs')).toBe('list');
    expect(verbFor('slack_post_message')).toBe('create');
    expect(verbFor('set_value')).toBe('update');
    expect(verbFor('remove_item')).toBe('delete');
    expect(verbFor('search_web')).toBe('search');
  });
  it('defaults unknown verbs to get', () => {
    expect(verbFor('frobnicate_widget')).toBe('get');
  });
});

describe('buildSyntheticId', () => {
  const cases: [string, string, string][] = [
    ['filesystem', 'read_file', 'mcpfilesystem_get_file'],
    ['slack', 'slack_post_message', 'mcpslack_create_slackmessage'],
    ['com.tepegoz.gcal', 'createEvent', 'mcpcomtepegozgcal_create_event'],
  ];
  it.each(cases)('%s / %s → %s', (serverId, toolName, expected) => {
    const { id } = buildSyntheticId(serverId, toolName);
    expect(id).toBe(expected);
    expect(ToolNameSchema.safeParse(id).success).toBe(true);
  });

  it('handles verb-only names and digit-leading nouns', () => {
    expect(buildSyntheticId('srv', 'list').id).toBe('mcpsrv_list_item');
    const { id } = buildSyntheticId('srv', 'get_2fa');
    expect(id).toBe('mcpsrv_get_x2fa');
    expect(ToolNameSchema.safeParse(id).success).toBe(true);
  });
});

describe('NameMapper', () => {
  it('assigns stable, ToolNameSchema-valid ids and reverses them', () => {
    const m = new NameMapper();
    const id = m.assign('filesystem', 'read_file');
    expect(id).toBe('mcpfilesystem_get_file');
    expect(m.assign('filesystem', 'read_file')).toBe(id); // stable
    expect(ToolNameSchema.safeParse(id).success).toBe(true);
    expect(m.resolve(id)).toEqual({ serverId: 'filesystem', toolName: 'read_file' });
  });

  it('resolves collisions with a numeric suffix on the noun', () => {
    const m = new NameMapper();
    const a = m.assign('slack', 'post_message'); // mcpslack_create_message
    const b = m.assign('slack', 'send_message'); // also …_create_message → suffixed
    expect(a).not.toBe(b);
    expect(b).toMatch(/2$/);
    expect(ToolNameSchema.safeParse(b).success).toBe(true);
    expect(m.resolve(b)).toEqual({ serverId: 'slack', toolName: 'send_message' });
  });

  it("frees a server's ids on release so they can be reassigned", () => {
    const m = new NameMapper();
    const id = m.assign('files', 'read_file');
    m.release('files');
    expect(m.resolve(id)).toBeUndefined();
    // A different server can now claim the same slug/id shape without a collision suffix.
    expect(m.assign('files', 'read_file')).toBe(id);
  });
});
