/**
 * 文件主要作用：验证 preview audio controller 的行为。
 * 测试覆盖：`preview audio controller`。
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createPreviewAudioController,
  type PreviewAudioElement,
} from '@vnengine/player-ui';
import type { GameRuntime as GamePreviewRuntime } from '@vnengine/runtime';

type MockAudio = PreviewAudioElement & {
  load: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
};

function createMockAudio(): MockAudio {
  return {
    currentTime: 0,
    loop: false,
    src: '',
    volume: 1,
    load: vi.fn(),
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    removeAttribute: vi.fn(function (this: MockAudio, name: string) {
      if (name === 'src') {
        this.src = '';
      }
    }),
  };
}

function runtime(
  dialogueId = 'dialogue-1',
  voiceAssetId: string | null = 'voice-1',
  dialogueSequence = 1,
  bgmSequence = 1,
): GamePreviewRuntime {
  return {
    status: 'playing',
    sceneId: 'scene-1',
    nextNodeIndex: 1,
    backgroundAssetId: null,
    bgmAssetId: 'bgm-1',
    bgmSequence,
    dialogueSequence,
    characterEffectSequence: 0,
    videoAssetId: null,
    videoSequence: 0,
    cgAssetId: null,
    cgLeadInMs: 0,
    cgSequence: 0,
    characters: [],
    dialogue: {
      id: dialogueId,
      type: 'dialogue',
      speaker: 'A',
      text: 'line',
      voiceAssetId,
    },
    choices: [],
    variables: {},
    loopStack: [],
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('preview audio controller', () => {
  it('loops BGM and plays each dialogue voice once', async () => {
    const stableBgm = createMockAudio();
    const stableVoice = createMockAudio();
    const stable = [stableBgm, stableVoice];
    const stableController = createPreviewAudioController({
      createAudio: () => stable.shift()!,
      resolveMediaUrl: async (assetId) => `vn-asset://audio/${assetId}`,
    });

    stableController.sync(runtime());
    await flushPromises();
    expect(stableBgm.loop).toBe(true);
    expect(stableBgm.src).toBe('vn-asset://audio/bgm-1');
    expect(stableBgm.play).toHaveBeenCalledTimes(1);
    expect(stableVoice.loop).toBe(false);
    expect(stableVoice.src).toBe('vn-asset://audio/voice-1');
    expect(stableVoice.play).toHaveBeenCalledTimes(1);

    stableController.sync(runtime('dialogue-2'));
    await flushPromises();
    expect(stableBgm.play).toHaveBeenCalledTimes(1);
    expect(stableVoice.play).toHaveBeenCalledTimes(2);
  });

  it('replays voice when a scene jump revisits the same dialogue', async () => {
    const bgm = createMockAudio();
    const voice = createMockAudio();
    const channels = [bgm, voice];
    const controller = createPreviewAudioController({
      createAudio: () => channels.shift()!,
      resolveMediaUrl: async (assetId) => `vn-asset://audio/${assetId}`,
    });

    controller.sync(runtime('dialogue-1', 'voice-1', 1));
    await flushPromises();
    controller.sync(runtime('dialogue-1', 'voice-1', 2));
    await flushPromises();

    expect(voice.pause).toHaveBeenCalledTimes(2);
    expect(voice.play).toHaveBeenCalledTimes(2);
  });

  it('restarts the same BGM when a later BGM node requests it again', async () => {
    const bgm = createMockAudio();
    const voice = createMockAudio();
    const channels = [bgm, voice];
    const controller = createPreviewAudioController({
      createAudio: () => channels.shift()!,
      resolveMediaUrl: async (assetId) => `vn-asset://audio/${assetId}`,
    });

    controller.sync(runtime('dialogue-1', null, 1, 1));
    await flushPromises();
    controller.sync(runtime('dialogue-2', null, 2, 2));
    await flushPromises();

    expect(bgm.pause).toHaveBeenCalledTimes(2);
    expect(bgm.play).toHaveBeenCalledTimes(2);
  });

  it('ignores an old URL request after the dialogue advances', async () => {
    const stableBgm = createMockAudio();
    const stableVoice = createMockAudio();
    const stable = [stableBgm, stableVoice];
    const pending = new Map<string, (url: string | null) => void>();
    const controller = createPreviewAudioController({
      createAudio: () => stable.shift()!,
      resolveMediaUrl: (assetId) =>
        new Promise((resolve) => pending.set(assetId, resolve)),
    });

    controller.sync(runtime('dialogue-1', 'voice-old'));
    controller.sync(runtime('dialogue-2', 'voice-new'));
    pending.get('voice-old')?.('vn-asset://audio/old');
    pending.get('voice-new')?.('vn-asset://audio/new');
    pending.get('bgm-1')?.('vn-asset://audio/bgm');
    await flushPromises();

    expect(stableVoice.src).toBe('vn-asset://audio/new');
    expect(stableVoice.play).toHaveBeenCalledTimes(1);
  });

  it('stops both channels on finish and tolerates play rejection', async () => {
    const stableBgm = createMockAudio();
    const stableVoice = createMockAudio();
    stableVoice.play.mockRejectedValueOnce(new Error('autoplay blocked'));
    const stable = [stableBgm, stableVoice];
    const controller = createPreviewAudioController({
      createAudio: () => stable.shift()!,
      resolveMediaUrl: async (assetId) => `vn-asset://audio/${assetId}`,
    });

    controller.sync(runtime());
    await flushPromises();
    controller.sync({ ...runtime(), status: 'finished', dialogue: null });

    expect(stableBgm.pause).toHaveBeenCalled();
    expect(stableVoice.pause).toHaveBeenCalled();
    expect(stableBgm.src).toBe('');
    expect(stableVoice.src).toBe('');
  });

  it('pauses voice and suspends BGM until a blocking video completes', async () => {
    const bgm = createMockAudio();
    const voice = createMockAudio();
    const channels = [bgm, voice];
    const resolveMediaUrl = vi.fn(
      async (assetId: string) => `vn-asset://audio/${assetId}`,
    );
    const controller = createPreviewAudioController({
      createAudio: () => channels.shift()!,
      resolveMediaUrl,
    });

    controller.sync(runtime());
    await flushPromises();
    bgm.currentTime = 23;
    controller.sync({
      ...runtime(),
      status: 'playingVideo',
      videoAssetId: 'video-1',
      videoSequence: 1,
      dialogue: null,
    });

    expect(bgm.pause).toHaveBeenCalled();
    expect(voice.pause).toHaveBeenCalled();
    expect(bgm.src).toBe('vn-asset://audio/bgm-1');
    expect(bgm.currentTime).toBe(23);
    expect(voice.src).toBe('');

    controller.sync(runtime('dialogue-2', null, 2, 1));
    await flushPromises();

    expect(bgm.src).toBe('vn-asset://audio/bgm-1');
    expect(bgm.currentTime).toBe(23);
    expect(bgm.play).toHaveBeenCalledTimes(2);
    expect(resolveMediaUrl).toHaveBeenCalledWith('bgm-1');
    expect(resolveMediaUrl.mock.calls.filter(([id]) => id === 'bgm-1'))
      .toHaveLength(1);
  });

  it('keeps BGM playing but stops one-shot voice while choosing', async () => {
    const bgm = createMockAudio();
    const voice = createMockAudio();
    const channels = [bgm, voice];
    const controller = createPreviewAudioController({
      createAudio: () => channels.shift()!,
      resolveMediaUrl: async (assetId) => `vn-asset://audio/${assetId}`,
    });

    controller.sync(runtime());
    await flushPromises();
    controller.sync({
      ...runtime(),
      status: 'choosing',
      dialogue: null,
      choices: [
        {
          id: 'option-1',
          text: 'Continue',
          targetSceneId: 'scene-2',
        },
      ],
    });

    expect(bgm.play).toHaveBeenCalledTimes(1);
    expect(bgm.pause).toHaveBeenCalledTimes(1);
    expect(bgm.src).toBe('vn-asset://audio/bgm-1');
    expect(voice.pause).toHaveBeenCalledTimes(2);
    expect(voice.src).toBe('');
  });

  it('keeps the same BGM playback position through a CG lead-in', async () => {
    const bgm = createMockAudio();
    const voice = createMockAudio();
    const channels = [bgm, voice];
    const resolveMediaUrl = vi.fn(
      async (assetId: string) => `vn-asset://audio/${assetId}`,
    );
    const controller = createPreviewAudioController({
      createAudio: () => channels.shift()!,
      resolveMediaUrl,
    });

    controller.sync(runtime('before-cg', null));
    await flushPromises();
    bgm.currentTime = 31;
    controller.sync({
      ...runtime('before-cg', null),
      status: 'waitingCgLeadIn',
      cgAssetId: 'cg-image',
      cgLeadInMs: 1000,
      cgSequence: 1,
      dialogue: null,
    });
    controller.sync({
      ...runtime('inside-cg', null, 2),
      cgAssetId: 'cg-image',
      cgSequence: 1,
    });
    await flushPromises();

    expect(bgm.src).toBe('vn-asset://audio/bgm-1');
    expect(bgm.currentTime).toBe(31);
    expect(bgm.play).toHaveBeenCalledTimes(1);
    expect(resolveMediaUrl.mock.calls.filter(([id]) => id === 'bgm-1'))
      .toHaveLength(1);
    expect(voice.src).toBe('');
  });

  it('updates volume and resumes paused channels without resetting playback', async () => {
    const bgm = createMockAudio();
    const voice = createMockAudio();
    const channels = [bgm, voice];
    const resolveMediaUrl = vi.fn(
      async (assetId: string) => `vn-asset://audio/${assetId}`,
    );
    const controller = createPreviewAudioController({
      createAudio: () => channels.shift()!,
      resolveMediaUrl,
    });

    controller.sync(runtime(), { bgmVolume: 0.4, voiceVolume: 0.25 });
    await flushPromises();
    bgm.currentTime = 19;
    voice.currentTime = 2;

    controller.sync(runtime(), {
      bgmVolume: 0.3,
      voiceVolume: 0.2,
      paused: true,
    });
    expect(bgm.volume).toBe(0.3);
    expect(voice.volume).toBe(0.2);
    expect(bgm.currentTime).toBe(19);
    expect(voice.currentTime).toBe(2);
    expect(bgm.src).toBe('vn-asset://audio/bgm-1');
    expect(voice.src).toBe('vn-asset://audio/voice-1');

    controller.sync(runtime(), { bgmVolume: 0.3, voiceVolume: 0.2 });
    expect(bgm.play).toHaveBeenCalledTimes(2);
    expect(voice.play).toHaveBeenCalledTimes(2);
    expect(resolveMediaUrl.mock.calls.filter(([id]) => id === 'bgm-1'))
      .toHaveLength(1);
    expect(resolveMediaUrl.mock.calls.filter(([id]) => id === 'voice-1'))
      .toHaveLength(1);
  });
});
