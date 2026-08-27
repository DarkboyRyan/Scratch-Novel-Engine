// 主要作用：解析开发版和打包版 C++ 后端可执行文件的位置。
// 关键实现：resolveBackendPath 处理平台路径，assertBackendIsExecutable 校验权限。
import { accessSync, constants, existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

function executableName(): string {
  return process.platform === 'win32'
    ? 'vn_engine_backend.exe'
    : 'vn_engine_backend';
}

export function resolveBackendPath(): string {
  // 本地调试或 CI 可以通过环境变量覆盖 CMake 产物路径。
  const overridePath = process.env.VN_ENGINE_BACKEND_PATH;

  if (overridePath) {
    return path.resolve(overridePath);
  }

  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'backend',
      executableName(),
    );
  }

  const engineBuildDirectory = path.resolve(
    app.getAppPath(),
    '../../engine/build',
  );
  const candidates = [
    path.join(engineBuildDirectory, executableName()),
    path.join(engineBuildDirectory, 'Debug', executableName()),
    path.join(engineBuildDirectory, 'Release', executableName()),
  ];

  return (
    candidates.find((candidate) => existsSync(candidate)) ??
    candidates[0]
  );
}

export function assertBackendIsExecutable(
  backendPath: string,
): void {
  try {
    accessSync(
      backendPath,
      process.platform === 'win32' ? constants.F_OK : constants.X_OK,
    );
  } catch {
    throw new Error(
      `找不到可执行的 C++ 后端：${backendPath}。请先运行 pnpm engine:build。`,
    );
  }
}
