/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StartupScreen } from '../../src/renderer/components/StartupScreen';

it('announces startup stages and offers retry without reporting completion after an error', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const retry = vi.fn();
  try {
    await act(async () => root.render(<StartupScreen phase="settings" language="en-US" />));
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Reading editor settings…');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');

    await act(async () => root.render(<StartupScreen phase="project" language="zh-CN" />));
    expect(container.querySelector('[role="status"]')?.textContent).toBe('正在准备项目与恢复会话…');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(container.querySelector('button')).toBeNull();

    await act(async () => root.render(
      <StartupScreen phase="session" language="zh-CN" error="连接中断" onRetry={retry} />,
    ));
    const progress = container.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute('aria-valuenow')).toBe('85');
    expect(progress?.getAttribute('aria-busy')).toBe('false');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('连接中断');
    await act(async () => container.querySelector('button')!.click());
    expect(retry).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
  }
});
