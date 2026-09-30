import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

import { BackendClient } from '../../src/main/backend/backendClient';
import { AssetPreviewService } from '../../src/main/assets/AssetPreviewService';
import { ProjectFileSession } from '../../src/main/project/ProjectFileSession';
import { ProjectStorageSession } from '../../src/main/project/ProjectStorageSession';
import { ProjectRecoveryService } from '../../src/main/project/ProjectRecoveryService';
import { FileOperationCoordinator } from '../../src/main/window/FileOperationCoordinator';
import type { EditorWindowContext } from '../../src/main/window/EditorWindowContext';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';
import { registerEngineIpc } from '../../src/main/ipc/registerEngineIpc';

const mocks = vi.hoisted(() => ({ showMessageBox: vi.fn(), handle: vi.fn() }));
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
  dialog: { showMessageBox: mocks.showMessageBox },
  ipcMain: { handle: mocks.handle },
}));

const roots: string[] = [];
const contexts: EditorWindowContext[] = [];

async function directory(): Promise<string> {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'vn-recovery-test-'));
  roots.push(root);
  return root;
}

async function context(root: string): Promise<EditorWindowContext> {
  const value: EditorWindowContext = {
    backendClient: new BackendClient(),
    assetPreviewService: new AssetPreviewService({ handle: vi.fn(), unhandle: vi.fn() }),
    projectFileSession: new ProjectFileSession(),
    projectStorageSession: new ProjectStorageSession(),
    fileOperationCoordinator: new FileOperationCoordinator(),
    recoveryService: new ProjectRecoveryService(path.join(root, 'recovery')),
    editorWindow: { setTitle: vi.fn(), setDocumentEdited: vi.fn(), setRepresentedFilename: vi.fn() } as unknown as BrowserWindow,
  };
  contexts.push(value);
  const result = await value.backendClient.request({ method: 'project.create', params: { name: 'Recovered story' } });
  value.projectFileSession.markCreated(result.session);
  return value;
}

async function capture(value: EditorWindowContext, result: EngineMutationResult): Promise<void> {
  value.projectFileSession.updateEngineSession(result.session);
  await value.recoveryService!.capture(value, result);
  expect(result.session.recoveryFailed).toBe(false);
}

async function stop(value: EditorWindowContext): Promise<void> {
  value.backendClient.shutdown();
  value.recoveryService?.dispose();
  value.assetPreviewService.dispose();
  await value.projectStorageSession.dispose();
}

afterEach(async () => {
  for (const value of contexts.splice(0)) await stop(value);
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
  mocks.showMessageBox.mockReset();
  mocks.handle.mockReset();
});

