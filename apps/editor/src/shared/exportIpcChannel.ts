// Keep the Preload runtime dependency surface intentionally tiny. In
// particular, this module must never import filename/path validation helpers:
// sandboxed Electron Preloads cannot load arbitrary Node built-ins.
export const EXPORT_GAME_IPC_CHANNEL = 'vn-game-export:request';
