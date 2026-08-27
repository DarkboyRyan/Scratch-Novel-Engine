/**
 * 主要作用：验证 Renderer 不会预构建并缓存本地 workspace 包。
 * 关键函数与实现：测试套件“Player Vite Renderer dependency optimization”；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { describe, expect, it } from 'vitest';

import rendererConfig from '../../vite.renderer.config';

describe('Player Vite Renderer dependency optimization', () => {
  it('keeps live workspace packages out of the pre-bundle cache', () => {
    expect(rendererConfig.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining([
        '@vnengine/runtime',
        '@vnengine/player-ui',
      ]),
    );
  });
});
