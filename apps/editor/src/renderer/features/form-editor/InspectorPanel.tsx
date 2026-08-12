import type { FormEvent } from 'react';

import type { DialogueNode } from '../../../shared/projectTypes';

type InspectorPanelProps = {
  selectedNode?: DialogueNode;
  speaker: string;
  text: string;
  isBusy: boolean;
  onSpeakerChange: (speaker: string) => void;
  onTextChange: (text: string) => void;
  onInsertEmptyDialogue: () => Promise<void>;
  onSubmit: () => Promise<void>;
};

export function InspectorPanel({
  selectedNode,
  speaker,
  text,
  isBusy,
  onSpeakerChange,
  onTextChange,
  onInsertEmptyDialogue,
  onSubmit,
}: InspectorPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit();
  }

  return (
    <aside className="panel inspector-panel">
      <div className="panel-heading">
        <h2>{selectedNode ? '编辑对白' : '对话管理'}</h2>
        <button
          type="button"
          className="add-button"
          aria-label="在当前对白后添加文本"
          title="在当前对白后添加文本"
          disabled={isBusy}
          onClick={() => void onInsertEmptyDialogue()}
        >
          <span aria-hidden="true">+</span>
        </button>
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
          {selectedNode ? '保存修改' : '加入剧情'}
        </button>
      </form>
    </aside>
  );
}
