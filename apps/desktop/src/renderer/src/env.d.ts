/// <reference types="vite/client" />
import type { TepegozApi } from '@tepegoz/desktop-ipc';

declare global {
  interface Window {
    readonly tepegoz: TepegozApi;
  }
}
