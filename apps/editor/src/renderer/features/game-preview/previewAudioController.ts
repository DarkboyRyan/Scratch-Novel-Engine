import type { GamePreviewRuntime } from './previewRuntime';

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
  sync(runtime: GamePreviewRuntime): void;
  stop(): void;
};

export type PreviewAudioControllerOptions = {
  createAudio?: () => PreviewAudioElement;
  resolveMediaUrl?: (assetId: string) => Promise<string | null>;
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
  // play() 可能因自动播放策略、解码失败或资源丢失被拒绝。
  // 音频失败是非致命的，不能中断游戏预览状态机。
  void channel.audio.play().catch(() => {});
}

// 状态机只描述“现在应该播什么”；这个控制器才拥有
// HTMLAudioElement 和异步 capability URL 的生命周期。
export function createPreviewAudioController({
  createAudio = () => new Audio(),
  resolveMediaUrl = (assetId) => window.vnAssets.getMediaUrl(assetId),
}: PreviewAudioControllerOptions = {}): PreviewAudioController {
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
        // Main 拒绝过期 capability 时保持静音，预览仍可继续。
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
        // 视频临时接管声音，但不改变剧情中的 BGM 状态。保留 src 和
        // currentTime，视频结束后同一 BGM 可以从暂停位置继续。
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
