/**
 * 主要作用：定义剧情图片缩放的跨平台范围与校验规则。
 * 关键函数与实现：`isImageScalePercent`；缩放采用整数百分比，避免各宿主产生不同的规范化结果。
 */
export const MIN_IMAGE_SCALE_PERCENT = 10;
export const MAX_IMAGE_SCALE_PERCENT = 300;
export const DEFAULT_IMAGE_SCALE_PERCENT = 100;

export function isImageScalePercent(value: unknown): value is number {
  return Number.isSafeInteger(value) &&
    (value as number) >= MIN_IMAGE_SCALE_PERCENT &&
    (value as number) <= MAX_IMAGE_SCALE_PERCENT;
}
