export const FILE_OPERATION_BUSY_MESSAGE =
  '当前窗口正在执行另一项项目文件操作';

// Native dialogs yield back to Electron's event loop. This per-window guard
// keeps open/save/import from racing while a dialog or backend request is in
// flight, without blocking independent editor windows.
export class FileOperationCoordinator {
  private operationInProgress = false;

  async runExclusive<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    if (this.operationInProgress) {
      throw new Error(FILE_OPERATION_BUSY_MESSAGE);
    }

    this.operationInProgress = true;

    try {
      return await operation();
    } finally {
      this.operationInProgress = false;
    }
  }
}
