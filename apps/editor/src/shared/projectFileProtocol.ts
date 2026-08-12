import type { EngineMutationResult } from './engineProtocol';

// Renderer 只能表达文件操作意图；所有本机路径都由 Electron Main 的原生
// 对话框产生，并且永远不会作为 IPC 参数从 Renderer 传入。
export const PROJECT_FILE_IPC_CHANNEL = 'vn-project-files:request';
export const PROJECT_FILE_COMMAND_CHANNEL = 'vn-project-files:command';
export const PROJECT_FILE_NAME = 'project.vn.json';

export type ProjectFileInvocation =
  | {
      action: 'create';
      params: {
        name?: string;
      };
    }
  | {
      action: 'open';
      params: Record<string, never>;
    }
  | {
      action: 'save';
      params: Record<string, never>;
    }
  | {
      action: 'get-session';
      params: Record<string, never>;
    };

// C++ 管理 revision；Electron Main 为当前窗口补上磁盘路径。
export type ProjectFileSessionSnapshot = {
  filePath: string | null;
  revision: number;
  savedRevision: number | null;
  isDirty: boolean;
};

export type ProjectFileCompletedResult = {
  cancelled: false;
  result: EngineMutationResult;
  session: ProjectFileSessionSnapshot;
};

export type ProjectFileCancelledResult = {
  cancelled: true;
  session: ProjectFileSessionSnapshot;
};

export type ProjectFileOperationResult =
  | ProjectFileCompletedResult
  | ProjectFileCancelledResult;

export type CreateProjectWindowResult = {
  opened: true;
};

export type ProjectFileResponse =
  | CreateProjectWindowResult
  | ProjectFileOperationResult
  | ProjectFileSessionSnapshot;

export type ProjectFileCommand = 'new' | 'open' | 'save';

export type VnProjectFilesApi = {
  createProject(name?: string): Promise<CreateProjectWindowResult>;
  openProject(): Promise<ProjectFileOperationResult>;
  saveProject(): Promise<ProjectFileOperationResult>;
  getSession(): Promise<ProjectFileSessionSnapshot>;
  onCommand(listener: (command: ProjectFileCommand) => void): () => void;
};
