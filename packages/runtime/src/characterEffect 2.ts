/**
 * 主要作用：校验人物震动、跳跃、淡入淡出等特效的严格数据契约。
 * 关键函数与实现：`MIN_CHARACTER_EFFECT_DURATION_MS`、`MAX_CHARACTER_EFFECT_DURATION_MS`、`isCharacterEffect`；采用纯 TypeScript 状态转换与严格类型守卫，保持平台无关。
 */
import type { CharacterEffect } from './projectTypes';

export const MIN_CHARACTER_EFFECT_DURATION_MS = 100;
export const MAX_CHARACTER_EFFECT_DURATION_MS = 10_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((field, index) => field === sortedExpected[index]);
}

function isDuration(value: unknown): value is number {
  return Number.isSafeInteger(value) &&
    (value as number) >= MIN_CHARACTER_EFFECT_DURATION_MS &&
    (value as number) <= MAX_CHARACTER_EFFECT_DURATION_MS;
}

function isIntensity(value: unknown): boolean {
  return value === 'subtle' || value === 'normal' || value === 'strong';
}

export function isCharacterEffect(value: unknown): value is CharacterEffect {
  if (!isObject(value) || !isDuration(value.durationMs)) {
    return false;
  }
  if (value.type === 'fadeIn' || value.type === 'fadeOut') {
    return hasExactFields(value, ['type', 'durationMs']);
  }
  if (value.type === 'slideIn') {
    return hasExactFields(
      value,
      ['type', 'durationMs', 'intensity', 'direction'],
    ) &&
      isIntensity(value.intensity) &&
      (
        value.direction === 'left' ||
        value.direction === 'right' ||
        value.direction === 'up' ||
        value.direction === 'down'
      );
  }
  return (
    value.type === 'shake' ||
    value.type === 'jump' ||
    value.type === 'breathe' ||
    value.type === 'flash'
  ) &&
    hasExactFields(value, ['type', 'durationMs', 'intensity']) &&
    isIntensity(value.intensity);
}
