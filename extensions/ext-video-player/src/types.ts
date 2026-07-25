export type VideoPlayerTheme = 'light' | 'dark' | 'auto';
export type VideoPlayerSubtitleSize = 'sm' | 'md' | 'lg' | 'xl';

/** Persisted Unified Player settings (lives in `Preferences.videoPlayer`). */
export interface VideoPlayerSettings {
  /** Master switch — replace native controls on eligible `<video>` elements. */
  enabled: boolean;
  /** Playback rate applied to adopted videos on mount (0.25–4). */
  defaultSpeed: number;
  /** Subtitle overlay font size (currently applied only when the page exposes text tracks). */
  subtitleFontSize: VideoPlayerSubtitleSize;
  /** Player chrome theme; `auto` resolves to dark (the chrome is a dark-on-video look). */
  theme: VideoPlayerTheme;
  /** Auto-hide the controls after inactivity while playing. */
  autoHideControls: boolean;
  /** Keyboard shortcuts while the pointer is over a skinned player. */
  enableKeyboard: boolean;
  /** http(s) origins where the unified player is paused. */
  disabledOrigins: string[];
  /** Per-origin video scale (CSS transform), e.g. `{ 'https://www.youtube.com': 1.4 }`. */
  siteScales: Record<string, number>;
}

/** The resolved options handed to the injected page bundle (`window.__tepegozVideoPlayer.mount`). */
export interface VideoPlayerSkinOptions {
  defaultSpeed: number;
  autoHideControls: boolean;
  enableKeyboard: boolean;
  theme: 'light' | 'dark';
  /** Resolved scale for the current page's origin (1 = no scaling). */
  scale: number;
}

/** Session-only per-tab state pushed from the page injector (how many videos were skinned). */
export interface VideoPlayerPageState {
  url: string;
  origin: string | null;
  adopted: number;
  updatedAt: number;
}

/** Combined snapshot the popup renders: persisted settings + the live page state. */
export interface VideoPlayerState {
  settings: VideoPlayerSettings;
  page: VideoPlayerPageState | null;
}

/** The subset of `window.tepegoz` the Unified Player surfaces call. */
export interface VideoPlayerHostApi {
  getVideoPlayerSettings(): Promise<VideoPlayerSettings>;
  setVideoPlayerSettings(patch: Partial<VideoPlayerSettings>): Promise<VideoPlayerSettings>;
  getVideoPlayerState(): Promise<VideoPlayerState>;
  setVideoPlayerSiteEnabled(origin: string, enabled: boolean): Promise<VideoPlayerSettings>;
  onVideoPlayerPageState(callback: (state: VideoPlayerPageState | null) => void): () => void;
  getActiveTabUrl(): Promise<string | null>;
  tabReload(): void;
}
