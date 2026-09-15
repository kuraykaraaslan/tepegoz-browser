import { describe, expect, it } from 'vitest';
import { DataRightsExportRequestSchema } from './data-rights';

describe('DataRightsExportRequestSchema', () => {
  it('accepts a non-empty subject', () => {
    expect(DataRightsExportRequestSchema.parse({ subject: 'kaya@example.com' })).toEqual({
      subject: 'kaya@example.com',
    });
  });

  it('rejects an empty or missing subject', () => {
    expect(DataRightsExportRequestSchema.safeParse({ subject: '' }).success).toBe(false);
    expect(DataRightsExportRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a subject over 200 characters', () => {
    expect(DataRightsExportRequestSchema.safeParse({ subject: 'x'.repeat(201) }).success).toBe(false);
  });
});
