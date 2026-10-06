import { describe, it, expect } from 'vitest';
import { summarizeStyle, type StyleProbe } from './style-inspector';

function probe(over: Partial<StyleProbe> = {}): StyleProbe {
  return {
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    position: 'static',
    zIndex: 'auto',
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    x: 12,
    y: 34,
    width: 100,
    height: 20,
    visible: true,
    ...over,
  };
}

describe('summarizeStyle', () => {
  it('reports found:false and an honest message for a missing/stale ref, never a fabricated style', () => {
    const report = summarizeStyle(null, 7, 'https://x');
    expect(report.ref).toBe(7);
    expect(report.found).toBe(false);
    expect(report.content).toContain('no such element');
    // The other fields must be genuinely absent, not zeroed — a caller checking `report.display` must
    // not read undefined-as-empty-string as "the page has no display value".
    expect(report.visible).toBeUndefined();
    expect(report.display).toBeUndefined();
  });

  it('shapes an ordinary visible element into structured fields and a readable content block', () => {
    const report = summarizeStyle(probe(), 3, 'https://x/page');
    expect(report.found).toBe(true);
    expect(report.visible).toBe(true);
    expect(report).toMatchObject({
      display: 'block',
      visibility: 'visible',
      opacity: 1,
      position: 'static',
      zIndex: 'auto',
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      x: 12,
      y: 34,
      width: 100,
      height: 20,
    });
    expect(report.content).toContain('display: block');
    expect(report.content).toContain('box: x=12 y=34 width=100 height=20');
    expect(report.content).toContain('visible: yes');
    expect(report.content).toContain('<untrusted_page_content');
  });

  it('a display:none element reports visible:false and opacity coerced to a number', () => {
    const report = summarizeStyle(
      probe({ display: 'none', visibility: 'visible', opacity: '1', visible: false }),
      1,
      'https://x',
    );
    expect(report.visible).toBe(false);
    expect(report.display).toBe('none');
    expect(report.opacity).toBe(1);
    expect(report.content).toContain('visible: no');
  });

  it('a zero-opacity element reports the numeric opacity and visible:false', () => {
    const report = summarizeStyle(probe({ opacity: '0', visible: false }), 1, 'https://x');
    expect(report.opacity).toBe(0);
    expect(report.visible).toBe(false);
    expect(report.content).toContain('opacity: 0');
  });

  it('an off-screen (scrolled-away) element can be CSS-visible yet report visible:false', () => {
    // display/visibility/opacity all say "shown" — only the box places it outside the viewport, which is
    // exactly the "why can't the agent see this" case the tool exists to answer.
    const report = summarizeStyle(
      probe({
        x: 5000,
        y: 5000,
        display: 'block',
        visibility: 'visible',
        opacity: '1',
        visible: false,
      }),
      1,
      'https://x',
    );
    expect(report.display).toBe('block');
    expect(report.visibility).toBe('visible');
    expect(report.visible).toBe(false);
    expect(report.x).toBe(5000);
  });

  it('a malformed/non-numeric opacity string degrades to fully opaque rather than throwing or zeroing', () => {
    const report = summarizeStyle(probe({ opacity: 'not-a-number' }), 1, 'https://x');
    expect(report.opacity).toBe(1);
  });

  it('caps and sanitizes an over-long or hostile computed-value string (AI-5 fencing)', () => {
    const longColor = `rgb(${'0, '.repeat(200)}0)`;
    const report = summarizeStyle(probe({ color: longColor }), 1, 'https://x');
    expect(report.color?.length).toBeLessThanOrEqual(200);
    // Content is XML-fenced and carries the anti-injection footer, same as the console/network siblings.
    expect(report.content).toContain('</untrusted_page_content>');
    expect(report.content).toContain('untrusted web data');
  });

  it('rounds fractional box-model coordinates', () => {
    const report = summarizeStyle(
      probe({ x: 12.4, y: 34.6, width: 99.5, height: 20.2 }),
      1,
      'https://x',
    );
    expect(report.x).toBe(12);
    expect(report.y).toBe(35);
    expect(report.width).toBe(100);
    expect(report.height).toBe(20);
  });
});
