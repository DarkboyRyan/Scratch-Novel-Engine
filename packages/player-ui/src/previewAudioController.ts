/**
 * 主要作用：管理 BGM 与语音双通道的解析、切换、暂停和音量同步。
 * 关键函数与实现：`PreviewAudioElement`、`PreviewAudioController`、`PreviewAudioSyncOptions`、`PreviewAudioControllerOptions`；以 TypeScript 类型边界和可组合函数实现。
 */
import type { GameRuntime } from '@vnengine/runtime';

import type { MediaUrlResolver } from './mediaPort';
import { clampMediaVolume } from './mediaVolume';

export type PreviewAudioElement = Pick<
  HTMLAudioElement,
  | 'currentTime'
  | 'load'
  | 'loop'
  | 'pause'
  | 'play'
  | 'removeAttribute'
  | 'src'
  | 'volume'
>;

type ChannelState = {
  audio: PreviewAudioElement;
  key: string | null | undefined;
  requestVersion: number;
  suspended: boolean;
};

export type PreviewAudioController = {
  sync(runtime: GameRuntime, options?: PreviewAudioSyncOptions): void;
  stop(): void;
};

export type PreviewAudioSyncOptions = {
  bgmVolume?: number;
  voiceVolume?: number;
  paused?: boolean;
};

export type PreviewAudioControllerOptions = {
  createAudio?: () => PreviewAudioElement;
  resolveMediaUrl: MediaUrlResolver;
};

function stopChannel(channel: ChannelState): void {
  channel.requestVersion += 1;
  channel.suspended = false;
  channel.audio.pause();
  channel.audio.currentTime = 0;
  channel.audio.removeAttribute('src');
  channel.audio.load();
}

function suspendChannel(channel: ChannelState): void {
  if (channel.key === null || channel.key === undefined) {
    return;
  }
  channel.suspended = true;
  channel.audio.pause();
}

function playChannel(channel: ChannelState): void {
  void channel.audio.play().catch(() => {});
}

export function createPreviewAudioController({
  createAudio = () => new Audio(),
  resolveMediaUrl,
}: PreviewAudioControllerOptions): PreviewAudioController {
  const bgm: ChannelState = {
    audio: createAudio(),
    key: undefined,
    requestVersion: 0,
    suspended: false,
  };
  const voice: ChannelState = {
    audio: createAudio(),
    key: undefined,
    requestVersion: 0,
    suspended: false,
  };

  function syncChannel(
    channel: ChannelState,
    key: string | null,
    assetId: string | null,
    loop: boolean,
  ): void {
    if (channel.key === key) {
      if (key !== null && assetId !== null && channel.suspended) {
        channel.suspended = false;
        playChannel(channel);
      }
      return;
    }

    channel.key = key;
    stopChannel(channel);
    if (key === null || assetId === null) {
      return;
    }

    const requestVersion = channel.requestVersion;
    void resolveMediaUrl(assetId)
      .then((url) => {
        if (
          !url ||
          channel.key !== key ||
          channel.requestVersion !== requestVersion
        ) {
          return;
        }

        channel.audio.loop = loop;
        channel.audio.src = url;
        channel.audio.currentTime = 0;
        if (!channel.suspended) {
          playChannel(channel);
        }
      })
      .catch(() => {
        // Missing or expired capabilities are non-fatal to story playback.
      });
  }

  return {
    sync(runtime, {
      bgmVolume = 1,
      voiceVolume = 1,
      paused = false,
    } = {}) {
      bgm.audio.volume = clampMediaVolume(bgmVolume);
      voice.audio.volume = clampMediaVolume(voiceVolume);

      if (paused) {
        suspendChannel(bgm);
        suspendChannel(voice);
        return;
      }

      const isBgmActive =
        runtime.status === 'playing' ||
        runtime.status === 'waitingCgLeadIn' ||
        runtime.status === 'choosing';
      const bgmAssetId = isBgmActive ? runtime.bgmAssetId : null;
      const dialogue = runtime.status === 'playing' ? runtime.dialogue : null;
      const voiceAssetId = dialogue?.voiceAssetId ?? null;

      if (runtime.status === 'playingVideo') {
        suspendChannel(bgm);
      } else {
        syncChannel(
          bgm,
          bgmAssetId ? `${runtime.bgmSequence}:${bgmAssetId}` : null,
          bgmAssetId,
          true,
        );
      }
      syncChannel(
        voice,
        dialogue && voiceAssetId
          ? `${runtime.dialogueSequence}:${dialogue.id}:${voiceAssetId}`
          : null,
        voiceAssetId,
        false,
      );
    },
    stop() {
      bgm.key = null;
      voice.key = null;
      stopChannel(bgm);
      stopChannel(voice);
    },
  };
}
