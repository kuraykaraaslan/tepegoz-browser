import { describe, it, expect, vi } from 'vitest';
import { defineActionInterceptors } from '@tepegoz/extension-sdk';
import { ActionInterceptorSupervisor } from './action-interceptor-supervisor';

describe('ActionInterceptorSupervisor', () => {
  it('allows (false) when no interceptor is registered for the action type', () => {
    const sup = new ActionInterceptorSupervisor({ isEnabled: () => true });
    expect(sup.evaluate('popup:open', { sourceOrigin: 'https://example.com', url: 'https://ads.example' })).toBe(
      false,
    );
  });

  it('only consults an ENABLED extension\'s interceptor', () => {
    let enabled = false;
    const sup = new ActionInterceptorSupervisor({ isEnabled: () => enabled });
    sup.provide(
      defineActionInterceptors('com.tepegoz.demo', [
        { actionType: 'popup:open', shouldBlock: () => true },
      ]),
    );

    expect(sup.evaluate('popup:open', { sourceOrigin: 'x', url: 'y' })).toBe(false); // disabled → allow

    enabled = true;
    expect(sup.evaluate('popup:open', { sourceOrigin: 'x', url: 'y' })).toBe(true);
  });

  it('runs onBlocked exactly once, only when shouldBlock returns true', () => {
    const onBlocked = vi.fn();
    const sup = new ActionInterceptorSupervisor({ isEnabled: () => true });
    sup.provide(
      defineActionInterceptors('com.tepegoz.demo', [
        {
          actionType: 'tab:close',
          shouldBlock: (ctx) => ctx.tabId === 'protected',
          onBlocked,
        },
      ]),
    );

    expect(sup.evaluate('tab:close', { tabId: 'other', url: 'https://x' })).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();

    expect(sup.evaluate('tab:close', { tabId: 'protected', url: 'https://x' })).toBe(true);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledWith({ tabId: 'protected', url: 'https://x' });
  });

  it('first enabled interceptor to block wins; later ones are skipped', () => {
    const secondShouldBlock = vi.fn(() => true);
    const sup = new ActionInterceptorSupervisor({ isEnabled: () => true });
    sup.provide(
      defineActionInterceptors('com.tepegoz.first', [
        { actionType: 'tab:create', shouldBlock: () => true },
      ]),
    );
    sup.provide(
      defineActionInterceptors('com.tepegoz.second', [
        { actionType: 'tab:create', shouldBlock: secondShouldBlock },
      ]),
    );

    expect(sup.evaluate('tab:create', { url: 'https://x', openerId: null, background: false })).toBe(true);
    expect(secondShouldBlock).not.toHaveBeenCalled();
  });
});
