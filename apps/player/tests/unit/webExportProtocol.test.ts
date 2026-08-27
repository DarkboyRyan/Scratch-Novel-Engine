/**
 * 主要作用：验证 Web 导出描述文件的严格字段和版本兼容范围。
 * 关键函数与实现：测试套件“Web export descriptor”、`validDescriptor`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { describe, expect, it } from 'vitest';

import { parseWebExportDescriptor } from '../../src/shared/webExportProtocol';

const validDescriptor = {
  format: 'vn-engine-web-export',
  webExportVersion: 1,
  runtimeVersion: 6,
  playerCompatibility: '>=6 <7',
  gameRoot: 'game/550e8400-e29b-41d4-a716-446655440000',
};

describe('Web export descriptor', () => {
  it('accepts the exact v1 contract', () => {
    expect(parseWebExportDescriptor(JSON.stringify(validDescriptor))).toEqual(
      validDescriptor,
    );
    expect(parseWebExportDescriptor(JSON.stringify({
      ...validDescriptor,
      runtimeVersion: 10,
      playerCompatibility: '>=10 <11',
    }))).toMatchObject({
      runtimeVersion: 10,
      playerCompatibility: '>=10 <11',
    });
  });

  it('rejects unknown fields, mismatched compatibility, and unsafe roots', () => {
    expect(() => parseWebExportDescriptor(JSON.stringify({
      ...validDescriptor,
      privatePath: '/private/game',
    }))).toThrow('字段不符合');
    expect(() => parseWebExportDescriptor(JSON.stringify({
      ...validDescriptor,
      playerCompatibility: '>=1',
    }))).toThrow('兼容范围无效');
    expect(() => parseWebExportDescriptor(JSON.stringify({
      ...validDescriptor,
      runtimeVersion: 11,
      playerCompatibility: '>=11 <12',
    }))).toThrow('版本或格式不受支持');
    for (const gameRoot of [
      '/game/build',
      'game/../build',
      'game/build/child',
      'game/build%2Fchild',
      'game/build?next',
      'game/build#part',
      'game\\build',
    ]) {
      expect(() => parseWebExportDescriptor(JSON.stringify({
        ...validDescriptor,
        gameRoot,
      }))).toThrow('不是安全的游戏路径');
    }
  });
});
