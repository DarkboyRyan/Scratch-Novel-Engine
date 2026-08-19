import type { VnPlayerApi } from './playerProtocol';

declare global {
  interface Window {
    vnPlayer: VnPlayerApi;
  }
}

export {};
