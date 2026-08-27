/**
 * 文件主要作用：验证 video block asset slot 的行为。
 * 测试覆盖：`video block asset slot`。
 */

import type * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import {
  getVideoBlockAssetId,
  setVideoBlockAsset,
  VIDEO_BLOCK_FIELDS,
} from '../../src/renderer/features/block-editor/blocks/videoBlock';

describe('video block asset slot', () => {
  it('keeps the private asset ID separate from the displayed file name', () => {
    const fields = new Map<string, string>();
    const block = {
      data: null,
      setFieldValue: (value: string, name: string) => fields.set(name, value),
    } as unknown as Blockly.Block;

    setVideoBlockAsset(block, 'video-1', 'opening.mp4');

    expect(getVideoBlockAssetId(block)).toBe('video-1');
    expect(fields.get(VIDEO_BLOCK_FIELDS.assetName)).toBe('opening.mp4');
  });

  it('clears an unassigned slot without inventing an asset ID', () => {
    const fields = new Map<string, string>();
    const block = {
      data: 'vn-video-asset:old-video',
      setFieldValue: (value: string, name: string) => fields.set(name, value),
    } as unknown as Blockly.Block;

    setVideoBlockAsset(block, null);

    expect(getVideoBlockAssetId(block)).toBeNull();
    expect(fields.get(VIDEO_BLOCK_FIELDS.assetName)?.trim()).toBe('');
  });
});
