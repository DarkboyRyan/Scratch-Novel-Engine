/**
 * 主要作用：验证 Web Player 的入口、base 和模板输出配置。
 * 关键函数与实现：测试套件“Web Player Vite template configuration”；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import webConfig from '../../vite.web.config';

describe('Web Player Vite template configuration', () => {
  it('builds a relocatable payload with all generated assets isolated', () => {
    expect(webConfig.base).toBe('./');
    expect(webConfig.root).toBe(path.resolve('src/web'));
    expect(webConfig.build).toMatchObject({
      outDir: path.resolve('.vite/web-player/payload'),
      emptyOutDir: true,
      assetsDir: 'player-assets',
      copyPublicDir: false,
      sourcemap: false,
    });
    expect(webConfig.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining(['@vnengine/runtime', '@vnengine/player-ui']),
    );
  });
});
