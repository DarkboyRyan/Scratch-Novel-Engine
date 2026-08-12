import type { VnEngineApi } from './engineProtocol';
import type { VnProjectFilesApi } from './projectFileProtocol';

declare global {
  interface Window {
    readonly vnEngine: VnEngineApi;
    readonly vnProjectFiles: VnProjectFilesApi;
  }
}

export {};
