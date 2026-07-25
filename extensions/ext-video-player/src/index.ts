export { videoPlayerManifest } from './manifest';
export { VideoPlayerControls, VideoPlayerPopup, VideoPlayerPage } from './panel';
export { videoPlayerDict, type VideoPlayerStrings } from './i18n';
export {
  VIDEO_PLAYER_EXTENSION_ID,
  DEFAULT_VIDEO_PLAYER_SETTINGS,
  createVideoPlayerHost,
  normalizeOrigin,
  type VideoPlayerHost,
  type VideoPlayerHostPorts,
} from './host';
export type {
  VideoPlayerHostApi,
  VideoPlayerPageState,
  VideoPlayerSettings,
  VideoPlayerSkinOptions,
  VideoPlayerState,
  VideoPlayerSubtitleSize,
  VideoPlayerTheme,
} from './types';
