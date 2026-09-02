// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { browserDict } from '../../../i18n';
import { PrivateBadge } from './PrivateBadge';

/**
 * The private-window badge and its disclosure. phase-2c requires the surface to say what private mode
 * does NOT do, and to say it BEFORE the reassurance — every mainstream browser has been criticised for
 * the reverse. So this test pins the ordering: the "not hidden" line appears above the "discarded"
 * list in DOM order once the panel is open, and the panel is collapsed until asked for.
 */

const t = browserDict.en;

afterEach(cleanup);

describe('PrivateBadge', () => {
  it('is collapsed until the trigger is pressed', () => {
    render(<PrivateBadge t={t} />);
    const trigger = screen.getByRole('button', { name: new RegExp(t.privateBadge, 'i') });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(t.privateTitle)).toBeNull();
  });

  it('opens the disclosure on click and closes it again on a second click', () => {
    render(<PrivateBadge t={t} />);
    const trigger = screen.getByRole('button', { name: new RegExp(t.privateBadge, 'i') });

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(t.privateTitle)).toBeTruthy();

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(t.privateTitle)).toBeNull();
  });

  it('states the limit before the reassurance', () => {
    const { container } = render(<PrivateBadge t={t} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.privateBadge, 'i') }));

    const panel = container.querySelector('div.absolute') as HTMLElement;
    const notHidden = within(panel).getByText(t.privateNotHidden);
    const discardsTitle = within(panel).getByText(t.privateDiscardsTitle);

    expect(notHidden.compareDocumentPosition(discardsTitle) & Node.DOCUMENT_POSITION_FOLLOWING).
      toBeTruthy();
  });

  it('lists both what is discarded and what is kept', () => {
    render(<PrivateBadge t={t} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.privateBadge, 'i') }));

    expect(screen.getByText(t.privateDiscardsHistory)).toBeTruthy();
    expect(screen.getByText(t.privateKeepsNetwork)).toBeTruthy();
    expect(screen.getByText(t.privateLockout)).toBeTruthy();
  });
});
