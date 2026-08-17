import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PROJECT_FILE_NAME } from '../../shared/projectFileProtocol';
import {
  canonicalizeProjectRootPath,
  projectManifestPath,
} from './ProjectPathPolicy';
import {
  publishProjectSnapshot,
  type ValidateProjectSnapshot,
} from './ProjectPublisher';

export {
  canonicalizeProjectRootPath,
  createProjectRootInParent,
  projectManifestPath,
  removeProjectRootIfEmpty,
  resolveProjectManifestPath,
  validateProjectRootPath,
} from './ProjectPathPolicy';

type AssetImportLocation = {
  backendProjectFilePath: string;
  previewProjectFilePath: string;
  isTemporary: boolean;
};

type RemoveTemporaryWorkspace = (
  temporaryRootPath: string,
) => Promise<void>;

async function removeTemporaryWorkspace(
  temporaryRootPath: string,
): Promise<void> {
  await rm(temporaryRootPath, { recursive: true, force: true });
}

// Owns only the per-window private workspace lifecycle. Path policy and the
// durable publication transaction live in dedicated, stateless modules.
export class ProjectStorageSession {
  private temporaryRootPath: string | null = null;

  constructor(
    private readonly removeWorkspace: RemoveTemporaryWorkspace =
      removeTemporaryWorkspace,
  ) {}

  private assertTargetOutsideTemporaryWorkspace(targetPath: string): void {
    if (this.temporaryRootPath === null) {
      return;
    }

    const relative = path.relative(this.temporaryRootPath, targetPath);
    const isInsideOrEqual =
      relative === '' ||
      (relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative));
    if (isInsideOrEqual) {
      throw new Error('项目不能保存到编辑器的临时工作区');
    }
  }

  async assetImportLocation(
    savedProjectRootPath: string | null,
  ): Promise<AssetImportLocation> {
    if (savedProjectRootPath === null) {
      const temporaryProjectFilePath =
        await this.ensureTemporaryProjectFilePath();
      return {
        backendProjectFilePath: temporaryProjectFilePath,
        previewProjectFilePath: temporaryProjectFilePath,
        isTemporary: true,
      };
    }

    const logicalRootPath = await canonicalizeProjectRootPath(
      savedProjectRootPath,
    );
    const logicalPath = projectManifestPath(logicalRootPath);
    return {
      backendProjectFilePath: logicalPath,
      previewProjectFilePath: logicalPath,
      isTemporary: false,
    };
  }

  async backendSavePath(targetProjectRootPath: string): Promise<string> {
    const targetRootPath = await canonicalizeProjectRootPath(
      targetProjectRootPath,
    );
    this.assertTargetOutsideTemporaryWorkspace(targetRootPath);
    // C++ always writes to a Main-private manifest. Even later saves to an
    // existing project must cross the publication transaction rather than
    // writing directly over the user's only committed manifest.
    return this.ensureTemporaryProjectFilePath();
  }

  async publishSavedProject(
    backendProjectFilePath: string,
    targetProjectRootPath: string,
    validateBeforeCommit?: ValidateProjectSnapshot,
  ): Promise<void> {
    const targetRootPath = await canonicalizeProjectRootPath(
      targetProjectRootPath,
    );
    this.assertTargetOutsideTemporaryWorkspace(targetRootPath);
    await publishProjectSnapshot(
      backendProjectFilePath,
      targetRootPath,
      validateBeforeCommit,
    );
  }

  async completeSuccessfulSave(
    backendProjectFilePath: string,
  ): Promise<void> {
    if (
      this.temporaryRootPath !== null &&
      path.dirname(path.resolve(backendProjectFilePath)) ===
        this.temporaryRootPath
    ) {
      await this.discardTemporaryWorkspace();
    }
  }

  async discardTemporaryWorkspace(): Promise<void> {
    const temporaryRootPath = this.temporaryRootPath;
    if (temporaryRootPath !== null) {
      // Detach first. Even if best-effort cleanup fails, a later project must
      // never reuse a workspace that may contain stale manifests or Assets.
      this.temporaryRootPath = null;
      await this.removeWorkspace(temporaryRootPath);
    }
  }

  async dispose(): Promise<void> {
    await this.discardTemporaryWorkspace();
  }

  private async ensureTemporaryProjectFilePath(): Promise<string> {
    if (this.temporaryRootPath === null) {
      const temporaryBase = await realpath(tmpdir());
      this.temporaryRootPath = await mkdtemp(
        path.join(temporaryBase, 'vn-engine-project-'),
      );
    }
    return path.join(this.temporaryRootPath, PROJECT_FILE_NAME);
  }
}
