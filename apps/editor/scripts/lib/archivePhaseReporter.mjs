/**
 * 主要作用：仅在受控 GitHub Actions Editor 内部归档流程中记录固定失败阶段。
 * 关键函数与实现：`recordEditorArchivePhase`；只允许固定枚举并向 GITHUB_OUTPUT 写入单行标记。
 */
import { appendFileSync } from 'node:fs';

const ARCHIVE_PHASE_REPORT_MODE = 'github-output';
const ARCHIVE_PHASE_OUTPUT_NAME = 'editor_archive_phase';

export const EDITOR_ARCHIVE_PHASES = Object.freeze([
  'input',
  'create',
  'zip-verify',
  'extract-verify',
  'cleanup',
]);

const archivePhaseSet = new Set(EDITOR_ARCHIVE_PHASES);

export function recordEditorArchivePhase(phase, environment = process.env) {
  if (!archivePhaseSet.has(phase)) {
    throw new Error('无效的 Editor 归档阶段');
  }
  if (
    environment.VN_EDITOR_ARCHIVE_PHASE_REPORT !== ARCHIVE_PHASE_REPORT_MODE ||
    environment.GITHUB_ACTIONS !== 'true' ||
    typeof environment.GITHUB_OUTPUT !== 'string' ||
    environment.GITHUB_OUTPUT.length === 0
  ) {
    return false;
  }
  try {
    appendFileSync(
      environment.GITHUB_OUTPUT,
      `${ARCHIVE_PHASE_OUTPUT_NAME}=${phase}\n`,
      { encoding: 'utf8' },
    );
    return true;
  } catch {
    // A best-effort diagnostic must never turn a valid archive into a failure.
    return false;
  }
}
