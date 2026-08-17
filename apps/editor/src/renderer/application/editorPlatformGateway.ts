import type { VnAssetsApi } from '../../shared/assetProtocol';
import type { VnEngineApi } from '../../shared/engineProtocol';
import type {
  ProjectFileCommand,
  VnProjectFilesApi,
} from '../../shared/projectFileProtocol';

// This is the Renderer composition boundary. Application code depends on the
// typed ports below; only this adapter knows that Electron Preload exposes them
// as properties on window.
export type EditorPlatformGateway = {
  assets: VnAssetsApi;
  engine: VnEngineApi;
  projectFiles: VnProjectFilesApi;
};

export function getEditorPlatformGateway(): EditorPlatformGateway {
  return {
    assets: window.vnAssets,
    engine: window.vnEngine,
    projectFiles: window.vnProjectFiles,
  };
}

export function subscribeEditorProjectFileCommands(
  listener: (command: ProjectFileCommand) => void,
): () => void {
  return getEditorPlatformGateway().projectFiles.onCommand(listener);
}
