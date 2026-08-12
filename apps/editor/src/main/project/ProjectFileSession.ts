import type { EngineSessionState } from '../../shared/engineProtocol';
import type { ProjectFileSessionSnapshot } from '../../shared/projectFileProtocol';

// 文件路径属于 Electron 窗口会话，revision 则由该窗口独享的 C++ 后端计算。
// 二者合并后，Renderer 不需要也不能自行持有或构造本机路径。
export class ProjectFileSession {
  private filePath: string | null = null;
  private engineSession: EngineSessionState = {
    revision: 0,
    savedRevision: null,
    isDirty: false,
  };

  snapshot(): ProjectFileSessionSnapshot {
    return {
      filePath: this.filePath,
      ...this.engineSession,
    };
  }

  markCreated(engineSession: EngineSessionState): ProjectFileSessionSnapshot {
    this.filePath = null;
    this.engineSession = engineSession;
    return this.snapshot();
  }

  markOpened(
    filePath: string,
    engineSession: EngineSessionState,
  ): ProjectFileSessionSnapshot {
    this.filePath = filePath;
    this.engineSession = engineSession;
    return this.snapshot();
  }

  markSaved(
    filePath: string,
    engineSession: EngineSessionState,
  ): ProjectFileSessionSnapshot {
    this.filePath = filePath;
    this.engineSession = engineSession;
    return this.snapshot();
  }

  updateEngineSession(
    engineSession: EngineSessionState,
  ): ProjectFileSessionSnapshot {
    this.engineSession = engineSession;
    return this.snapshot();
  }
}
