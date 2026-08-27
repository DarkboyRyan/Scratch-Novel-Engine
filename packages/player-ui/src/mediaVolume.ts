/**
 * 主要作用：规范化主音量并计算各媒体通道的有效音量。
 * 关键函数与实现：`clampMediaVolume`、`effectiveMediaVolume`；以 TypeScript 类型边界和可组合函数实现。
 */
export function clampMediaVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

export function effectiveMediaVolume(
  masterVolume: number,
  channelVolume: number,
): number {
  return clampMediaVolume(masterVolume) * clampMediaVolume(channelVolume);
}
