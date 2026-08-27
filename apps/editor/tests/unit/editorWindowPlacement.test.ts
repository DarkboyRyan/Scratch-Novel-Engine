/**
 * 文件主要作用：验证 editor window placement 的行为。
 * 测试覆盖：`editor window placement`。
 */

import { describe, expect, it } from 'vitest';

import { cascadedEditorWindowPosition } from '../../src/main/window/editorWindowPlacement';

describe('editor window placement', () => {
  it('offsets a new project window from its source window', () => {
    expect(
      cascadedEditorWindowPosition(
        { x: 100, y: 80, width: 1000, height: 700 },
        { width: 1000, height: 700 },
        { x: 0, y: 0, width: 1440, height: 900 },
      ),
    ).toEqual({ x: 132, y: 112 });
  });

  it('chooses an opposite offset instead of leaving the screen', () => {
    const position = cascadedEditorWindowPosition(
      { x: 420, y: 180, width: 1000, height: 700 },
      { width: 1000, height: 700 },
      { x: 0, y: 0, width: 1440, height: 900 },
    );

    expect(position).toEqual({ x: 388, y: 148 });
  });
});
