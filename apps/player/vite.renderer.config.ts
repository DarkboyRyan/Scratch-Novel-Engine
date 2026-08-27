/**
 * 主要作用：定义桌面 Renderer 的 React/Vite 配置与工作区依赖策略。
 * 关键函数与实现：defineConfig、React 插件、optimizeDeps；以 TypeScript 类型边界和可组合函数实现。
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Keep local workspace sources live instead of serving stale pre-bundled
  // exports after Runtime or shared Player UI changes during development.
  optimizeDeps: {
    exclude: ['@vnengine/runtime', '@vnengine/player-ui'],
  },
});
