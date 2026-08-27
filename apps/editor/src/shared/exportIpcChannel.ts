// 主要作用：提供 Preload 可安全导入的最小导出 IPC 通道常量。
// 关键实现：隔离 Node 相关导出校验依赖，保持沙箱桥接入口可加载。
// Keep the Preload runtime dependency surface intentionally tiny. In
// particular, this module must never import filename/path validation helpers:
// sandboxed Electron Preloads cannot load arbitrary Node built-ins.
export const EXPORT_GAME_IPC_CHANNEL = 'vn-game-export:request';
