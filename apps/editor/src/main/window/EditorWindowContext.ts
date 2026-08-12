import type { BrowserWindow } from 'electron';

import type { AssetPreviewService } from '../assets/AssetPreviewService';
import type { BackendClient } from '../backend/backendClient';
import type { ProjectFileSession } from '../project/ProjectFileSession';
import type { FileOperationCoordinator } from './FileOperationCoordinator';

// 每个编辑器窗口都必须拥有独立的 C++ 子进程和文件会话。
// 这样“新建项目”打开第二个窗口时，两个项目不会覆盖彼此的数据或路径。
export type EditorWindowContext = {
  editorWindow: BrowserWindow;
  backendClient: BackendClient;
  assetPreviewService: AssetPreviewService;
  projectFileSession: ProjectFileSession;
  fileOperationCoordinator: FileOperationCoordinator;
};

export type EditorWindowContexts = Map<number, EditorWindowContext>;
