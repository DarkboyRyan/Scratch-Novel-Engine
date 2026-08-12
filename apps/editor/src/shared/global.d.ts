import type { VnEngineApi } from './engineProtocol';

declare global {
  interface Window {
    readonly vnEngine: VnEngineApi;
  }
}

export {};
