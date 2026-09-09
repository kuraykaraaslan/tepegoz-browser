// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { MessageMedia } from './MessageMedia';
import type { MediaResource } from './media';

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);
const resolveTo = (r: MediaResource | null) => vi.fn(() => Promise.resolve(r));

describe('MessageMedia', () => {
  it('shows a loading state, then an inline image from the resolved blob URL', async () => {
    wrap(
      <MessageMedia
        mediaRef="ref-1"
        resolveMedia={resolveTo({ url: 'blob:abc', mime: 'image/png', name: 'cat.png' })}
      />,
    );
    expect(screen.getByText('Loading attachment…')).toBeDefined();
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('blob:abc');
    expect(img.getAttribute('alt')).toBe('cat.png');
  });

  it('NEVER renders a src from a non-local URL — treats it as unavailable', async () => {
    const resolve = resolveTo({ url: 'https://evil.example/track.png', mime: 'image/png', name: 'x' });
    wrap(<MessageMedia mediaRef="ref-2" resolveMedia={resolve} />);
    await screen.findByText('Attachment unavailable');
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders a video with controls and no autoplay', async () => {
    const { container } = wrap(
      <MessageMedia
        mediaRef="v"
        resolveMedia={resolveTo({ url: 'blob:v', mime: 'video/mp4', name: 'clip.mp4' })}
      />,
    );
    const video = await vi.waitFor(() => {
      const el = container.querySelector('video');
      expect(el).not.toBeNull();
      return el as HTMLVideoElement;
    });
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.getAttribute('src')).toBe('blob:v');
  });

  it('renders an audio player with controls', async () => {
    const { container } = wrap(
      <MessageMedia
        mediaRef="a"
        resolveMedia={resolveTo({ url: 'blob:a', mime: 'audio/ogg', name: 'voice.ogg' })}
      />,
    );
    const audio = await vi.waitFor(() => {
      const el = container.querySelector('audio');
      expect(el).not.toBeNull();
      return el as HTMLAudioElement;
    });
    expect(audio.hasAttribute('controls')).toBe(true);
    expect(audio.getAttribute('src')).toBe('blob:a');
  });

  it('renders a click-to-open chip for a non-previewable file', async () => {
    const onOpenMedia = vi.fn();
    wrap(
      <MessageMedia
        mediaRef="doc"
        resolveMedia={resolveTo({ url: 'blob:d', mime: 'application/pdf', name: 'report.pdf' })}
        onOpenMedia={onOpenMedia}
      />,
    );
    const chip = await screen.findByRole('button', { name: 'Open attachment report.pdf' });
    fireEvent.click(chip);
    expect(onOpenMedia).toHaveBeenCalledWith('doc');
  });

  it('shows unavailable when the host cannot resolve the ref', async () => {
    wrap(<MessageMedia mediaRef="gone" resolveMedia={resolveTo(null)} />);
    await screen.findByText('Attachment unavailable');
  });

  it('shows unavailable when resolveMedia rejects', async () => {
    wrap(<MessageMedia mediaRef="boom" resolveMedia={vi.fn(() => Promise.reject(new Error('io')))} />);
    await screen.findByText('Attachment unavailable');
  });
});
