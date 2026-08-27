/** @vitest-environment jsdom */
/**
 * 主要作用：验证浏览器显示能力不足时选项状态与提交行为。
 * 关键函数与实现：测试套件“Web options display capabilities”、`containers`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsDialog } from '@vnengine/player-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PLAYER_SETTINGS } from '../../src/shared/playerProtocol';

const containers: HTMLElement[] = [];

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

describe('Web options display capabilities', () => {
  it('enables browser fullscreen and disables unsupported window sizing', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <OptionsDialog
          settings={{ ...DEFAULT_PLAYER_SETTINGS }}
          fullscreenControlsEnabled={true}
          windowSizeControlsEnabled={false}
          onPreviewSettingsChange={vi.fn()}
          onCommitSettings={vi.fn()}
          onReset={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    expect(
      container.querySelector<HTMLSelectElement>('select[aria-label="窗口模式"]')
        ?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLSelectElement>('select[aria-label="窗口尺寸"]')
        ?.disabled,
    ).toBe(true);
    expect(container.textContent).toContain(
      '浏览器支持全屏；窗口尺寸由浏览器和操作系统控制。',
    );
    await act(async () => root.unmount());
  });
});
