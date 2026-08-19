import type { EngineSessionState } from '../../shared/engineProtocol';
import type { ProjectFileSessionSnapshot } from '../../shared/projectFileProtocol';
import { PROJECT_FILE_NAME } from '../../shared/projectFileProtocol';
import { createHash } from 'node:crypto';
import path from 'node:path';

function manifestSha256(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

// 项目目录路径只属于 Electron Main 窗口会话，绝不进入公开 snapshot。
// revision 则由该窗口独享的 C++ 后端计算。
export class ProjectFileSession {
  private projectRootPath: string | null = null;
  private logicalSavedRevision: number | null = null;
  private savedManifestSha256: string | null = null;
  private engineSession: EngineSessionState = {
    revision: 0,
    savedRevision: null,
    isDirty: false,
  };

  snapshot(): ProjectFileSessionSnapshot {
    return {
      hasStorage: this.projectRootPath !== null,
      projectFolderName:
        this.projectRootPath === null
          ? null
          : path.basename(this.projectRootPath),
      ...this.engineSession,
    };
  }

  getProjectRootPath(): string | null {
    return this.projectRootPath;
  }

  getManifestPath(): string | null {
    return this.projectRootPath === null
      ? null
      : path.join(this.projectRootPath, PROJECT_FILE_NAME);
  }

  getSavedManifestSha256(): string | null {
    return this.savedManifestSha256;
  }

  markCreated(engineSession: EngineSessionState): ProjectFileSessionSnapshot {
    this.projectRootPath = null;
    this.logicalSavedRevision = null;
    this.savedManifestSha256 = null;
    this.applyEngineRevision(engineSession);
    return this.snapshot();
  }

  markOpened(
    projectRootPath: string,
    engineSession: EngineSessionState,
    manifestContents?: string,
  ): ProjectFileSessionSnapshot {
    this.projectRootPath = projectRootPath;
    this.logicalSavedRevision =
      engineSession.savedRevision ?? engineSession.revision;
    this.savedManifestSha256 = manifestContents === undefined
      ? null
      : manifestSha256(manifestContents);
    this.applyEngineRevision(engineSession);
    return this.snapshot();
  }

  markSaved(
    projectRootPath: string,
    engineSession: EngineSessionState,
    manifestContents?: string,
  ): ProjectFileSessionSnapshot {
    this.projectRootPath = projectRootPath;
    this.logicalSavedRevision = engineSession.revision;
    this.savedManifestSha256 = manifestContents === undefined
      ? null
      : manifestSha256(manifestContents);
    this.applyEngineRevision(engineSession);
    return this.snapshot();
  }

  updateEngineSession(
    engineSession: EngineSessionState,
  ): ProjectFileSessionSnapshot {
    this.applyEngineRevision(engineSession);
    return this.snapshot();
  }

  private applyEngineRevision(engineSession: EngineSessionState): void {
    // C++ may save to a Main-private working manifest before Electron has
    // safely published it to the user's chosen file. Only mark the document
    // logically saved after markOpened/markSaved commits that external path.
    this.engineSession = {
      revision: engineSession.revision,
      savedRevision: this.logicalSavedRevision,
      isDirty:
        this.logicalSavedRevision === null ||
        engineSession.revision !== this.logicalSavedRevision,
    };
  }
}
