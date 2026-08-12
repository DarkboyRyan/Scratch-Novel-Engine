export type WindowRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CASCADE_OFFSET = 32;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

// 新项目窗口需要和来源窗口明显错开，同时不能被放到当前显示器之外。
// 四个候选方向中选择实际错开距离最大的一个；靠近屏幕边缘时会自动
// 改用相反方向。
export function cascadedEditorWindowPosition(
  source: WindowRectangle,
  targetSize: Pick<WindowRectangle, 'width' | 'height'>,
  workArea: WindowRectangle,
): { x: number; y: number } {
  const maximumX = workArea.x + workArea.width - targetSize.width;
  const maximumY = workArea.y + workArea.height - targetSize.height;
  const offsets = [
    [CASCADE_OFFSET, CASCADE_OFFSET],
    [-CASCADE_OFFSET, CASCADE_OFFSET],
    [CASCADE_OFFSET, -CASCADE_OFFSET],
    [-CASCADE_OFFSET, -CASCADE_OFFSET],
  ] as const;

  return offsets
    .map(([offsetX, offsetY]) => ({
      x: clamp(source.x + offsetX, workArea.x, maximumX),
      y: clamp(source.y + offsetY, workArea.y, maximumY),
    }))
    .reduce((best, candidate) => {
      const bestDistance =
        (best.x - source.x) ** 2 + (best.y - source.y) ** 2;
      const candidateDistance =
        (candidate.x - source.x) ** 2 +
        (candidate.y - source.y) ** 2;
      return candidateDistance > bestDistance ? candidate : best;
    });
}
