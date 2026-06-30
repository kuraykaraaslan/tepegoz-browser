/// <reference types="vite/client" />
import type { TepegozApi } from '../../shared/ipc-contract';

declare global {
  interface Window {
    readonly tepegoz: TepegozApi;
  }
}
