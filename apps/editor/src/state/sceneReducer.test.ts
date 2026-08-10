import { describe, expect, it } from 'vitest';

import type {
  DialogueNode,
  SceneDocument,
} from '../model/scene';
import { sceneReducer } from './sceneReducer';

describe('sceneReducer', () => {
  it('在指定节点后插入新对白', () => {
    // Arrange：准备测试所需要的原始场景。
    const firstDialogue: DialogueNode = {
      id: 'dialogue-1',
      type: 'dialogue',
      speaker: 'Alice',
      text: '第一句话',
    };

    const secondDialogue: DialogueNode = {
      id: 'dialogue-2',
      type: 'dialogue',
      speaker: 'Bob',
      text: '第二句话',
    };

    const newDialogue: DialogueNode = {
      id: 'dialogue-new',
      type: 'dialogue',
      speaker: '',
      text: '',
    };

    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: '测试场景',
      nodes: [firstDialogue, secondDialogue],
    };

    // Act：调用 Reducer，模拟在第一条对白后点击“+”。
    const nextScene = sceneReducer(scene, {
      type: 'dialogue/add',
      node: newDialogue,
      afterNodeId: firstDialogue.id,
    });

    // Assert：检查新节点是否位于第一条和第二条之间。
    expect(nextScene.nodes.map((node) => node.id)).toEqual([
      'dialogue-1',
      'dialogue-new',
      'dialogue-2',
    ]);

    // Reducer 不能直接修改原场景。
    expect(scene.nodes.map((node) => node.id)).toEqual([
      'dialogue-1',
      'dialogue-2',
    ]);

    // 更新结果应该是一个新的 SceneDocument。
    expect(nextScene).not.toBe(scene);
  });
});