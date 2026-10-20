// Keep startup work behind one shared promise so the loading screen can be
// shown before backend creation/recovery, without exposing a partial project.
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { getEditorNativeLabels } from '../i18n/editorNativeLabels';
import type { EditorWindowContext } from './EditorWindowContext';
import { updateWindowDocumentPresentation } from './updateWindowDocumentPresentation';

export function createEditorWindowInitializer(
  context: EditorWindowContext,
  options: {
    createProject: boolean;
    projectName?: string;
    offerRecovery: boolean;
    getLanguage: () => EditorLanguage;
  },
): () => Promise<void> {
  let pending: Promise<void> | undefined;
  let projectCreated = false;

  async function initialize(): Promise<void> {
    const { editorWindow, backendClient, projectFileSession, recoveryService } = context;
    const assertOpen = () => {
      if (editorWindow.isDestroyed()) throw new Error('Editor window was closed');
    };
    assertOpen();
    const language = options.getLanguage();
    if (options.createProject && !projectCreated) {
      const result = await backendClient.request({
        method: 'project.create',
        params: {
          name: options.projectName ?? getEditorNativeLabels(language).window.untitledProject,
          firstSceneName: language === 'en-US' ? 'Scene 1' : '场景 1',
        },
      });
      assertOpen();
      const session = projectFileSession.markCreated(result.session);
      recoveryService?.observeProject(result.project.id);
      projectCreated = true;
      updateWindowDocumentPresentation(editorWindow, result.project.name, session, language);
    }
    if (options.offerRecovery) {
      await recoveryService?.offer(context, language).catch((error: unknown) => {
        // A damaged copy must not prevent the editor from opening.
        console.error('[project-recovery] startup recovery failed', error);
      });
    }
    assertOpen();
  }

  return () => {
    // Concurrent IPC calls/reloads share startup. A failed backend launch can
    // be retried by reloading; successful initialization never recreates it.
    pending ??= initialize().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
