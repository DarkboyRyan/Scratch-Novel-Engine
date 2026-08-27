/**
 * 主要作用：在退出前只执行一次设置刷盘并处理并发退出事件。
 * 关键函数与实现：`PlayerQuitEvent`、`PlayerSettingsQuitCoordinatorOptions`、`PlayerSettingsQuitCoordinator`；基于 Electron Main 与 Node.js 安全文件/协议边界实现。
 */
export type PlayerQuitEvent = {
  preventDefault(): void;
};

export type PlayerSettingsQuitCoordinatorOptions = {
  flushSettings: () => Promise<void>;
  quit: () => void;
  cleanup: () => void;
  reportError?: (error: unknown) => void;
};

type QuitState = 'running' | 'flushing' | 'flushed';

/**
 * Keeps every quit request blocked until the settings queue has drained.
 * Electron can emit more than one before-quit event while the first request is
 * waiting, so a boolean "quit requested" flag is not sufficient here.
 */
export class PlayerSettingsQuitCoordinator {
  private state: QuitState = 'running';
  private cleaned = false;

  constructor(private readonly options: PlayerSettingsQuitCoordinatorOptions) {}

  handleBeforeQuit(event: PlayerQuitEvent): void {
    if (this.state === 'flushed') {
      this.cleanupOnce();
      return;
    }

    event.preventDefault();
    if (this.state === 'flushing') {
      return;
    }

    this.state = 'flushing';
    void this.options.flushSettings()
      .catch((error: unknown) => {
        this.options.reportError?.(error);
      })
      .finally(() => {
        this.state = 'flushed';
        this.options.quit();
      });
  }

  private cleanupOnce(): void {
    if (this.cleaned) {
      return;
    }
    this.cleaned = true;
    this.options.cleanup();
  }
}
