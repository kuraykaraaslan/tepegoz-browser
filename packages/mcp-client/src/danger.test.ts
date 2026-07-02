import { describe, it, expect } from 'vitest';
import { dangerClassFor, requiresIdempotencyFor } from './danger';

describe('dangerClassFor', () => {
  it('only readOnlyHint lowers to read', () => {
    expect(dangerClassFor({ readOnlyHint: true })).toBe('read');
  });
  it('destructiveHint raises to destructive', () => {
    expect(dangerClassFor({ destructiveHint: true })).toBe('destructive');
  });
  it('defaults to state_changing (→ ask) when hints are missing or false', () => {
    expect(dangerClassFor(undefined)).toBe('state_changing');
    expect(dangerClassFor({})).toBe('state_changing');
    expect(dangerClassFor({ readOnlyHint: false })).toBe('state_changing');
  });
});

describe('requiresIdempotencyFor', () => {
  it('is true for destructive tools and create/upload verbs', () => {
    expect(requiresIdempotencyFor('get', 'destructive')).toBe(true);
    expect(requiresIdempotencyFor('create', 'state_changing')).toBe(true);
    expect(requiresIdempotencyFor('upload', 'read')).toBe(true);
  });
  it('is false otherwise', () => {
    expect(requiresIdempotencyFor('get', 'read')).toBe(false);
    expect(requiresIdempotencyFor('update', 'state_changing')).toBe(false);
  });
});
