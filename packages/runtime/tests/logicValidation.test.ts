/**
 * 主要作用：验证逻辑值、变量名、UTF-8 长度和资源预算限制。
 * 关键函数与实现：测试套件“logic value validation”；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { describe, expect, it } from 'vitest';

import {
  isLogicValue,
  isLogicVariableName,
  utf8ByteLength,
} from '../src';

describe('logic value validation', () => {
  it('uses UTF-8 byte limits for multibyte names and values', () => {
    expect(utf8ByteLength('中🙂')).toBe(7);
    expect(isLogicVariableName('中'.repeat(21))).toBe(true);
    expect(isLogicVariableName('中'.repeat(22))).toBe(false);
    expect(isLogicVariableName('🙂'.repeat(16))).toBe(true);
    expect(isLogicVariableName('🙂'.repeat(17))).toBe(false);
    expect(isLogicValue('中'.repeat(1_365))).toBe(true);
    expect(isLogicValue('中'.repeat(1_366))).toBe(false);
  });

  it('trims ASCII edges without rejecting non-ASCII spacing characters', () => {
    expect(isLogicVariableName(' score')).toBe(false);
    expect(isLogicVariableName('score\n')).toBe(false);
    expect(isLogicVariableName('\u00a0score\u00a0')).toBe(true);
  });
});
