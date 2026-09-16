import { describe, it, expect } from 'vitest';
import { euAiActHighRiskCategory, isEuAiActHighRisk } from './eu-ai-act-risk';

describe('isEuAiActHighRisk', () => {
  it('flags biometric-categorization, social-scoring, and legal-eligibility hosts', () => {
    expect(isEuAiActHighRisk('https://onfido.com/verify')).toBe(true);
    expect(isEuAiActHighRisk('https://credit.alipay.com/')).toBe(true);
    expect(isEuAiActHighRisk('https://www.equifax.com/')).toBe(true);
  });

  it('does not flag ordinary sites', () => {
    expect(isEuAiActHighRisk('https://example.com')).toBe(false);
    expect(isEuAiActHighRisk('https://news.ycombinator.com')).toBe(false);
  });

  it('returns false for non-URLs', () => {
    expect(isEuAiActHighRisk('not a url')).toBe(false);
    expect(isEuAiActHighRisk('')).toBe(false);
  });
});

describe('euAiActHighRiskCategory', () => {
  it.each([
    ['https://www.clearview.ai/', 'biometric-categorization'],
    ['https://www.hirevue.com/apply', 'biometric-categorization'],
    ['https://www.jumio.com/', 'biometric-categorization'],
    ['https://credit.alipay.com/', 'social-scoring'],
    ['https://www.transunion.com/', 'legal-eligibility'],
    ['https://www.kkb.com.tr/', 'legal-eligibility'],
    ['https://www.findeks.com/', 'legal-eligibility'],
  ])('%s → %s', (url, category) => {
    expect(euAiActHighRiskCategory(url)).toBe(category);
  });

  it('returns null for a host that matches nothing', () => {
    expect(euAiActHighRiskCategory('https://example.com/')).toBeNull();
  });

  it('matches sub-domains of a suffix rule but not lookalike domains', () => {
    expect(euAiActHighRiskCategory('https://verify.equifax.com/')).toBe('legal-eligibility');
    expect(euAiActHighRiskCategory('https://notequifax.com/')).toBeNull();
  });
});
