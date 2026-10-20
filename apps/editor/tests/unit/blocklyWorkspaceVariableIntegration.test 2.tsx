/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 BlocklyWorkspace 项目级变量下拉候选集成行为。
 * 测试覆盖：跨场景收集、稳定去重、孤立值兼容、快照刷新、本地化与空候选安全性。
 */

import * as Blockly from 'blockly';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorLanguage } from '../../src/shared/editorSettingsProtocol';
import type { SceneDocument } from '../../src/shared/projectTypes';
import { BlocklyWorkspace } from '../../src/renderer/features/block-editor/BlocklyWorkspace';
import {
  readVariableChangeBlock,
  VARIABLE_BLOCK_FIELDS,
  VARIABLE_CHANGE_BLOCK_TYPE,
  VARIABLE_SET_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/variableBlock';
import { getSceneStartBlockId } from '../../src/renderer/features/block-editor/blocks/sceneStartBlock';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function scene(
  id: string,
  nodes: SceneDocument['nodes'],
): SceneDocument {
  return {
    schemaVersion: 1,
    id,
    name: id,
    backgroundAssetId: null,
    backgroundScalePercent: 100,
    nodes,
  };
}

function dropdownOptions(block: Blockly.Block): Blockly.MenuOption[] {
  const field = block.getField(VARIABLE_BLOCK_FIELDS.name);
  expect(field).toBeInstanceOf(Blockly.FieldDropdown);
  return (field as Blockly.FieldDropdown).getOptions(false);
}

function dropdownValues(block: Blockly.Block): string[] {
  return dropdownOptions(block).map((option) => String(option[1]));
}

describe('BlocklyWorkspace variable dropdown integration', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as CanvasRenderingContext2D);
    const svgPrototype = SVGElement.prototype as SVGElement & {
      getBBox?: () => { x: number; y: number; width: number; height: number };
    };
    if (!svgPrototype.getBBox) {
      Object.defineProperty(SVGElement.prototype, 'getBBox', {
        configurable: true,
        value: () => ({ x: 0, y: 0, width: 120, height: 40 }),
      });
    }
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await act(async () => root.unmount());
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  function mountWorkspace() {
    const container = document.createElement('div');
    container.style.width = '1000px';
    container.style.height = '700px';
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const action = vi.fn().mockResolvedValue(true);
    const addVariableChange = vi.fn().mockResolvedValue(true);
    const updateVariableChange = vi.fn().mockResolvedValue(true);
    const layoutStore = new Map();

    const render = async (
      activeScene: SceneDocument,
      scenes: SceneDocument[],
      language: EditorLanguage = 'zh-CN',
    ) => {
      await act(async () => {
        root.render(
          <EditorI18nProvider language={language}>
            <BlocklyWorkspace
              scene={activeScene}
              scenes={scenes}
              assets={[]}
              layoutKey={`project:${activeScene.id}`}
              layoutStore={layoutStore}
              isBusy={false}
              onDialogueAdd={action}
              onBackgroundAdd={action}
              onBackgroundUpdate={action}
              onCharacterAdd={action}
              onCharacterUpdate={action}
              onCharacterEffectUpdate={action}
              onCharacterEffectMove={action}
              onSceneJumpAdd={action}
              onSceneJumpUpdate={action}
              onBgmAdd={action}
              onBgmUpdate={action}
              onVideoAdd={action}
              onVideoUpdate={action}
              onChoiceAdd={action}
              onChoiceOptionAdd={action}
              onStoryExtensionAdd={action}
              onVariableSetAdd={action}
              onVariableSetUpdate={action}
              onVariableChangeAdd={addVariableChange}
              onVariableChangeUpdate={updateVariableChange}
              onLogicIfAdd={action}
              onLogicIfUpdate={action}
              onLogicRepeatAdd={action}
              onLogicRepeatUpdate={action}
              onLogicControlDelete={action}
              onLogicControlReorder={action}
              onCgDisplayAdd={action}
              onCgDisplayUpdate={action}
              onCgDisplayDelete={action}
              onCgDisplayReorder={action}
              onChoiceOptionUpdate={action}
              onChoiceOptionDelete={action}
              onChoiceOptionReorder={action}
              onDialogueVoiceUpdate={action}
              onTimelineNodesDelete={action}
              onTimelineReorder={action}
              onTimelineNodesReorder={action}
              onDialogueUpdate={action}
              onDraftDirtyChange={() => {}}
            />
          </EditorI18nProvider>,
        );
        await Promise.resolve();
      });
    };

    return {
      addVariableChange,
      render,
      updateVariableChange,
    };
  }

  it('collects project-wide Set names in stable order and refreshes without rewriting persisted Change values', async () => {
    const { render, updateVariableChange } = mountWorkspace();
    const activeScene = scene('scene-active', [
      {
        id: 'local-set',
        type: 'variableSet',
        variableName: '本地变量',
        value: true,
      },
      {
        id: 'change-1',
        type: 'variableChange',
        variableName: 'route',
        amount: 2,
      },
    ]);
    const declarations = scene('scene-declarations', [
      {
        id: 'set-score-1',
        type: 'variableSet',
        variableName: 'score',
        value: 0,
      },
      {
        id: 'set-route-1',
        type: 'variableSet',
        variableName: 'route',
        value: 'A',
      },
      {
        id: 'set-score-2',
        type: 'variableSet',
        variableName: 'score',
        value: 10,
      },
      {
        id: 'set-invalid-name',
        type: 'variableSet',
        variableName: ' invalid',
        value: 0,
      },
    ]);

    await render(activeScene, [declarations, activeScene]);
    const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
    const change = workspace.getBlockById('change-1');
    const localSet = workspace.getBlockById('local-set');
    if (!change || !localSet) {
      throw new Error('Expected projected variable blocks');
    }
    expect(change.type).toBe(VARIABLE_CHANGE_BLOCK_TYPE);
    expect(localSet.type).toBe(VARIABLE_SET_BLOCK_TYPE);
    expect(dropdownValues(change)).toEqual(['score', 'route', '本地变量']);
    expect(change.getFieldValue(VARIABLE_BLOCK_FIELDS.name)).toBe('route');

    const movedAndRenamed = scene('scene-declarations', [
      {
        id: 'set-route-1',
        type: 'variableSet',
        variableName: 'path',
        value: 'A',
      },
      {
        id: 'set-score-1',
        type: 'variableSet',
        variableName: 'score',
        value: 0,
      },
    ]);
    await render(activeScene, [movedAndRenamed, activeScene]);
    const refreshedChange = workspace.getBlockById('change-1');
    if (!refreshedChange) {
      throw new Error('Expected refreshed variable-change block');
    }
    expect(dropdownValues(refreshedChange)).toEqual([
      'path',
      'score',
      '本地变量',
      'route',
    ]);
    expect(refreshedChange.getFieldValue(VARIABLE_BLOCK_FIELDS.name)).toBe(
      'route',
    );

    const afterDelete = scene('scene-declarations', []);
    await render(activeScene, [afterDelete, activeScene]);
    const orphanChange = workspace.getBlockById('change-1');
    if (!orphanChange) {
      throw new Error('Expected orphan-compatible variable-change block');
    }
    expect(dropdownValues(orphanChange)).toEqual(['本地变量', 'route']);
    expect(orphanChange.getFieldValue(VARIABLE_BLOCK_FIELDS.name)).toBe(
      'route',
    );
    expect(dropdownOptions(orphanChange).at(-1)?.[0]).toBe(
      '旧引用 · route',
    );

    await render(activeScene, [afterDelete, activeScene], 'en-US');
    const localizedChange = workspace.getBlockById('change-1');
    const localizedSet = workspace.getBlockById('local-set');
    if (!localizedChange || !localizedSet) {
      throw new Error('Expected localized variable blocks');
    }
    expect(localizedChange.getFieldValue(VARIABLE_BLOCK_FIELDS.name)).toBe(
      'route',
    );
    expect(localizedSet.getFieldValue(VARIABLE_BLOCK_FIELDS.name)).toBe(
      '本地变量',
    );
    expect(dropdownOptions(localizedChange).at(-1)?.[0]).toBe(
      'Legacy reference · route',
    );
    expect(updateVariableChange).not.toHaveBeenCalled();
  });

  it('shows a localized empty placeholder and never submits it as a variable', async () => {
    const { addVariableChange, render } = mountWorkspace();
    const emptyScene = scene('scene-empty', []);
    await render(emptyScene, [emptyScene], 'zh-CN');
    const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
    const temporary = workspace.newBlock(
      VARIABLE_CHANGE_BLOCK_TYPE,
      'temporary-change',
    );
    temporary.initSvg();
    temporary.render();
    const zhOptions = dropdownOptions(temporary);
    expect(zhOptions).toHaveLength(1);
    expect(zhOptions[0]?.[1]).toBe('');
    expect(readVariableChangeBlock(temporary)).toBeNull();

    const start = workspace.getBlockById(getSceneStartBlockId(emptyScene.id));
    start?.nextConnection?.connect(temporary.previousConnection!);
    await act(async () => {
      workspace.fireChangeListener({
        type: Blockly.Events.BLOCK_MOVE,
        blockId: temporary.id,
        reason: ['drag'],
      } as unknown as Blockly.Events.Abstract);
      await Promise.resolve();
    });
    expect(addVariableChange).not.toHaveBeenCalled();

    await render(emptyScene, [emptyScene], 'en-US');
    const localizedTemporary = workspace.newBlock(
      VARIABLE_CHANGE_BLOCK_TYPE,
      'temporary-change-en',
    );
    localizedTemporary.initSvg();
    localizedTemporary.render();
    const enOptions = dropdownOptions(localizedTemporary);
    expect(enOptions).toHaveLength(1);
    expect(enOptions[0]?.[1]).toBe('');
    expect(String(enOptions[0]?.[0])).not.toBe(String(zhOptions[0]?.[0]));
    expect(readVariableChangeBlock(localizedTemporary)).toBeNull();
  });

  it('submits the selected declared variable through the existing update command', async () => {
    const { render, updateVariableChange } = mountWorkspace();
    const activeScene = scene('scene-update', [
      {
        id: 'set-score',
        type: 'variableSet',
        variableName: 'score',
        value: 0,
      },
      {
        id: 'set-route',
        type: 'variableSet',
        variableName: 'route',
        value: 0,
      },
      {
        id: 'change-score',
        type: 'variableChange',
        variableName: 'score',
        amount: 3,
      },
    ]);
    await render(activeScene, [activeScene]);
    const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
    const change = workspace.getBlockById('change-score');
    if (!change) {
      throw new Error('Expected projected variable-change block');
    }

    await act(async () => {
      Blockly.Events.disable();
      change.setFieldValue('route', VARIABLE_BLOCK_FIELDS.name);
      Blockly.Events.enable();
      workspace.fireChangeListener({
        type: Blockly.Events.BLOCK_CHANGE,
        blockId: change.id,
        element: 'field',
        name: VARIABLE_BLOCK_FIELDS.name,
        oldValue: 'score',
        newValue: 'route',
      } as unknown as Blockly.Events.Abstract);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateVariableChange).toHaveBeenCalledTimes(1);
    expect(updateVariableChange).toHaveBeenCalledWith({
      sceneId: 'scene-update',
      nodeId: 'change-score',
      variableName: 'route',
      amount: 3,
    });
  });

  it('creates a new numeric change with the first declared variable selected', async () => {
    const { addVariableChange, render } = mountWorkspace();
    const activeScene = scene('scene-create', [
      {
        id: 'set-score',
        type: 'variableSet',
        variableName: 'score',
        value: 0,
      },
      {
        id: 'set-route',
        type: 'variableSet',
        variableName: 'route',
        value: 0,
      },
    ]);
    await render(activeScene, [activeScene]);
    const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
    const lastSet = workspace.getBlockById('set-route');
    const temporary = workspace.newBlock(
      VARIABLE_CHANGE_BLOCK_TYPE,
      'temporary-declared-change',
    );
    temporary.initSvg();
    temporary.render();
    expect(dropdownValues(temporary)).toEqual(['score', 'route']);
    expect(temporary.getFieldValue(VARIABLE_BLOCK_FIELDS.name)).toBe('score');
    temporary.setFieldValue('route', VARIABLE_BLOCK_FIELDS.name);
    lastSet?.nextConnection?.connect(temporary.previousConnection!);

    await act(async () => {
      workspace.fireChangeListener({
        type: Blockly.Events.BLOCK_MOVE,
        blockId: temporary.id,
        reason: ['drag'],
      } as unknown as Blockly.Events.Abstract);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addVariableChange).toHaveBeenCalledTimes(1);
    expect(addVariableChange).toHaveBeenCalledWith({
      sceneId: 'scene-create',
      variableName: 'route',
      amount: 1,
      beforeNodeId: null,
    });
  });

  it('restores the authoritative dropdown value when an update is rejected', async () => {
    const { render, updateVariableChange } = mountWorkspace();
    updateVariableChange.mockResolvedValueOnce(false);
    const activeScene = scene('scene-rejected-update', [
      {
        id: 'set-score',
        type: 'variableSet',
        variableName: 'score',
        value: 0,
      },
      {
        id: 'set-route',
        type: 'variableSet',
        variableName: 'route',
        value: 0,
      },
      {
        id: 'change-score',
        type: 'variableChange',
        variableName: 'score',
        amount: 3,
      },
    ]);
    await render(activeScene, [activeScene]);
    const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
    const change = workspace.getBlockById('change-score');
    if (!change) {
      throw new Error('Expected projected variable-change block');
    }

    await act(async () => {
      Blockly.Events.disable();
      change.setFieldValue('route', VARIABLE_BLOCK_FIELDS.name);
      Blockly.Events.enable();
      workspace.fireChangeListener({
        type: Blockly.Events.BLOCK_CHANGE,
        blockId: change.id,
        element: 'field',
        name: VARIABLE_BLOCK_FIELDS.name,
        oldValue: 'score',
        newValue: 'route',
      } as unknown as Blockly.Events.Abstract);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateVariableChange).toHaveBeenCalledTimes(1);
    expect(
      workspace
        .getBlockById('change-score')
        ?.getFieldValue(VARIABLE_BLOCK_FIELDS.name),
    ).toBe('score');
  });
});
