export type RendererBuildKind = 'DEV' | 'PROD';

export const nodeEnv = typeof __TEPEGOZ_NODE_ENV__ === 'string' ? __TEPEGOZ_NODE_ENV__ : 'test';
export const viteMode = import.meta.env.MODE;
export const rendererBuild: RendererBuildKind = import.meta.env.DEV ? 'DEV' : 'PROD';

export function isDeveloperSettingsVisible(env: string): boolean {
  return env === 'development';
}
