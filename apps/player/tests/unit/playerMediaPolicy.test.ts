import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  playerMediaMagicMatches,
  type PlayerMediaMime,
} from '../../src/main/media/mediaPolicy';

const MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d,
  0x6d, 0x70, 0x34, 0x32,
]);

const WEBM = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x87,
  0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
]);

const MP3 = Buffer.alloc(417);
MP3.set([0xff, 0xfb, 0x90, 0x64]);

const WAV = Buffer.alloc(48);
WAV.write('RIFF', 0, 'ascii');
WAV.writeUInt32LE(WAV.length - 8, 4);
WAV.write('WAVE', 8, 'ascii');
WAV.write('fmt ', 12, 'ascii');
WAV.writeUInt32LE(16, 16);
WAV.writeUInt16LE(1, 20);
WAV.writeUInt16LE(1, 22);
WAV.writeUInt32LE(8_000, 24);
WAV.writeUInt32LE(16_000, 28);
WAV.writeUInt16LE(2, 32);
WAV.writeUInt16LE(16, 34);
WAV.write('data', 36, 'ascii');
WAV.writeUInt32LE(4, 40);

const OPUS_PACKET = Buffer.alloc(19);
OPUS_PACKET.write('OpusHead', 0, 'ascii');
OPUS_PACKET[8] = 1;
OPUS_PACKET[9] = 2;
OPUS_PACKET.writeUInt32LE(48_000, 12);
const OGG_OPUS = Buffer.alloc(27 + 1 + OPUS_PACKET.length);
OGG_OPUS.write('OggS', 0, 'ascii');
OGG_OPUS[4] = 0;
OGG_OPUS[5] = 0x02;
OGG_OPUS[14] = 1;
OGG_OPUS[26] = 1;
OGG_OPUS[27] = OPUS_PACKET.length;
OPUS_PACKET.copy(OGG_OPUS, 28);

const temporaryDirectories: string[] = [];

async function magicMatches(
  mime: PlayerMediaMime,
  contents: Buffer,
): Promise<boolean> {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-player-magic-'));
  temporaryDirectories.push(root);
  const filePath = path.join(root, 'media');
  await writeFile(filePath, contents);
  const file = await open(filePath, 'r');
  try {
    return await playerMediaMagicMatches(file, mime, contents.length);
  } finally {
    await file.close();
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Player media content policy', () => {
  it.each([
    { label: 'MP4', mime: 'video/mp4' as const, contents: MP4 },
    { label: 'WebM', mime: 'video/webm' as const, contents: WEBM },
    { label: 'MP3', mime: 'audio/mpeg' as const, contents: MP3 },
    { label: 'WAV', mime: 'audio/wav' as const, contents: WAV },
    { label: 'Ogg Opus', mime: 'audio/ogg' as const, contents: OGG_OPUS },
  ])('accepts a structurally valid $label header', async ({ mime, contents }) => {
    await expect(magicMatches(mime, contents)).resolves.toBe(true);
  });

  it.each([
    {
      label: 'MP4 carrying a HEIF brand',
      mime: 'video/mp4' as const,
      contents: Buffer.from([
        0x00, 0x00, 0x00, 0x10,
        0x66, 0x74, 0x79, 0x70,
        0x68, 0x65, 0x69, 0x63,
        0x00, 0x00, 0x00, 0x00,
      ]),
    },
    {
      label: 'MP4 with a truncated declared box',
      mime: 'video/mp4' as const,
      contents: MP4.subarray(0, 16),
    },
    {
      label: 'WebM with malformed bytes after a forged DocType',
      mime: 'video/webm' as const,
      contents: Buffer.from([
        0x1a, 0x45, 0xdf, 0xa3, 0x94,
        0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
      ]),
    },
    {
      label: 'WebM with a truncated declared EBML header',
      mime: 'video/webm' as const,
      contents: Buffer.from([
        0x1a, 0x45, 0xdf, 0xa3, 0x94,
        0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
      ]),
    },
    {
      label: 'MP3 containing only an ID3 tag',
      mime: 'audio/mpeg' as const,
      contents: Buffer.from([
        0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]),
    },
    {
      label: 'MP3 containing only a forged frame header',
      mime: 'audio/mpeg' as const,
      contents: MP3.subarray(0, 4),
    },
    {
      label: 'WAV containing only RIFF and WAVE markers',
      mime: 'audio/wav' as const,
      contents: WAV.subarray(0, 12),
    },
    {
      label: 'WAV shorter than its declared RIFF size',
      mime: 'audio/wav' as const,
      contents: WAV.subarray(0, WAV.length - 1),
    },
    {
      label: 'Ogg containing only a forged page header',
      mime: 'audio/ogg' as const,
      contents: OGG_OPUS.subarray(0, 27),
    },
    {
      label: 'Ogg with a truncated identification packet',
      mime: 'audio/ogg' as const,
      contents: OGG_OPUS.subarray(0, OGG_OPUS.length - 1),
    },
  ])('rejects $label', async ({ mime, contents }) => {
    await expect(magicMatches(mime, contents)).resolves.toBe(false);
  });
});
