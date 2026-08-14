import type { EngineSessionState } from '../../shared/engineProtocol';
import type { ProjectFileSessionSnapshot } from '../../shared/projectFileProtocol';
import { PROJECT_FILE_NAME } from '../../shared/projectFileProtocol';
import path from 'node:path';

// 项目目录路径只属于 Electron Main 窗口会话，绝不进入公开 snapshot。
// revision 则由该窗口独享的 C++ 后端计算。
export class ProjectFileSession {
  private projectRootPath: string | null = null;
  private logicalSavedRevision: number | null = null;
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

  markCreated(engineSession: EngineSessionState): ProjectFileSessionSnapshot {
    this.projectRootPath = null;
    this.logicalSavedRevision = null;
    this.applyEngineRevision(engineSession);
    return this.snapshot();
  }

  markOpened(
    projectRootPath: string,
    engineSession: EngineSessionState,
  ): ProjectFileSessionSnapshot {
    this.projectRootPath = projectRootPath;
    this.logicalSavedRevision =
      engineSession.savedRevision ?? engineSession.revision;
    this.applyEngineRevision(engineSession);
    return this.snapshot();
  }

  markSaved(
    projectRootPath: string,
    engineSession: EngineSessionState,
  ): ProjectFileSessionSnapshot {
    this.projectRootPath = projectRootPath;
    this.logicalSavedRevision = engineSession.revision;
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
