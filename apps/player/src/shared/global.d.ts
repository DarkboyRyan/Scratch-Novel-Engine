/**
 * 主要作用：为 Renderer 声明 Preload 注入的 window.vnPlayer 类型。
 * 关键函数与实现：模块入口与类型契约；以 TypeScript 类型边界和可组合函数实现。
 */
import type { VnPlayerApi } from './playerProtocol';

declare global {
  interface Window {
    vnPlayer: VnPlayerApi;
  }
}

export {};
