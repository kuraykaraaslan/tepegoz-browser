import { describe, it, expect } from 'vitest';
import type { ChatAccount } from '@tepegoz/shared-types';
import { tick, account, harness } from './chat-service.test-kit';

describe('ChatService — lifecycle', () => {
  it('start() connects one runner per persisted account when enabled', async () => {
    const { service, adapter } = harness({ loadAccounts: () => [account('a'), account('b')] });
    await service.start();
    await tick();
    expect(adapter.connect).toHaveBeenCalledTimes(2);
    expect(Object.keys(service.accountStates())).toEqual(['a', 'b']);
  });

  it('start() does nothing while the extension is disabled', async () => {
    const { service, adapter } = harness({
      loadAccounts: () => [account('a')],
      isEnabled: () => false,
    });
    await service.start();
    expect(adapter.connect).not.toHaveBeenCalled();
  });

  it('an account with no stored secret emits an error and no runner', async () => {
    const { service, adapter, emit } = harness({ loadAccounts: () => [account('nosecret')] });
    await service.start();
    expect(adapter.connect).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'nosecret',
        state: 'error',
        detail: 'no stored credential',
      }),
    );
  });

  it('setEnabled toggles every runner off then back on', async () => {
    const { service, adapter } = harness({ loadAccounts: () => [account('a')] });
    await service.start();
    await service.setEnabled(false);
    expect(adapter.disconnect).toHaveBeenCalled();
    expect(service.accountStates()).toEqual({});
    await service.setEnabled(true);
    await tick();
    expect(adapter.connect).toHaveBeenCalledTimes(2);
  });

  it('stop() halts everything', async () => {
    const { service, adapter } = harness({ loadAccounts: () => [account('a'), account('b')] });
    await service.start();
    await service.stop();
    expect(adapter.disconnect).toHaveBeenCalledTimes(2);
    expect(service.accountStates()).toEqual({});
  });

  it('X-chat.10: a profile switch drops every connection; the next profile sees only its own accounts', async () => {
    // A profile switch is a process swap (ADR-0045 process-per-profile): the outgoing process runs
    // `before-quit` → `ChatMessenger.stop()` → this `stop()`, and the incoming process is a fresh
    // `ChatService` whose `loadAccounts` is scoped to that profile's own SQLite file.
    const outgoing = harness({ loadAccounts: () => [account('a'), account('b')] });
    await outgoing.service.start();
    await tick();
    expect(Object.keys(outgoing.service.accountStates())).toEqual(['a', 'b']);

    await outgoing.service.stop();
    expect(outgoing.adapter.disconnect).toHaveBeenCalledTimes(2);
    expect(outgoing.service.accountStates()).toEqual({});
    outgoing.emit.mockClear();
    outgoing.service.notifyEgressChange(); // nothing left to fan to
    expect(outgoing.emit).not.toHaveBeenCalled();
    await outgoing.service.stop(); // idempotent

    // The next profile's service only ever knows what its own `loadAccounts` returns.
    const incoming = harness({ loadAccounts: () => [account('a')] });
    await incoming.service.start();
    await tick();
    expect(Object.keys(incoming.service.accountStates())).toEqual(['a']);
  });
});

