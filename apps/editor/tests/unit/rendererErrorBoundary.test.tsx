/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 RendererErrorBoundary 的行为。
 * 测试覆盖：`RendererErrorBoundary`。
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RendererErrorBoundary } from '../../src/renderer/components/RendererErrorBoundary';

function BrokenSurface(): never {
  throw new Error('/private/project/path must remain internal');
}

describe('RendererErrorBoundary', () => {
  afterEach(() => {
    document.documentElement.lang = '';
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('uses an authoritative language before the document effect commits', async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RendererErrorBoundary language="en-US">
          <BrokenSurface />
        </RendererErrorBoundary>,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'The Editor interface failed to load',
    );
    await act(async () => root.unmount());
  });

  it('keeps a stable path-free recovery screen when a surface crashes', async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RendererErrorBoundary>
          <BrokenSurface />
        </RendererErrorBoundary>,
      );
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('编辑器界面加载失败');
    expect(alert?.textContent).toContain('完全退出并重新启动编辑器');
    expect(alert?.textContent).not.toContain('/private/project/path');
    expect(consoleError).toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
