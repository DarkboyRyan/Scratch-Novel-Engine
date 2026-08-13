import type { FormEvent } from 'react';

import type {
  AssetDocument,
  CharacterSlot,
  SceneNode,
} from '../../../shared/projectTypes';

type InspectorPanelProps = {
  selectedNode?: SceneNode;
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
  onInsertDialogue: () => Promise<void>;
  onInsertCharacter: () => Promise<void>;
  onSubmit: () => Promise<void>;
};

export function InspectorPanel({
  selectedNode,
  assets,
  speaker,
  text,
  isBusy,
  onSpeakerChange,
  onTextChange,
  onBackgroundChange,
  onCharacterChange,
  onInsertDialogue,
  onInsertCharacter,
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

  const dialogueNode =
    selectedNode?.type === 'dialogue' ? selectedNode : undefined;

  return (
    <aside className="panel inspector-panel">
      <div className="panel-heading">
        <h2>{dialogueNode ? '编辑对白' : '对话管理'}</h2>
        <TimelineInsertActions
          isBusy={isBusy}
          onInsertCharacter={onInsertCharacter}
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
  onInsertDialogue,
}: {
  isBusy: boolean;
  onInsertCharacter: () => Promise<void>;
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
