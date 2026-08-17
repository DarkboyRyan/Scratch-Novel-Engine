import type { GameRuntime } from '@vnengine/runtime';

import type { MediaUrlResolver } from './mediaPort';

export type PreviewAudioElement = Pick<
  HTMLAudioElement,
  'currentTime' | 'load' | 'loop' | 'pause' | 'play' | 'removeAttribute' | 'src'
>;

type ChannelState = {
  audio: PreviewAudioElement;
  key: string | null | undefined;
  requestVersion: number;
  suspended: boolean;
};

export type PreviewAudioController = {
  sync(runtime: GameRuntime): void;
  stop(): void;
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
    sync(runtime) {
      const isBgmActive =
        runtime.status === 'playing' || runtime.status === 'choosing';
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
