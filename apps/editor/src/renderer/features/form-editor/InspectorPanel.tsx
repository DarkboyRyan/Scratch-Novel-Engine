import type { FormEvent } from 'react';

import type {
  AssetDocument,
  CharacterSlot,
  SceneNode,
  SceneDocument,
} from '../../../shared/projectTypes';

type InspectorPanelProps = {
  selectedNode?: SceneNode;
  scenes: SceneDocument[];
  currentSceneId: string;
  assets: AssetDocument[];
  speaker: string;
  text: string;
  isBusy: boolean;
  onSpeakerChange: (speaker: string) => void;
  onTextChange: (text: string) => void;
  onBackgroundChange: (assetId: string | null) => Promise<void>;
  onCharacterChange: (next: {
    assetId: string | null;
    slot: CharacterSlot;
    layer: number;
  }) => Promise<void>;
  onSceneJumpChange: (targetSceneId: string) => Promise<void>;
  onBgmChange: (assetId: string | null) => Promise<void>;
  onVideoChange: (assetId: string | null) => Promise<void>;
  onDialogueVoiceChange: (assetId: string | null) => Promise<void>;
  onInsertDialogue: () => Promise<void>;
  onInsertCharacter: () => Promise<void>;
  onInsertBgm: () => Promise<void>;
  onSubmit: () => Promise<void>;
};

