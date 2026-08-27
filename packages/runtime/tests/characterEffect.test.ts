/**
 * 主要作用：验证人物特效严格字段、类型、枚举与时长边界。
 * 关键函数与实现：测试套件“character effect contract”；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { describe, expect, it } from 'vitest';

import {
  isCharacterEffect,
  MAX_CHARACTER_EFFECT_DURATION_MS,
  MIN_CHARACTER_EFFECT_DURATION_MS,
} from '../src';

describe('character effect contract', () => {
  it('accepts every supported effect at the duration boundaries', () => {
    expect(isCharacterEffect({
      type: 'shake',
      durationMs: MIN_CHARACTER_EFFECT_DURATION_MS,
      intensity: 'subtle',
    })).toBe(true);
    expect(isCharacterEffect({
      type: 'fadeOut',
      durationMs: MAX_CHARACTER_EFFECT_DURATION_MS,
    })).toBe(true);
    expect(isCharacterEffect({
      type: 'slideIn',
      durationMs: 700,
      intensity: 'strong',
      direction: 'down',
    })).toBe(true);
  });

  it('rejects invalid ranges, variant fields, and unknown values', () => {
    expect(isCharacterEffect({
      type: 'jump',
      durationMs: MIN_CHARACTER_EFFECT_DURATION_MS - 1,
      intensity: 'normal',
    })).toBe(false);
    expect(isCharacterEffect({
      type: 'fadeIn',
      durationMs: 500,
      intensity: 'normal',
    })).toBe(false);
    expect(isCharacterEffect({
      type: 'slideIn',
      durationMs: 500,
      intensity: 'normal',
      direction: 'diagonal',
    })).toBe(false);
    expect(isCharacterEffect({
      type: 'spin',
      durationMs: 500,
      intensity: 'strong',
    })).toBe(false);
  });
});
