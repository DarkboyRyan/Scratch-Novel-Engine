/**
 * 文件主要作用：验证 MediaFormat、parseSingleByteRange 的行为。
 * 测试覆盖：`MediaFormat`、`parseSingleByteRange`。
 */

import { describe, expect, it } from 'vitest';

import {
  canonicalAssetExtension,
  maximumPreviewBytes,
  previewMimeForAsset,
} from '../../src/main/media/MediaFormat';
import { parseSingleByteRange } from '../../src/main/media/MediaRange';

describe('MediaFormat', () => {
  it('canonicalizes supported import extensions without weakening type binding', () => {
    expect(canonicalAssetExtension('image', '/tmp/portrait.JPEG')).toBe('.jpg');
    expect(canonicalAssetExtension('image', '/tmp/portrait.webp')).toBe('.webp');
    expect(canonicalAssetExtension('video', '/tmp/opening.WEBM')).toBe('.webm');
    expect(canonicalAssetExtension('audio', '/tmp/theme.MP3')).toBe('.mp3');
    expect(canonicalAssetExtension('image', '/tmp/opening.mp4')).toBeNull();
    expect(canonicalAssetExtension('audio', '/tmp/theme.flac')).toBeNull();
  });

  it('maps only type-compatible project paths to preview MIME types', () => {
    expect(previewMimeForAsset('image', 'assets/images/a.jpeg')).toBe(
      'image/jpeg',
    );
    expect(previewMimeForAsset('audio', 'assets/audio/a.OGG')).toBe(
      'audio/ogg',
    );
    expect(previewMimeForAsset('video', 'assets/videos/a.mp4')).toBe(
      'video/mp4',
    );
    expect(previewMimeForAsset('image', 'assets/images/a.mp4')).toBeNull();
  });

  it('keeps the existing per-type byte limits', () => {
    expect(maximumPreviewBytes('image')).toBe(128 * 1024 * 1024);
    expect(maximumPreviewBytes('audio')).toBe(512 * 1024 * 1024);
    expect(maximumPreviewBytes('video')).toBe(2 * 1024 * 1024 * 1024);
  });
});

describe('parseSingleByteRange', () => {
  it('parses bounded, open-ended, and suffix ranges', () => {
    expect(parseSingleByteRange('bytes=4-11', 24)).toEqual({
      start: 4,
      end: 11,
    });
    expect(parseSingleByteRange('bytes=20-', 24)).toEqual({
      start: 20,
      end: 23,
    });
    expect(parseSingleByteRange('bytes=-4', 24)).toEqual({
      start: 20,
      end: 23,
    });
  });

  it('clamps valid ranges to the current file size', () => {
    expect(parseSingleByteRange('bytes=4-99', 24)).toEqual({
      start: 4,
      end: 23,
    });
    expect(parseSingleByteRange('bytes=-99', 24)).toEqual({
      start: 0,
      end: 23,
    });
  });

  it.each([
    'bytes=',
    'bytes=-0',
    'bytes=24-',
    'bytes=8-4',
    'bytes=0-1,4-5',
    'items=0-1',
    'bytes=9007199254740992-',
  ])('rejects an unsupported or unsafe range: %s', (header) => {
    expect(parseSingleByteRange(header, 24)).toBeNull();
  });
});