export function InspectorPanel({
  selectedNode,
  scenes,
  currentSceneId,
  assets,
  speaker,
  text,
  isBusy,
  onSpeakerChange,
  onTextChange,
  onBackgroundChange,
  onCharacterChange,
  onSceneJumpChange,
  onBgmChange,
  onVideoChange,
  onDialogueVoiceChange,
  onInsertDialogue,
  onInsertCharacter,
  onInsertBgm,
  onSubmit,
}: InspectorPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit();
  }

  if (selectedNode?.type === 'background') {
    const imageAssets = assets.filter((asset) => asset.type === 'image');

    return (
      <aside className="panel inspector-panel background-inspector">
        <div className="panel-heading">
          <h2>背景切换</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>

        <label>
          从这里开始显示
          <select
            value={selectedNode.assetId ?? ''}
            disabled={isBusy}
            onChange={(event) =>
              void onBackgroundChange(event.target.value || null)
            }
          >
            <option value="">无背景</option>
            {imageAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>

        <p className="background-node-help">
          这个背景会持续显示，直到时间线遇到下一个背景切换节点。
        </p>
      </aside>
    );
  }


  if (selectedNode?.type === 'character') {
    const imageAssets = assets.filter((asset) => asset.type === 'image');
    const update = (
      next: Partial<{
        assetId: string | null;
        slot: CharacterSlot;
        layer: number;
      }>,
    ) =>
      onCharacterChange({
        assetId: selectedNode.assetId,
        slot: selectedNode.slot,
        layer: selectedNode.layer,
        ...next,
      });

    return (
      <aside className="panel inspector-panel character-inspector">
        <div className="panel-heading">
          <h2>人物立绘</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>

        <label>
          图片
          <select
            value={selectedNode.assetId ?? ''}
            disabled={isBusy}
            onChange={(event) =>
              void update({ assetId: event.target.value || null })
            }
          >
            <option value="">无立绘（清空这一层）</option>
            {imageAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>

        <label>
          位置
          <select
            value={selectedNode.slot}
            disabled={isBusy}
            onChange={(event) =>
              void update({
                slot: event.target.value as CharacterSlot,
              })
            }
          >
            <option value="left">左侧</option>
            <option value="center">中间</option>
            <option value="right">右侧</option>
          </select>
        </label>

        <label>
          人物层级
          <select
            value={selectedNode.layer}
            disabled={isBusy}
            onChange={(event) =>
              void update({ layer: Number(event.target.value) })
            }
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map(
              (layer) => (
                <option key={layer} value={layer}>
                  第 {layer} 层
                </option>
              ),
            )}
          </select>
        </label>

        <p className="character-node-help">
          后出现的同层立绘会替换之前的立绘；层级越大越靠前。
        </p>
      </aside>
    );
  }

  if (selectedNode?.type === 'sceneJump') {
    return (
      <aside className="panel inspector-panel scene-jump-inspector">
        <div className="panel-heading">
          <h2>跳转场景</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>
        <label>
          目标场景
          <select
            value={selectedNode.targetSceneId}
            disabled={isBusy}
            onChange={(event) =>
              void onSceneJumpChange(event.target.value)
            }
          >
            {scenes.map((scene, index) =>
              scene.id === currentSceneId ? null : (
                <option key={scene.id} value={scene.id}>
                  场景 {index + 1}
                  {scene.name !== `场景 ${index + 1}`
                    ? ` · ${scene.name}`
                    : ''}
                </option>
              ),
            )}
          </select>
        </label>
        <p className="scene-jump-node-help">
          正式预览执行到这里时进入目标场景；没有跳转节点时，本场景结束即停止。
        </p>
      </aside>
    );
  }

  if (selectedNode?.type === 'bgm') {
    const audioAssets = assets.filter((asset) => asset.type === 'audio');

    return (
      <aside className="panel inspector-panel bgm-inspector">
        <div className="panel-heading">
          <h2>背景音乐</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>
        <label>
          从这里开始
          <select
            value={selectedNode.assetId ?? ''}
            disabled={isBusy}
            onChange={(event) =>
              void onBgmChange(event.target.value || null)
            }
          >
            <option value="">停止背景音乐</option>
            {audioAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>
        <p className="bgm-node-help">
          背景音乐会循环播放，并持续到下一个背景音乐积木。
        </p>
      </aside>
    );
  }

  if (selectedNode?.type === 'video') {
    const videoAssets = assets.filter((asset) => asset.type === 'video');

    return (
      <aside className="panel inspector-panel video-inspector">
        <div className="panel-heading">
          <h2>播放视频</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>
        <label>
          视频资源
          <select
            value={selectedNode.assetId ?? ''}
            disabled={isBusy}
            onChange={(event) =>
              void onVideoChange(event.target.value || null)
            }
          >
            <option value="">未选择视频</option>
            {videoAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>
        <p className="video-node-help">
          正式预览会播放这个视频；视频结束后继续执行下一条剧情。
        </p>
      </aside>
    );
  }

  if (selectedNode?.type === 'choice') {
    return (
      <aside className="panel inspector-panel choice-inspector">
        <div className="panel-heading">
          <h2>场景选项</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>

        {selectedNode.options.length > 0 ? (
          <ol className="choice-inspector-list">
            {selectedNode.options.map((option) => {
              const targetIndex = scenes.findIndex(
                (scene) => scene.id === option.targetSceneId,
              );
              return (
                <li key={option.id}>
                  <strong>{option.text || '未命名选项'}</strong>
                  <span>
                    {targetIndex >= 0
                      ? `跳转到场景 ${targetIndex + 1}`
                      : '目标场景缺失'}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="choice-node-empty">
            当前没有选项，正式预览会直接执行下一条剧情。
          </p>
        )}
        <p className="choice-node-help">
          选项内容和目标场景请在图形化编辑中设置。
        </p>
      </aside>
    );
  }

  const dialogueNode =
    selectedNode?.type === 'dialogue' ? selectedNode : undefined;

  return (
    <aside className="panel inspector-panel">
      <div className="panel-heading">
        <h2>{dialogueNode ? '编辑对白' : '对话管理'}</h2>
        <TimelineInsertActions
          isBusy={isBusy}
          onInsertCharacter={onInsertCharacter}
          onInsertBgm={onInsertBgm}
          onInsertDialogue={onInsertDialogue}
        />
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          角色名
          <input
            value={speaker}
            disabled={isBusy}
            onChange={(event) =>
              onSpeakerChange(event.target.value)
            }
            placeholder="例如：Alice"
          />
        </label>

        <label>
          具体文本
          <textarea
            value={text}
            disabled={isBusy}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder="输入对白内容……"
            rows={7}
          />
        </label>

        <label>
          人物语音
          <select
            value={dialogueNode?.voiceAssetId ?? ''}
            disabled={isBusy || !dialogueNode}
            onChange={(event) =>
              void onDialogueVoiceChange(event.target.value || null)
            }
          >
            <option value="">无语音</option>
            {assets
              .filter((asset) => asset.type === 'audio')
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.displayName}
                </option>
              ))}
          </select>
        </label>

        <button
          type="submit"
          className="dialogue-submit-button"
          disabled={isBusy}
        >
          {dialogueNode ? '保存修改' : '加入剧情'}
        </button>
      </form>
    </aside>
  );
}

function TimelineInsertActions({
  isBusy,
  onInsertCharacter,
  onInsertBgm,
  onInsertDialogue,
}: {
  isBusy: boolean;
  onInsertCharacter: () => Promise<void>;
  onInsertBgm: () => Promise<void>;
  onInsertDialogue: () => Promise<void>;
}) {
  return (
    <div className="panel-heading-actions">
      <button
        type="button"
        className="panel-heading-action character-action"
        aria-label="在当前节点后插入人物立绘"
        title="在当前节点后插入人物立绘"
        disabled={isBusy}
        onClick={() => void onInsertCharacter()}
      >
        立绘 <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        className="panel-heading-action bgm-action"
        aria-label="在当前节点后插入背景音乐"
        title="在当前节点后插入背景音乐"
        disabled={isBusy}
        onClick={() => void onInsertBgm()}
      >
        音频 <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        className="panel-heading-action"
        aria-label="在当前节点后插入空对白"
        title="在当前节点后插入空对白"
        disabled={isBusy}
        onClick={() => void onInsertDialogue()}
      >
        对白 <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
