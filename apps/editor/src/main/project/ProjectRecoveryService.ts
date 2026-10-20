// Durable, self-contained recovery copies. User manifests are never overwritten.
import { dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { EngineMutationResult } from '../../shared/engineProtocol';
import type { RecoveryDrafts, ProjectFileOperationResult } from '../../shared/projectFileProtocol';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import type { EditorWindowContext } from '../window/EditorWindowContext';
import { isRecoveryDrafts } from '../ipc/validateProjectFileInvocation';
import { canonicalizeProjectRootPath, projectManifestPath } from './ProjectPathPolicy';
import { atomicPublishManifest, publishProjectSnapshot, readStableManifestBytes } from './ProjectPublisher';
import { updateWindowDocumentPresentation } from '../window/updateWindowDocumentPresentation';

const liveCopies = new Set<string>();
const DRAFT_FILE = 'drafts.json';

export class ProjectRecoveryService {
  private id: string = randomUUID();
  private lastRevision = -1;
  private assetSignature = '';
  private drafts: RecoveryDrafts | null = null;
  private failed = false;
  private projectId: string | null = null;

  constructor(private readonly root: string) {
    liveCopies.add(this.directory());
  }

  private directory(): string { return path.join(this.root, this.id); }

  startSession(): void {
    liveCopies.delete(this.directory());
    this.id = randomUUID();
    liveCopies.add(this.directory());
    this.lastRevision = -1;
    this.assetSignature = '';
    this.drafts = null;
    this.failed = false;
    this.projectId = null;
  }

  observeProject(projectId: string): void { this.projectId = projectId; }
  hasDifferentProject(projectId: string): boolean {
    return this.projectId !== null && this.projectId !== projectId;
  }

  dispose(): void { liveCopies.delete(this.directory()); }

  getDrafts(): RecoveryDrafts | null { return this.drafts; }

  async clear(): Promise<void> {
    await rm(this.directory(), { recursive: true, force: true });
    this.lastRevision = -1;
    this.assetSignature = '';
    this.drafts = null;
  }

  async capture(
    context: EditorWindowContext,
    result: EngineMutationResult,
    drafts?: RecoveryDrafts,
  ): Promise<void> {
    this.observeProject(result.project.id);
    const draftChanged = drafts !== undefined && JSON.stringify(drafts) !== JSON.stringify(this.drafts);
    if (drafts !== undefined) this.drafts = drafts;
    const hasDrafts = Boolean(this.drafts && (this.drafts.code.length || this.drafts.form || this.drafts.projectName));
    const dirty = context.projectFileSession.snapshot().isDirty;
    // Opening an untouched empty window should not create a recovery prompt.
    if (!hasDrafts && result.session.revision === 0 && this.lastRevision === -1) return;
    try {
      if (!dirty && !hasDrafts) {
        if (this.lastRevision !== -1) await this.clear();
      } else if (draftChanged || result.session.revision !== this.lastRevision || this.failed) {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await canonicalizeProjectRootPath(this.root);
        await mkdir(this.directory(), { recursive: true, mode: 0o700 });
        await canonicalizeProjectRootPath(this.directory());
        const location = await context.projectStorageSession.assetImportLocation(
          context.projectFileSession.getProjectRootPath(),
        );
        const staging = await context.projectStorageSession.backendSavePath(this.directory());
        await context.backendClient.request({ method: 'project.checkpoint', params: { filePath: staging } });
        const signature = JSON.stringify([location.previewProjectFilePath, result.assets.map((asset) => asset.id).sort()]);
        await publishProjectSnapshot(
          staging,
          this.directory(),
          (contents, root) => context.assetPreviewService.validateProjectSnapshotAtRoot(contents, root),
          signature === this.assetSignature ? null : path.dirname(location.previewProjectFilePath),
        );
        // Drafts remain inert text and never bypass the normal editor parser.
        await atomicPublishManifest(
          Buffer.from(JSON.stringify(this.drafts ?? { projectId: result.project.id, code: [] })),
          path.join(this.directory(), DRAFT_FILE),
        );
        this.assetSignature = signature;
        this.lastRevision = result.session.revision;
      }
      this.failed = false;
    } catch (error) {
      this.failed = true;
      console.error('[project-recovery] checkpoint failed; previous copy retained', error);
    }
    result.session.recoveryFailed = this.failed;
  }

  async candidates(includeOwnCopy = false): Promise<{ id: string; name: string; updated: number }[]> {
    try {
      await canonicalizeProjectRootPath(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const candidates: { id: string; name: string; updated: number }[] = [];
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name)) continue;
      const directory = path.join(this.root, entry.name);
      if (liveCopies.has(directory) && !(includeOwnCopy && directory === this.directory())) continue;
      try {
        await canonicalizeProjectRootPath(directory);
        const manifest = projectManifestPath(directory);
        const contents = JSON.parse((await readStableManifestBytes(manifest)).toString('utf8'));
        const name = contents.project?.name;
        if (typeof name !== 'string') continue;
        candidates.push({ id: entry.name, name, updated: (await lstat(manifest)).mtimeMs });
      } catch (error) {
        console.error('[project-recovery] invalid copy preserved for inspection', error);
      }
    }
    return candidates.sort((a, b) => b.updated - a.updated);
  }

  async offer(context: EditorWindowContext, language: EditorLanguage, notifyIfEmpty = false): Promise<ProjectFileOperationResult> {
    const zh = language === 'zh-CN';
    const candidates = await this.candidates(notifyIfEmpty);
    if (notifyIfEmpty && candidates.length === 0) {
      await dialog.showMessageBox(context.editorWindow, {
        type: 'info',
        message: zh ? '没有待恢复的项目副本' : 'No projects need recovery',
        buttons: [zh ? '确定' : 'OK'],
      });
    }
    for (const candidate of candidates) {
      const choice = await dialog.showMessageBox(context.editorWindow, {
        type: 'question',
        title: zh ? '恢复未保存的项目' : 'Recover unsaved project',
        message: candidate.name,
        detail: zh
          ? `恢复副本：${new Date(candidate.updated).toLocaleString('zh-CN')}\n恢复后请另存为项目。原工程保持不变。`
          : `Recovery copy: ${new Date(candidate.updated).toLocaleString('en-US')}\nSave the recovered project to a new folder. The original project is preserved.`,
        buttons: zh ? ['恢复', '下一个', '删除此副本', '稍后处理'] : ['Restore', 'Next', 'Delete this copy', 'Later'],
        defaultId: 0, cancelId: 3, noLink: true,
      });
      if (choice.response === 3) break;
      const directory = path.join(this.root, candidate.id);
      if (choice.response === 2) {
        await rm(directory, { recursive: true, force: true });
        continue;
      }
      if (choice.response !== 0) continue;
      await canonicalizeProjectRootPath(directory);
      const manifest = await context.projectStorageSession.restoreRecovery(
        projectManifestPath(directory),
        (contents, root) => context.assetPreviewService.validateProjectSnapshotAtRoot(contents, root),
      );
      let prepared;
      let result: EngineMutationResult;
      try {
        prepared = await context.assetPreviewService.prepareProjectFile(manifest);
        result = await context.backendClient.request({ method: 'project.open', params: { contents: prepared.manifestContents } });
      } catch (error) {
        await rm(path.dirname(manifest), { recursive: true, force: true });
        throw error;
      }
      await context.projectStorageSession.adoptRecoveredWorkspace(manifest);
      await context.assetPreviewService.activateProjectFile(manifest, result, prepared, true);
      this.startSession();
      liveCopies.delete(this.directory());
      this.id = candidate.id;
      this.observeProject(result.project.id);
      liveCopies.add(this.directory());
      try {
        const raw = JSON.parse((await readStableManifestBytes(path.join(directory, DRAFT_FILE))).toString('utf8'));
        if (isRecoveryDrafts(raw) && raw.projectId === result.project.id) this.drafts = raw;
      } catch { /* The valid project remains recoverable without draft text. */ }
      const session = context.projectFileSession.markCreated(result.session);
      result.session = { ...result.session, isDirty: true, savedRevision: null };
      updateWindowDocumentPresentation(context.editorWindow, result.project.name, session, language);
      return { cancelled: false, result, session };
    }
    return { cancelled: true, session: context.projectFileSession.snapshot() };
  }
}

export async function checkpointRecovery(context: EditorWindowContext, result: EngineMutationResult, clearDrafts = false): Promise<void> {
  await context.recoveryService?.capture(context, result,
    clearDrafts ? { projectId: result.project.id, code: [] } : undefined);
}
