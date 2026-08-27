/**
 * 主要作用：验证并发退出期间设置只刷盘一次并正确续退。
 * 关键函数与实现：测试套件“Player settings quit coordinator”、`deferred`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { describe, expect, it, vi } from 'vitest';

import { PlayerSettingsQuitCoordinator } from '../../src/main/settings/PlayerSettingsQuitCoordinator';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('Player settings quit coordinator', () => {
  it('blocks repeated quit events until the accepted settings queue is flushed', async () => {
    const gate = deferred();
    const flushSettings = vi.fn(() => gate.promise);
    const quit = vi.fn();
    const cleanup = vi.fn();
    const coordinator = new PlayerSettingsQuitCoordinator({
      flushSettings,
      quit,
      cleanup,
    });
    const firstEvent = { preventDefault: vi.fn() };
    const repeatedEvent = { preventDefault: vi.fn() };

    coordinator.handleBeforeQuit(firstEvent);
    coordinator.handleBeforeQuit(repeatedEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(flushSettings).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();

    gate.resolve();
    await gate.promise;
    await Promise.resolve();

    expect(quit).toHaveBeenCalledOnce();
    const finalEvent = { preventDefault: vi.fn() };
    coordinator.handleBeforeQuit(finalEvent);
    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('reports a flush failure but still permits the final quit event', async () => {
    const reportError = vi.fn();
    const quit = vi.fn();
    const coordinator = new PlayerSettingsQuitCoordinator({
      flushSettings: () => Promise.reject(new Error('disk unavailable')),
      quit,
      cleanup: vi.fn(),
      reportError,
    });

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    await Promise.resolve();
    await Promise.resolve();

    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'disk unavailable' }),
    );
    expect(quit).toHaveBeenCalledOnce();
  });
});
