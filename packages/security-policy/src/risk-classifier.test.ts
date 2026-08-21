import { describe, expect, it } from 'vitest';
import { RISK_TIERS, type RiskLevel, type RiskTier } from '@tepegoz/shared-types';
import { classifyRisk } from './risk-classifier';

const at = (
  id: string,
  dangerClass: RiskLevel,
  extra: { args?: unknown; targetUrl?: string; originUrl?: string } = {},
): RiskTier => classifyRisk({ descriptor: { id, dangerClass }, ...extra }).tier;

/**
 * The frozen tool × argument matrix the DoD requires: every row states the call and the exactly-one
 * tier it must resolve to. A change to the classifier that moves any row is a visible diff here.
 */
const MATRIX: readonly {
  name: string;
  id: string;
  dangerClass: RiskLevel;
  args?: unknown;
  targetUrl?: string;
  originUrl?: string;
  expected: RiskTier;
}[] = [
  // --- read stays read ---
  { name: 'page read', id: 'browser_get_page', dangerClass: 'read', expected: 'read' },
  {
    name: 'read on a banking site is not raised (reading is not acting)',
    id: 'browser_get_page',
    dangerClass: 'read',
    targetUrl: 'https://www.garanti.com.tr/hesaplar',
    expected: 'read',
  },

  // --- declared floor ---
  {
    name: 'ordinary state change',
    id: 'browser_update_page',
    dangerClass: 'state_changing',
    expected: 'ui-write',
  },
  {
    name: 'declared destructive',
    id: 'macro_delete_macro',
    dangerClass: 'destructive',
    expected: 'destructive',
  },
  {
    name: 'declared financial',
    id: 'shop_create_order',
    dangerClass: 'financial',
    expected: 'financial',
  },

  // --- arguments raise the floor ---
  {
    name: 'typing into a search box is a ui-write',
    id: 'browser_update_page',
    dangerClass: 'state_changing',
    args: { action: 'fill', ref: 'e3', text: 'wireless headphones' },
    expected: 'ui-write',
  },
  {
    name: 'typing into a password field is a credential act — the case dangerClass cannot see',
    id: 'browser_update_page',
    dangerClass: 'state_changing',
    args: { action: 'fill', ref: 'input[type=password]', text: 'hunter2' },
    expected: 'credential',
  },
  {
    name: 'a password-named argument is a credential act',
    id: 'form_update_field',
    dangerClass: 'state_changing',
    args: { fields: { username: 'ada', password: 's3cret' } },
    expected: 'credential',
  },
  {
    name: 'Turkish "parola" is recognised as a secret',
    id: 'form_update_field',
    dangerClass: 'state_changing',
    args: { fields: { kullanici: 'ada', parola: 'g1zli' } },
    expected: 'credential',
  },
  {
    name: 'an OTP is a credential',
    id: 'form_update_field',
    dangerClass: 'state_changing',
    args: { otp: '493021' },
    expected: 'credential',
  },
  {
    name: 'a card number is a credential',
    id: 'form_update_field',
    dangerClass: 'state_changing',
    args: { cardNumber: '4111111111111111' },
    expected: 'credential',
  },

  // --- egress ---
  {
    name: 'web search leaves the device',
    id: 'web_search_items',
    dangerClass: 'read',
    expected: 'data-egress',
  },
  {
    name: 'upload leaves the device',
    id: 'file_upload_document',
    dangerClass: 'state_changing',
    expected: 'data-egress',
  },
  {
    name: 'a state change aimed at another registrable domain is egress',
    id: 'browser_update_page',
    dangerClass: 'state_changing',
    targetUrl: 'https://credential-collector.example/collect',
    originUrl: 'https://toolbazaar.example/product',
    expected: 'data-egress',
  },
  {
    name: 'same-site submission is not egress',
    id: 'browser_update_page',
    dangerClass: 'state_changing',
    targetUrl: 'https://shop.toolbazaar.example/cart',
    originUrl: 'https://www.toolbazaar.example/product',
    expected: 'ui-write',
  },

  // --- sensitive destinations ---
  {
    name: 'acting on a Turkish bank is financial (v1 keyword list matched this NOT AT ALL)',
    id: 'browser_update_page',
    dangerClass: 'state_changing',
    targetUrl: 'https://www.garanti.com.tr/transfer',
    expected: 'financial',
  },
  {
    name: 'acting on e-Devlet is a credential-tier act',
    id: 'browser_update_page',
    dangerClass: 'state_changing',
    targetUrl: 'https://www.turkiye.gov.tr/basvuru',
    expected: 'credential',
  },
  {
    name: 'acting on a password manager is a credential-tier act',
    id: 'browser_update_page',
    dangerClass: 'state_changing',
    targetUrl: 'https://vault.bitwarden.com/#/vault',
    expected: 'credential',
  },

  // --- highest wins ---
  {
    name: 'destructive beats credential when both apply',
    id: 'account_delete_profile',
    dangerClass: 'destructive',
    args: { password: 'confirm-me' },
    expected: 'destructive',
  },
  {
    name: 'credential beats egress when both apply',
    id: 'web_send_form',
    dangerClass: 'state_changing',
    args: { password: 'hunter2' },
    expected: 'credential',
  },
];

