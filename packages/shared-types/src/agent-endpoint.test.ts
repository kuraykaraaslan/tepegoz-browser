import { describe, expect, it } from 'vitest';
import { AgentEndpointTokenSchema } from './agent-endpoint';

const token = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  allowedToolIds: ['browser_get_page'],
  allowedDangerClasses: ['read'],
  expiresAt: Date.now() + 1000,
  ...over,
});

describe('the AgentEndpointToken shape', () => {
  it('parses a well-formed token', () => {
    expect(AgentEndpointTokenSchema.safeParse(token()).success).toBe(true);
  });

  it('accepts an empty allowedToolIds — a token that can call nothing, never "everything"', () => {
    expect(AgentEndpointTokenSchema.safeParse(token({ allowedToolIds: [] })).success).toBe(true);
  });

  it('refuses an EMPTY allowedDangerClasses — a token with no danger classes at all cannot act', () => {
    expect(AgentEndpointTokenSchema.safeParse(token({ allowedDangerClasses: [] })).success).toBe(
      false,
    );
  });

  it('refuses an unrecognised danger class', () => {
    expect(
      AgentEndpointTokenSchema.safeParse(token({ allowedDangerClasses: ['omniscient'] })).success,
    ).toBe(false);
  });

  it('accepts an optional rate limit, and omits it cleanly when unset', () => {
    expect(AgentEndpointTokenSchema.safeParse(token({ rateLimitPerMinute: 10 })).success).toBe(
      true,
    );
    expect(AgentEndpointTokenSchema.parse(token()).rateLimitPerMinute).toBeUndefined();
  });
});