describe('ChatService — accounts', () => {
  it('addAccount stores the secret, persists the row, and connects it', async () => {
    const { service, adapter, secrets } = harness();
    await service.start();
    await service.addAccount(account('new'), 'hunter2');
    await tick();
    expect(secrets.store.get('chat:new')).toBe('hunter2');
    expect(adapter.connect).toHaveBeenCalled();
    expect(service.accountStates()).toHaveProperty('new');
  });

  it('X-chat.10: the "account added" audit fact carries no secret', async () => {
    const { service, audit } = harness();
    await service.start();
    await service.addAccount(account('new'), 'hunter2-the-vault-secret');
    expect(audit).toHaveBeenCalledTimes(1);
    const event = audit.mock.calls[0]?.[0] as { kind: string; accountId: string; protocol: string };
    expect(JSON.stringify(event)).not.toContain('hunter2-the-vault-secret');
    expect(event).toMatchObject({ kind: 'account-added', accountId: 'new', protocol: 'xmpp' });
  });

  it('updateAccount(secret: null) keeps the vault secret, persists the new config, and reconnects', async () => {
    const acc = account('a');
    const { service, adapter, secrets, setAccounts } = harness();
    setAccounts([acc]);
    await service.start();
    await tick();
    adapter.connect.mockClear();
    adapter.disconnect.mockClear();

    const renamed: ChatAccount = { ...acc, label: 'Renamed' };
    await service.updateAccount(renamed, null);
    await tick();

    expect(adapter.disconnect).toHaveBeenCalledTimes(1); // stopped the stale runner
    expect(adapter.connect).toHaveBeenCalledTimes(1); // reconnected with the new row
    expect(secrets.store.get('chat:a')).toBe('s'); // vault secret untouched
    expect(service.accountStates()).toHaveProperty('a');
  });

  it('updateAccount(secret: "new") rotates the vault secret', async () => {
    const acc = account('a');
    const { service, secrets, setAccounts } = harness();
    setAccounts([acc]);
    await service.start();
    await tick();

    await service.updateAccount(acc, 'new-secret');
    await tick();

    expect(secrets.store.get('chat:a')).toBe('new-secret');
  });

  it('updateAccount on an account with no live runner still persists + reconnects (was never started)', async () => {
    const acc = account('cold');
    const { service, adapter, setAccounts } = harness();
    setAccounts([]); // not loaded at start()
    await service.start();
    setAccounts([acc]);

    await service.updateAccount(acc, 'hunter2');
    await tick();

    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(service.accountStates()).toHaveProperty('cold');
  });

  it('removeAccount stops the runner and drops the secret + row', async () => {
    const acc = account('a');
    const { service, adapter, secrets, setAccounts } = harness();
    setAccounts([acc]);
    await service.start();
    await service.removeAccount('a');
    expect(adapter.disconnect).toHaveBeenCalled();
    expect(secrets.store.has('chat:a')).toBe(false);
    expect(service.accountStates()).toEqual({});
  });
});

describe('ChatService — delegation', () => {
  async function ready() {
    const h = harness({ loadAccounts: () => [account('a')] });
    await h.service.start();
    await tick();
    return h;
  }

  it('routes actions to the named account', async () => {
    const { service, adapter } = await ready();
    await service.sendMessage('a', 'bob@x.com', { body: 'hi' });
    expect(adapter.sendMessage).toHaveBeenCalled();
    await service.setPresence('a', 'away');
    await service.roster('a');
    await service.history('a', 'bob@x.com', null);
    await service.discoverRooms('a', 'conf.example');
    await service.joinRoom('a', 'general@conf.example');
    await service.setRoomNotifyLevel('a', 'room@conf', 'none');
    await service.inviteToRoom('a', 'general@conf.example', 'carol@x.com');
    expect(adapter.inviteToRoom).toHaveBeenCalledWith(
      expect.anything(),
      'general@conf.example',
      'carol@x.com',
    );
    await service.addContact('a', 'bob@x.com');
    expect(adapter.addContact).toHaveBeenCalledWith(expect.anything(), 'bob@x.com');
    await service.removeContact('a', 'bob@x.com');
    expect(adapter.removeContact).toHaveBeenCalledWith(expect.anything(), 'bob@x.com');
    expect(adapter.setPresence).toHaveBeenCalled();
    expect(adapter.roster).toHaveBeenCalled();
    expect(adapter.history).toHaveBeenCalled();
    expect(adapter.discoverRooms).toHaveBeenCalledWith(expect.anything(), 'conf.example');
    expect(adapter.joinRoom).toHaveBeenCalledWith(expect.anything(), 'general@conf.example');
  });

  it('throws 409 for an unknown / disconnected account', async () => {
    const { service } = await ready();
    await expect(service.sendMessage('ghost', 'c', { body: 'x' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('notifyEgressChange reaches the runners without throwing', async () => {
    const { service } = await ready();
    expect(() => service.notifyEgressChange()).not.toThrow();
  });

  it('X-chat.10: losing egress fans the kill-switch out — every account goes "blocked"', async () => {
    let egress = true;
    const h = harness({
      loadAccounts: () => [account('a'), account('b')],
      mayEgress: () => egress,
    });
    await h.service.start();
    await tick();
    expect(Object.values(h.service.accountStates())).toEqual(['online', 'online']);

    egress = false;
    h.service.notifyEgressChange();
    await tick();
    expect(Object.values(h.service.accountStates())).toEqual(['blocked', 'blocked']);

    egress = true;
    h.service.notifyEgressChange();
    await tick();
    expect(Object.values(h.service.accountStates())).toEqual(['online', 'online']);
  });
});
