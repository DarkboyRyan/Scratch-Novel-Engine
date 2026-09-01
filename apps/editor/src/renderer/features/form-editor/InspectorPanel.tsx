/**
 * 文件主要作用：编辑当前时间线节点的对白、媒体、角色和逻辑属性。
 * 包含实现：`InspectorPanel`。
 */

import type { FormEvent } from 'react';
import { DEFAULT_CHARACTER_SLOT_POSITIONS } from '@vnengine/player-ui';

import type {
  AssetDocument,
  CharacterMode,
  CharacterSlot,
  CharacterPosition,
  SemanticSceneNode,
  SceneDocument,
} from '../../../shared/projectTypes';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  MAX_IMAGE_SCALE_PERCENT,
  MIN_IMAGE_SCALE_PERCENT,
} from '../../../shared/projectTypes';
import { useEditorLabels } from '../../i18n/editorLocalization';
import { formatCharacterEffect } from '../block-editor/blocks/characterEffectBlock';

type InspectorPanelProps = {
  selectedNode?: SemanticSceneNode;
  scenes: SceneDocument[];
  currentSceneId: string;
  assets: AssetDocument[];
  speaker: string;
  text: string;
  imageScaleDraft: string;
  imageScaleDraftInvalid: boolean;
  isBusy: boolean;
  onSpeakerChange: (speaker: string) => void;
  onTextChange: (text: string) => void;
  onImageScaleDraftChange: (value: string) => void;
  onImageScaleDraftCommit: () => Promise<boolean>;
  onBackgroundChange: (next: {
    assetId: string | null;
    scalePercent: number;
  }) => Promise<void>;
  onCharacterChange: (next: {
    mode?: CharacterMode;
    assetId: string | null;
    slot: CharacterSlot;
    layer: number;
    position: CharacterPosition | null;
    scalePercent: number;
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
  imageScaleDraft,
  imageScaleDraftInvalid,
  isBusy,
  onSpeakerChange,
  onTextChange,
  onImageScaleDraftChange,
  onImageScaleDraftCommit,
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
  const labels = useEditorLabels();
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit();
  }

  if (selectedNode?.type === 'background') {
    const imageAssets = assets.filter((asset) => asset.type === 'image');

    return (
      <aside className="panel inspector-panel background-inspector">
        <div className="panel-heading timeline-panel-heading">
          <h2>{labels.scenes.backgroundChange}</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>

        <label>
          {labels.inspector.showFromHere}
          <select
            value={selectedNode.assetId ?? ''}
            disabled={isBusy}
            onChange={(event) =>
              void onBackgroundChange({
                assetId: event.target.value || null,
                scalePercent: event.target.value
                  ? selectedNode.scalePercent
                  : DEFAULT_IMAGE_SCALE_PERCENT,
              })
            }
          >
            <option value="">{labels.inspector.noBackground}</option>
            {imageAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>

        <ScalePercentField
          value={imageScaleDraft}
          invalid={imageScaleDraftInvalid}
          disabled={isBusy || selectedNode.assetId === null}
          ariaLabel={labels.inspector.backgroundScaleAria}
          onChange={onImageScaleDraftChange}
          onCommit={onImageScaleDraftCommit}
        />

        <p className="background-node-help">
          {labels.inspector.backgroundHelp}
        </p>
      </aside>
    );
  }

  if (selectedNode?.type === 'character') {
    const imageAssets = assets.filter((asset) => asset.type === 'image');
    const defaultPosition =
      DEFAULT_CHARACTER_SLOT_POSITIONS[selectedNode.slot];
    const update = (
      next: Partial<{
        mode: CharacterMode;
        assetId: string | null;
        slot: CharacterSlot;
        layer: number;
        position: CharacterPosition | null;
        scalePercent: number;
      }>,
    ) =>
      onCharacterChange({
        assetId: selectedNode.assetId,
        slot: selectedNode.slot,
        layer: selectedNode.layer,
        position: selectedNode.position,
        scalePercent: selectedNode.scalePercent,
        ...next,
      });

    return (
      <aside className="panel inspector-panel character-inspector">
        <div className="panel-heading timeline-panel-heading">
          <h2>{labels.scenes.character}</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>

        <label>
          {labels.inspector.image}
          <select
            value={selectedNode.assetId ?? ''}
            disabled={isBusy}
            onChange={(event) => {
              const assetId = event.target.value || null;
              void update({
                assetId,
                ...(assetId ? { mode: 'show' } : {}),
              });
            }}
          >
            <option value="">
              {selectedNode.mode === 'clear'
                ? labels.inspector.clearLayer
                : labels.common.none}
            </option>
            {imageAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>

        {selectedNode.mode === 'show' ? (
          <>
            <label>
              {labels.inspector.position}
              <select
                value={selectedNode.position ? 'custom' : selectedNode.slot}
                disabled={isBusy}
                onChange={(event) =>
                  void update({
                    slot: event.target.value as CharacterSlot,
                    position: null,
                  })
                }
              >
                <option value="left">{labels.scenes.left}</option>
                <option value="center">{labels.scenes.center}</option>
                <option value="right">{labels.scenes.right}</option>
                {selectedNode.position ? (
                  <option value="custom">{labels.inspector.custom}</option>
                ) : null}
              </select>
            </label>

            <fieldset className="character-coordinate-fields">
              <legend>{labels.inspector.coordinates}</legend>
              <label>
                {labels.inspector.xCoordinate}
                <input
                  key={`${selectedNode.id}:x:${selectedNode.position?.x ?? selectedNode.slot}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  defaultValue={
                    selectedNode.position?.x ?? defaultPosition.x
                  }
                  disabled={isBusy}
                  aria-label={labels.inspector.portraitX}
                  data-coordinate="x"
                  onBlur={(event) => {
                    const x = Number(event.currentTarget.value);
                    const y = Number(
                      event.currentTarget
                        .closest('.character-coordinate-fields')
                        ?.querySelector<HTMLInputElement>(
                          '[data-coordinate="y"]',
                        )?.value ??
                        selectedNode.position?.y ??
                        defaultPosition.y,
                    );
                    if (
                      Number.isFinite(x) &&
                      x >= 0 &&
                      x <= 100 &&
                      Number.isFinite(y) &&
                      y >= 0 &&
                      y <= 100
                    ) {
                      void update({
                        position: { x, y },
                      });
                    } else {
                      event.currentTarget.value = String(
                        selectedNode.position?.x ?? defaultPosition.x,
                      );
                    }
                  }}
                />
              </label>
              <label>
                {labels.inspector.yCoordinate}
                <input
                  key={`${selectedNode.id}:y:${selectedNode.position?.y ?? 'default'}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  defaultValue={
                    selectedNode.position?.y ?? defaultPosition.y
                  }
                  disabled={isBusy}
                  aria-label={labels.inspector.portraitY}
                  data-coordinate="y"
                  onBlur={(event) => {
                    const y = Number(event.currentTarget.value);
                    const x = Number(
                      event.currentTarget
                        .closest('.character-coordinate-fields')
                        ?.querySelector<HTMLInputElement>(
                          '[data-coordinate="x"]',
                        )?.value ??
                        selectedNode.position?.x ??
                        defaultPosition.x,
                    );
                    if (
                      Number.isFinite(x) &&
                      x >= 0 &&
                      x <= 100 &&
                      Number.isFinite(y) &&
                      y >= 0 &&
                      y <= 100
                    ) {
                      void update({
                        position: { x, y },
                      });
                    } else {
                      event.currentTarget.value = String(
                        selectedNode.position?.y ?? defaultPosition.y,
                      );
                    }
                  }}
                />
              </label>
            </fieldset>

            <ScalePercentField
              value={imageScaleDraft}
              invalid={imageScaleDraftInvalid}
              disabled={isBusy}
              ariaLabel={labels.inspector.portraitScaleAria}
              onChange={onImageScaleDraftChange}
              onCommit={onImageScaleDraftCommit}
            />
          </>
        ) : null}

        <label>
          {labels.inspector.characterLayer}
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
                  {layer} {labels.scenes.layer}
                </option>
              ),
            )}
          </select>
        </label>

        {selectedNode.mode === 'show' ? (
          <>
            <p className="character-node-help">
              {labels.inspector.coordinateHelp}
            </p>

            <section
              className="character-effect-readonly"
              aria-label={labels.inspector.characterEffect}
            >
              <strong>{labels.inspector.characterEffect}</strong>
              <p>
                {selectedNode.effect
                  ? formatCharacterEffect(selectedNode.effect, labels)
                  : labels.common.none}
              </p>
              <small>{labels.inspector.characterEffectReadonlyHelp}</small>
            </section>
          </>
        ) : null}
      </aside>
    );
  }

  if (selectedNode?.type === 'sceneJump') {
    return (
      <aside className="panel inspector-panel scene-jump-inspector">
        <div className="panel-heading timeline-panel-heading">
          <h2>{labels.scenes.jumpScene}</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>
        <label>
          {labels.inspector.targetScene}
          <select
            value={selectedNode.targetSceneId}
            disabled={isBusy}
            onChange={(event) => void onSceneJumpChange(event.target.value)}
          >
            {scenes.map((scene, index) =>
              scene.id === currentSceneId ? null : (
                <option key={scene.id} value={scene.id}>
                  {labels.common.scene} {index + 1}
                  {scene.name !== `场景 ${index + 1}` ? ` · ${scene.name}` : ''}
                </option>
              ),
            )}
          </select>
        </label>
        <p className="scene-jump-node-help">{labels.inspector.sceneJumpHelp}</p>
      </aside>
    );
  }

  if (selectedNode?.type === 'bgm') {
    const audioAssets = assets.filter((asset) => asset.type === 'audio');

    return (
      <aside className="panel inspector-panel bgm-inspector">
        <div className="panel-heading timeline-panel-heading">
          <h2>{labels.scenes.backgroundMusic}</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>
        <label>
          {labels.inspector.startFromHere}
          <select
            value={selectedNode.assetId ?? ''}
            disabled={isBusy}
            onChange={(event) => void onBgmChange(event.target.value || null)}
          >
            <option value="">{labels.scenes.stopBackgroundMusic}</option>
            {audioAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>
        <p className="bgm-node-help">{labels.inspector.bgmHelp}</p>
      </aside>
    );
  }

  if (selectedNode?.type === 'video') {
    const videoAssets = assets.filter((asset) => asset.type === 'video');

    return (
      <aside className="panel inspector-panel video-inspector">
        <div className="panel-heading timeline-panel-heading">
          <h2>{labels.scenes.playVideo}</h2>
          <TimelineInsertActions
            isBusy={isBusy}
            onInsertCharacter={onInsertCharacter}
            onInsertBgm={onInsertBgm}
            onInsertDialogue={onInsertDialogue}
          />
        </div>
        <label>
          {labels.inspector.videoAsset}
          <select
            value={selectedNode.assetId ?? ''}
            disabled={isBusy}
            onChange={(event) => void onVideoChange(event.target.value || null)}
          >
            <option value="">{labels.scenes.noVideo}</option>
            {videoAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>
        <p className="video-node-help">{labels.inspector.videoHelp}</p>
      </aside>
    );
  }

  if (selectedNode?.type === 'choice') {
    return (
      <aside className="panel inspector-panel choice-inspector">
        <div className="panel-heading timeline-panel-heading">
          <h2>{labels.scenes.sceneOptions}</h2>
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
                  <strong>{option.text || labels.common.unnamedOption}</strong>
                  <span>
                    {targetIndex >= 0
                      ? `${labels.blockly.jumpTo}${labels.common.wordSeparator}${labels.common.scene} ${targetIndex + 1}`
                      : labels.scenes.missingTargetScene}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="choice-node-empty">{labels.inspector.choiceEmpty}</p>
        )}
        <p className="choice-node-help">{labels.inspector.choiceHelp}</p>
      </aside>
    );
  }

  if (
    selectedNode?.type === 'variableSet' ||
    selectedNode?.type === 'variableChange' ||
    selectedNode?.type === 'logicIf' ||
    selectedNode?.type === 'logicRepeat' ||
    selectedNode?.type === 'cgDisplay'
  ) {
    const title =
      selectedNode.type === 'variableSet'
        ? labels.blockly.setVariable
        : selectedNode.type === 'variableChange'
          ? labels.blockly.changeVariable
          : selectedNode.type === 'logicIf'
            ? labels.blockly.logicIf
            : selectedNode.type === 'logicRepeat'
              ? labels.blockly.logicRepeat
              : labels.blockly.displayCg;
    return (
      <aside className="panel inspector-panel logic-inspector">
        <div className="panel-heading timeline-panel-heading">
          <h2>{title}</h2>
        </div>
        <p className="logic-inspector-help">{labels.inspector.logicTreeHelp}</p>
      </aside>
    );
  }

  const dialogueNode =
    selectedNode?.type === 'dialogue' ? selectedNode : undefined;

  return (
    <aside className="panel inspector-panel">
      <div className="panel-heading timeline-panel-heading">
        <h2>
          {dialogueNode
            ? labels.inspector.editDialogue
            : labels.inspector.dialogueManager}
        </h2>
        <TimelineInsertActions
          isBusy={isBusy}
          onInsertCharacter={onInsertCharacter}
          onInsertBgm={onInsertBgm}
          onInsertDialogue={onInsertDialogue}
        />
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          {labels.inspector.speaker}
          <input
            value={speaker}
            disabled={isBusy}
            onChange={(event) => onSpeakerChange(event.target.value)}
            placeholder={labels.inspector.speakerPlaceholder}
          />
        </label>

        <label>
          {labels.inspector.text}
          <textarea
            value={text}
            disabled={isBusy}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={labels.inspector.textPlaceholder}
            rows={7}
          />
        </label>

        <label>
          {labels.inspector.voice}
          <select
            value={dialogueNode?.voiceAssetId ?? ''}
            disabled={isBusy || !dialogueNode}
            onChange={(event) =>
              void onDialogueVoiceChange(event.target.value || null)
            }
          >
            <option value="">{labels.inspector.noVoice}</option>
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
          {dialogueNode
            ? labels.inspector.saveChanges
            : labels.inspector.addToStory}
        </button>
      </form>
    </aside>
  );
}

function ScalePercentField({
  value,
  invalid,
  disabled,
  ariaLabel,
  onChange,
  onCommit,
}: {
  value: string;
  invalid: boolean;
  disabled: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
  onCommit: () => Promise<boolean>;
}) {
  const labels = useEditorLabels();
  return (
    <label>
      {labels.inspector.scale}
      <input
        type="number"
        min={MIN_IMAGE_SCALE_PERCENT}
        max={MAX_IMAGE_SCALE_PERCENT}
        step="1"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'inspector-image-scale-error' : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={(event) => {
          // Moving focus to another control will let that control's mutation
          // flush this draft atomically. Starting an Engine command here would
          // disable the click target between pointer-down and click.
          if (event.relatedTarget === null) {
            void onCommit();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onCommit();
          }
        }}
      />
      {invalid ? (
        <small id="inspector-image-scale-error" role="alert">
          {labels.inspector.scaleInvalid}
        </small>
      ) : null}
    </label>
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
  const labels = useEditorLabels();
  return (
    <div className="panel-heading-actions">
      <button
        type="button"
        className="panel-heading-action character-action"
        aria-label={labels.inspector.addPortrait}
        title={labels.inspector.addPortrait}
        disabled={isBusy}
        onClick={() => void onInsertCharacter()}
      >
        {labels.inspector.portrait} <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        className="panel-heading-action bgm-action"
        aria-label={labels.inspector.insertBgm}
        title={labels.inspector.insertBgm}
        disabled={isBusy}
        onClick={() => void onInsertBgm()}
      >
        {labels.common.audio} <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        className="panel-heading-action"
        aria-label={labels.inspector.insertDialogue}
        title={labels.inspector.insertDialogue}
        disabled={isBusy}
        onClick={() => void onInsertDialogue()}
      >
        {labels.inspector.dialogue} <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
