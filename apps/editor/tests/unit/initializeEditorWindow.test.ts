import { describe, expect, it, vi } from 'vitest';
import type { EditorWindowContext } from '../../src/main/window/EditorWindowContext';
import { createEditorWindowInitializer } from '../../src/main/window/initializeEditorWindow';
import { ProjectFileSession } from '../../src/main/project/ProjectFileSession';

function fixture(offerRecovery = true) {
  const request = vi.fn().mockResolvedValue({
    project: { id: 'project-1', name: 'New story' },
    session: { revision: 0, savedRevision: null, isDirty: true },
  });
  const offer = vi.fn().mockResolvedValue({ cancelled: true });
  const isDestroyed = vi.fn().mockReturnValue(false);
  const setTitle = vi.fn();
  const context = {
    editorWindow: {
      isDestroyed, setTitle,
      setDocumentEdited: vi.fn(), setRepresentedFilename: vi.fn(),
    },
    backendClient: { request },
    projectFileSession: new ProjectFileSession(),
    recoveryService: { observeProject: vi.fn(), offer },
  } as unknown as EditorWindowContext;
  const initialize = createEditorWindowInitializer(context, {
    createProject: true, projectName: 'New story', offerRecovery,
    getLanguage: () => 'zh-CN',
  });
  return { initialize, request, offer, isDestroyed, setTitle, context };
}

describe('editor window startup', () => {
  it('waits for recovery and shares one startup across concurrent requests and reloads', async () => {
    const { initialize, request, offer, context } = fixture();
    let finishRecovery!: () => void;
    offer.mockImplementation(() => new Promise<void>((resolve) => { finishRecovery = resolve; }));
    const first = initialize();
    expect(initialize()).toBe(first);
    let completed = false;
    void first.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(offer).toHaveBeenCalledWith(context, 'zh-CN');
    expect(request).toHaveBeenCalledWith({
      method: 'project.create', params: { name: 'New story', firstSceneName: '场景 1' },
    });
    finishRecovery();
    await first;
    await initialize();
    expect(completed).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(offer).toHaveBeenCalledTimes(1);
  });

  it('allows retry after a failed backend launch', async () => {
    const { initialize, request, offer } = fixture();
    request.mockRejectedValueOnce(new Error('backend unavailable'));
    await expect(initialize()).rejects.toThrow('backend unavailable');
    expect(offer).not.toHaveBeenCalled();
    await initialize();
    expect(request).toHaveBeenCalledTimes(2);
    expect(offer).toHaveBeenCalledTimes(1);
  });

  it('does not offer startup recovery in a second project window', async () => {
    const { initialize, offer } = fixture(false);
    await initialize();
    expect(offer).not.toHaveBeenCalled();
  });

  it('keeps the editor usable when a recovery copy cannot be read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { initialize, offer } = fixture();
      offer.mockRejectedValueOnce(new Error('damaged copy'));
      await expect(initialize()).resolves.toBeUndefined();
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('does not launch the backend or show recovery in a closed window', async () => {
    const { initialize, request, offer, isDestroyed } = fixture();
    isDestroyed.mockReturnValue(true);
    await expect(initialize()).rejects.toThrow('window was closed');
    expect(request).not.toHaveBeenCalled();
    expect(offer).not.toHaveBeenCalled();
  });

  it('does not update a window closed while the backend was starting', async () => {
    const { initialize, offer, isDestroyed, setTitle } = fixture();
    const pending = initialize();
    isDestroyed.mockReturnValue(true);
    await expect(pending).rejects.toThrow('window was closed');
    expect(offer).not.toHaveBeenCalled();
    expect(setTitle).not.toHaveBeenCalled();
  });
});