describe('durable project recovery with the real C++ backend', () => {
  it('detaches the old save path and restores a checkpoint when only the backend restarts', async () => {
    const root = await directory();
    const value = await context(root);
    const filePath = path.join(root, 'project.vn.json');
    const saved = await value.backendClient.request({ method: 'project.save', params: { filePath } });
    const contents = await readFile(filePath, 'utf8');
    value.projectFileSession.markSaved(root, saved.session, contents);
    const changed = await value.backendClient.request({ method: 'project.rename', params: { name: 'Before backend crash' } });
    await capture(value, changed);
    value.backendClient.shutdown();
    value.backendClient = new BackendClient();
    registerEngineIpc(new Map([[7, value]]), new Map([[7, 'file:///editor/index.html']]));
    const handler = mocks.handle.mock.calls[0][1];
    const mainFrame = { url: 'file:///editor/index.html' };
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    const restored = await handler({ sender: { id: 7, mainFrame }, senderFrame: mainFrame }, { method: 'project.ensure', params: {} });
    expect(restored.project).toEqual(changed.project);
    expect(value.projectFileSession.getProjectRootPath()).toBeNull();
    expect(restored.session.isDirty).toBe(true);
    expect(await readFile(filePath, 'utf8')).toBe(contents);
  });
  it('restores unsaved content, media and invalid Code drafts after the backend and scratch workspace are gone', async () => {
    const root = await directory();
    const first = await context(root);
    const initial = await first.backendClient.request({ method: 'project.get', params: {} });
    const location = await first.projectStorageSession.assetImportLocation(null);
    await first.assetPreviewService.activateTemporaryProject(location.previewProjectFilePath, initial);
    const image = path.join(root, 'portrait.png');
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44]));
    const imported = await first.backendClient.request({ method: 'asset.import', params: {
      kind: 'image', sourceFilePath: image, projectFilePath: location.backendProjectFilePath,
    } });
    first.assetPreviewService.registerImportedAsset(location.previewProjectFilePath, image, imported);
    await capture(first, imported);
    const changed = await first.backendClient.request({ method: 'dialogue.add', params: {
      sceneId: initial.project.entrySceneId, speaker: 'Mira', text: 'The unsaved line',
    } });
    first.projectFileSession.updateEngineSession(changed.session);
    const drafts = { projectId: changed.project.id, code: [{ key: `${changed.project.id}:story:${changed.project.entrySceneId}`, source: 'if (unfinished', baseSource: '' }] };
    await first.recoveryService!.capture(first, changed, drafts);
    // Running windows never offer one another's active copies.
    const second = await context(root);
    expect(await second.recoveryService!.candidates()).toEqual([]);
    await stop(first);
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    const recovered = await second.recoveryService!.offer(second, 'en-US');
    expect(recovered.cancelled).toBe(false);
    if (recovered.cancelled) throw new Error('recovery cancelled');
    expect(recovered.result.project).toEqual(changed.project);
    expect(recovered.result.assets).toEqual(changed.assets);
    expect(recovered.session).toMatchObject({ hasStorage: false, isDirty: true, canUndo: false, canRedo: false });
    expect(second.recoveryService!.getDrafts()).toEqual(drafts);
    expect(second.assetPreviewService.getPreviewUrl(imported.assetId!)).toMatch(/^vn-asset:/);
    // Recovered media can also be published into a normal project.
    const target = path.join(root, 'published');
    await mkdir(target);
    const staging = await second.projectStorageSession.backendSavePath(target);
    await second.backendClient.request({ method: 'project.save', params: { filePath: staging } });
    const saved = JSON.parse(await second.projectStorageSession.publishSavedProject(staging, target,
      (contents, dest) => second.assetPreviewService.validateProjectSnapshotAtRoot(contents, dest)));
    expect(await readFile(path.join(target, saved.assets[0].relativePath))).toEqual(await readFile(image));
  });

  it('preserves the user manifest and the last good backup when a later checkpoint fails', async () => {
    const root = await directory();
    const first = await context(root);
    const target = path.join(root, 'original');
    await mkdir(target);
    const filePath = path.join(target, 'project.vn.json');
    const saved = await first.backendClient.request({ method: 'project.save', params: { filePath } });
    const originalBytes = await readFile(filePath, 'utf8');
    first.projectFileSession.markSaved(target, saved.session, originalBytes);
    const changed = await first.backendClient.request({ method: 'project.rename', params: { name: 'Kept checkpoint' } });
    await capture(first, changed);
    const later = await first.backendClient.request({ method: 'project.rename', params: { name: 'Failed checkpoint' } });
    first.projectFileSession.updateEngineSession(later.session);
    const validation = vi.spyOn(first.assetPreviewService, 'validateProjectSnapshotAtRoot').mockRejectedValueOnce(new Error('disk unavailable'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    await first.recoveryService!.capture(first, later);
    expect(later.session.recoveryFailed).toBe(true);
    expect(await readFile(filePath, 'utf8')).toBe(originalBytes);
    validation.mockRestore();
    errorLog.mockRestore();
    await stop(first);
    const second = await context(root);
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    const restored = await second.recoveryService!.offer(second, 'zh-CN');
    expect(restored.cancelled).toBe(false);
    if (!restored.cancelled) expect(restored.result.project.name).toBe('Kept checkpoint');
  });

  it('keeps deferred copies, removes saved copies, and ignores symbolic-link candidates', async () => {
    const root = await directory();
    const first = await context(root);
    await capture(first, await first.backendClient.request({ method: 'project.rename', params: { name: 'Keep me' } }));
    await stop(first);
    const second = await context(root);
    mocks.showMessageBox.mockResolvedValue({ response: 3 });
    expect((await second.recoveryService!.offer(second, 'en-US')).cancelled).toBe(true);
    expect(await second.recoveryService!.candidates()).toHaveLength(1);
    await symlink(root, path.join(root, 'recovery', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(await second.recoveryService!.candidates()).toHaveLength(1);
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    await second.recoveryService!.offer(second, 'en-US');
    await second.recoveryService!.clear();
    await stop(second);
    const third = await context(root);
    expect(await third.recoveryService!.candidates()).toEqual([]);
  });
});
