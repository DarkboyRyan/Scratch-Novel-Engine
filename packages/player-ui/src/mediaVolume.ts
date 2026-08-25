export function clampMediaVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

export function effectiveMediaVolume(
  masterVolume: number,
  channelVolume: number,
): number {
  return clampMediaVolume(masterVolume) * clampMediaVolume(channelVolume);
}
