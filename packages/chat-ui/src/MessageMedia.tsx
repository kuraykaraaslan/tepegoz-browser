import { useEffect, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { chatUiDict } from './i18n';
import { isSafeMediaResource, mediaCategory, type MediaResource } from './media';

/** Resolve a message's opaque `mediaRef` to a local resource. Returns `null` when it cannot be read. */
export type ResolveMedia = (mediaRef: string) => Promise<MediaResource | null>;

export interface MessageMediaProps {
  mediaRef: string;
  resolveMedia: ResolveMedia;
  /** Open the attachment in the sandbox viewer. */
  onOpenMedia?: ((mediaRef: string) => void) | undefined;
}

type State = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; resource: MediaResource };

/**
 * One attachment. Loads strictly through `resolveMedia` (host reads the quarantined part) and renders
 * an inline preview for image/video/audio or a click-to-open chip otherwise. No autoplay; no `src`
 * ever comes from the message — see {@link isSafeMediaResource}.
 */
export function MessageMedia({ mediaRef, resolveMedia, onOpenMedia }: Readonly<MessageMediaProps>) {
  const s = useT(chatUiDict);
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    resolveMedia(mediaRef).then(
      (resource) => {
        if (cancelled) return;
        setState(
          resource !== null && isSafeMediaResource(resource)
            ? { phase: 'ready', resource }
            : { phase: 'error' },
        );
      },
      () => {
        if (!cancelled) setState({ phase: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mediaRef, resolveMedia]);

  if (state.phase === 'loading') {
    return <span className="chat-media chat-media--loading">{s.media.loading}</span>;
  }
  if (state.phase === 'error') {
    return <span className="chat-media chat-media--error">{s.media.unavailable}</span>;
  }

  const { resource } = state;
  const open = (): void => onOpenMedia?.(mediaRef);

  switch (mediaCategory(resource.mime)) {
    case 'image':
      return (
        <button type="button" className="chat-media chat-media--image" onClick={open}>
          <img src={resource.url} alt={resource.name} loading="lazy" />
        </button>
      );
    case 'video':
      return (
        <video
          className="chat-media chat-media--video"
          src={resource.url}
          controls
          preload="metadata"
        />
      );
    case 'audio':
      return (
        <audio
          className="chat-media chat-media--audio"
          src={resource.url}
          controls
          preload="metadata"
        />
      );
    default:
      return (
        <button
          type="button"
          className="chat-media chat-media--file"
          aria-label={`${s.media.open} ${resource.name}`}
          onClick={open}
        >
          {resource.name}
        </button>
      );
  }
}