describe('classifyRisk — the frozen tool x argument matrix', () => {
  for (const row of MATRIX) {
    it(`${row.name} → ${row.expected}`, () => {
      const opts: { args?: unknown; targetUrl?: string; originUrl?: string } = {};
      if (row.args !== undefined) opts.args = row.args;
      if (row.targetUrl !== undefined) opts.targetUrl = row.targetUrl;
      if (row.originUrl !== undefined) opts.originUrl = row.originUrl;
      expect(at(row.id, row.dangerClass, opts)).toBe(row.expected);
    });
  }
});

describe('classifyRisk — invariants', () => {
  it('always returns exactly one tier from the enum', () => {
    for (const row of MATRIX) {
      const opts: { args?: unknown; targetUrl?: string; originUrl?: string } = {};
      if (row.args !== undefined) opts.args = row.args;
      if (row.targetUrl !== undefined) opts.targetUrl = row.targetUrl;
      if (row.originUrl !== undefined) opts.originUrl = row.originUrl;
      expect(RISK_TIERS).toContain(at(row.id, row.dangerClass, opts));
    }
  });

  it('never classifies below the declared dangerClass floor', () => {
    expect(at('x_get_y', 'destructive')).toBe('destructive');
    expect(at('x_get_y', 'financial')).toBe('financial');
    expect(at('x_get_y', 'state_changing')).not.toBe('read');
  });

  it('is deterministic — the same call classifies the same way every time', () => {
    const call = {
      descriptor: { id: 'browser_update_page', dangerClass: 'state_changing' as const },
      args: { fields: { password: 'x' } },
      targetUrl: 'https://www.akbank.com/transfer',
    };
    const first = classifyRisk(call);
    for (let i = 0; i < 20; i++) expect(classifyRisk(call)).toEqual(first);
  });

  it('reports every rule that fired, for Permission Debug', () => {
    const r = classifyRisk({
      descriptor: { id: 'web_send_form', dangerClass: 'state_changing' },
      args: { password: 'x' },
      targetUrl: 'https://evil.example/collect',
      originUrl: 'https://shop.example/checkout',
    });
    expect(r.reasons).toContain('declared_state_changing');
    expect(r.reasons).toContain('egress_tool');
    expect(r.reasons).toContain('credential_argument');
    expect(r.reasons).toContain('cross_site_target');
  });

  it('survives hostile argument shapes without throwing', () => {
    const deep: Record<string, unknown> = {};
    let node = deep;
    for (let i = 0; i < 500; i++) {
      const next: Record<string, unknown> = {};
      node.next = next;
      node = next;
    }
    expect(() =>
      classifyRisk({ descriptor: { id: 'x_get_y', dangerClass: 'read' }, args: deep }),
    ).not.toThrow();

    const wide = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${String(i)}`, 'v']));
    expect(() =>
      classifyRisk({ descriptor: { id: 'x_get_y', dangerClass: 'read' }, args: wide }),
    ).not.toThrow();

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      classifyRisk({ descriptor: { id: 'x_get_y', dangerClass: 'read' }, args: cyclic }),
    ).not.toThrow();

    expect(at('x_get_y', 'read', { targetUrl: 'not a url' })).toBe('read');
  });
});
