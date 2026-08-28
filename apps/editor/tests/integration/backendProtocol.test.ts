// 主要作用：通过真实 C++ JSONL 子进程验证 Editor 与引擎协议兼容性。
// 关键实现：覆盖项目、时间线、选择、逻辑与 CG 命令的完整往返。
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  BackendResponse,
  EngineMethod,
  EngineParamsByMethod,
} from '../../src/shared/engineProtocol';

type PendingResponse = {
  resolve: (response: BackendResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

describe('C++ JSONL backend', () => {
  let backend: ChildProcessWithoutNullStreams;
  let lines: Interface;
  let nextRequestId = 1;
  const pending = new Map<number, PendingResponse>();

  beforeAll(async () => {
    const executableName =
      process.platform === 'win32'
        ? 'vn_engine_backend.exe'
        : 'vn_engine_backend';
    const backendBuildDirectory = path.resolve(
      process.cwd(),
      '../../engine/build',
    );
    const backendPath = [
      path.join(backendBuildDirectory, executableName),
      path.join(backendBuildDirectory, 'Debug', executableName),
      path.join(backendBuildDirectory, 'Release', executableName),
    ].find((candidate) => existsSync(candidate)) ??
      path.join(backendBuildDirectory, executableName);

    backend = spawn(backendPath, [], {
      cwd: path.dirname(backendPath),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    lines = createInterface({ input: backend.stdout });

    lines.on('line', (line) => {
      const response = JSON.parse(line) as BackendResponse;
      const request = pending.get(response.id);

      if (!request) {
        return;
      }

      clearTimeout(request.timeout);
      pending.delete(response.id);
      request.resolve(response);
    });

    await new Promise<void>((resolve, reject) => {
      backend.once('spawn', resolve);
      backend.once('error', reject);
    });
  });

  afterAll(() => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('C++ backend test is ending'));
    }

    pending.clear();
    lines.close();
    backend.stdin.end();
    backend.kill();
  });

  function request<Method extends EngineMethod>(
    method: Method,
    params: EngineParamsByMethod[Method],
  ): Promise<BackendResponse> {
    const id = nextRequestId;
    nextRequestId += 1;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`C++ backend request timed out: ${method}`));
      }, 2_000);

      pending.set(id, { resolve, reject, timeout });
      backend.stdin.write(
        `${JSON.stringify({ id, method, params })}\n`,
      );
    });
  }

  function requestBackendOnly(
    method: 'project.open',
    params: { contents: string },
  ): Promise<BackendResponse> {
    const id = nextRequestId;
    nextRequestId += 1;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`C++ backend request timed out: ${method}`));
      }, 2_000);
      pending.set(id, { resolve, reject, timeout });
      backend.stdin.write(
        `${JSON.stringify({ id, method, params })}\n`,
      );
    });
  }

  it('normalizes dialogue whitespace without inventing author content', async () => {
    const projectResponse = await request('project.ensure', {});
    expect(projectResponse.ok).toBe(true);

    if (projectResponse.ok === false) {
      throw new Error(projectResponse.error.message);
    }

    expect(projectResponse.result.project.scenes).toHaveLength(1);
    expect(projectResponse.result.sceneId).toBe(
      projectResponse.result.project.entrySceneId,
    );

    const sceneResponse = await request('scene.add', {});
    expect(sceneResponse.ok).toBe(true);

    if (!sceneResponse.ok || !sceneResponse.result.sceneId) {
      throw new Error('C++ did not return the created scene ID');
    }

    const dialogueResponse = await request('dialogue.add', {
      sceneId: sceneResponse.result.sceneId,
      speaker: '   ',
      text: '  来自 C++ 的对白  ',
    });
    expect(dialogueResponse.ok).toBe(true);

    if (!dialogueResponse.ok || !dialogueResponse.result.nodeId) {
      throw new Error('C++ did not return the created dialogue ID');
    }

    const createdDialogue = dialogueResponse.result.project.scenes
      .find((scene) => scene.id === sceneResponse.result.sceneId)
      ?.nodes.find(
        (node) => node.id === dialogueResponse.result.nodeId,
      );

    expect(createdDialogue).toMatchObject({
      type: 'dialogue',
      speaker: '',
      text: '来自 C++ 的对白',
    });

    const emptyTextUpdate = await request('dialogue.update', {
      sceneId: sceneResponse.result.sceneId,
      nodeId: dialogueResponse.result.nodeId,
      speaker: 'Alice',
      text: '   ',
    });

    expect(emptyTextUpdate).toMatchObject({
      ok: true,
      result: {
        project: {
          scenes: expect.arrayContaining([
            expect.objectContaining({
              id: sceneResponse.result.sceneId,
              nodes: expect.arrayContaining([
                expect.objectContaining({
                  id: dialogueResponse.result.nodeId,
                  speaker: 'Alice',
                  text: '',
                }),
              ]),
            }),
          ]),
        },
      },
    });
  });

  it('persists speaker-first edits on an empty placeholder', async () => {
    const projectResponse = await request('project.create', {
      name: '空对白草稿测试',
    });

    if (!projectResponse.ok) {
      throw new Error(projectResponse.error.message);
    }

    const sceneId = projectResponse.result.project.entrySceneId;
    const placeholderResponse = await request('dialogue.add', {
      sceneId,
    });

    if (
      !placeholderResponse.ok ||
      !placeholderResponse.result.nodeId
    ) {
      throw new Error('C++ did not create the empty placeholder');
    }

    const nodeId = placeholderResponse.result.nodeId;
    const speakerDraft = await request('dialogue.update', {
      sceneId,
      nodeId,
      speaker: 'Alice',
      text: '',
    });

    if (!speakerDraft.ok) {
      throw new Error(speakerDraft.error.message);
    }

    expect(
      speakerDraft.result.project.scenes[0].nodes[0],
    ).toMatchObject({
      id: nodeId,
      speaker: 'Alice',
      text: '',
    });

    const committed = await request('dialogue.update', {
      sceneId,
      nodeId,
      speaker: 'Alice',
      text: '你好',
    });

    expect(committed).toMatchObject({
      ok: true,
      result: {
        project: {
          scenes: [
            {
              nodes: [
                {
                  id: nodeId,
                  speaker: 'Alice',
                  text: '你好',
                },
              ],
            },
          ],
        },
      },
    });

    const clearingCommittedText = await request('dialogue.update', {
      sceneId,
      nodeId,
      speaker: '',
      text: '',
    });

    expect(clearingCommittedText).toMatchObject({
      ok: true,
      result: {
        project: {
          scenes: [{
            nodes: [{ id: nodeId, speaker: '', text: '' }],
          }],
        },
      },
    });

    const speakerOnlyDraft = await request('dialogue.add', {
      sceneId,
      speaker: 'Bob',
    });

    if (!speakerOnlyDraft.ok || !speakerOnlyDraft.result.nodeId) {
      throw new Error('C++ did not create the speaker-only draft');
    }

    const createdDraft = speakerOnlyDraft.result.project.scenes[0].nodes.find(
      (node) => node.id === speakerOnlyDraft.result.nodeId,
    );
    expect(createdDraft).toMatchObject({
      speaker: 'Bob',
      text: '',
    });
  });

  it('inserts dialogue before an anchor and rejects invalid placement', async () => {
    const projectResponse = await request('project.create', {
      name: '插入顺序测试',
    });

    if (!projectResponse.ok) {
      throw new Error(projectResponse.error.message);
    }

    const sceneResponse = await request('scene.add', {});

    if (!sceneResponse.ok || !sceneResponse.result.sceneId) {
      throw new Error('C++ did not return the created scene ID');
    }

    const sceneId = sceneResponse.result.sceneId;
    const firstResponse = await request('dialogue.add', {
      sceneId,
      speaker: 'A',
      text: '第一句',
    });
    const secondResponse = await request('dialogue.add', {
      sceneId,
      speaker: 'B',
      text: '第二句',
    });

    if (
      !firstResponse.ok ||
      !firstResponse.result.nodeId ||
      !secondResponse.ok ||
      !secondResponse.result.nodeId
    ) {
      throw new Error('C++ did not create the anchor dialogues');
    }

    const firstId = firstResponse.result.nodeId;
    const secondId = secondResponse.result.nodeId;
    const middleResponse = await request('dialogue.add', {
      sceneId,
      beforeNodeId: secondId,
    });

    if (!middleResponse.ok || !middleResponse.result.nodeId) {
      throw new Error('C++ did not insert the middle dialogue');
    }

    const middleId = middleResponse.result.nodeId;
    const startResponse = await request('dialogue.add', {
      sceneId,
      beforeNodeId: firstId,
    });

    if (!startResponse.ok || !startResponse.result.nodeId) {
      throw new Error('C++ did not insert the first dialogue');
    }

    const startId = startResponse.result.nodeId;
    const insertedScene = startResponse.result.project.scenes.find(
      (scene) => scene.id === sceneId,
    );
    const expectedOrder = [startId, firstId, middleId, secondId];

    expect(insertedScene?.nodes.map((node) => node.id)).toEqual(
      expectedOrder,
    );

    const missingAnchorResponse = await request('dialogue.add', {
      sceneId,
      beforeNodeId: 'missing-node',
    });

    expect(missingAnchorResponse).toMatchObject({
      ok: false,
      error: { code: 'dialogue_not_found' },
    });

    const conflictResponse = await request('dialogue.add', {
      sceneId,
      afterNodeId: firstId,
      beforeNodeId: secondId,
    });

    expect(conflictResponse).toMatchObject({
      ok: false,
      error: { code: 'dialogue_placement_conflict' },
    });

    const finalProjectResponse = await request('project.get', {});

    if (!finalProjectResponse.ok) {
      throw new Error(finalProjectResponse.error.message);
    }

    const finalScene = finalProjectResponse.result.project.scenes.find(
      (scene) => scene.id === sceneId,
    );

    expect(finalScene?.nodes.map((node) => node.id)).toEqual(
      expectedOrder,
    );
  });

  it('reorders one dialogue before an anchor or to the end', async () => {
    const projectResponse = await request('project.create', {
      name: '自由排序测试',
    });

    if (!projectResponse.ok) {
      throw new Error(projectResponse.error.message);
    }

    const sceneId = projectResponse.result.project.entrySceneId;
    const createdIds: string[] = [];

    for (const [speaker, text] of [
      ['A', '第一句'],
      ['B', '第二句'],
      ['C', '第三句'],
      ['D', '第四句'],
    ]) {
      const response = await request('dialogue.add', {
        sceneId,
        speaker,
        text,
      });

      if (!response.ok || !response.result.nodeId) {
        throw new Error('C++ did not create a dialogue for reorder test');
      }

      createdIds.push(response.result.nodeId);
    }

    const [firstId, secondId, thirdId, fourthId] = createdIds;
    const moveToMiddle = await request('dialogue.reorder', {
      sceneId,
      nodeId: fourthId,
      beforeNodeId: secondId,
    });

    if (!moveToMiddle.ok) {
      throw new Error(moveToMiddle.error.message);
    }

    expect(
      moveToMiddle.result.project.scenes[0].nodes.map(
        (node) => node.id,
      ),
    ).toEqual([firstId, fourthId, secondId, thirdId]);

    const moveToEnd = await request('dialogue.reorder', {
      sceneId,
      nodeId: firstId,
      beforeNodeId: null,
    });

    if (!moveToEnd.ok) {
      throw new Error(moveToEnd.error.message);
    }

    expect(
      moveToEnd.result.project.scenes[0].nodes.map(
        (node) => node.id,
      ),
    ).toEqual([fourthId, secondId, thirdId, firstId]);

    const missingAnchor = await request('dialogue.reorder', {
      sceneId,
      nodeId: firstId,
      beforeNodeId: 'missing-node',
    });

    expect(missingAnchor).toMatchObject({
      ok: false,
      error: { code: 'dialogue_not_found' },
    });

    const unchanged = await request('project.get', {});
    if (!unchanged.ok) {
      throw new Error(unchanged.error.message);
    }

    expect(
      unchanged.result.project.scenes[0].nodes.map(
        (node) => node.id,
      ),
    ).toEqual([fourthId, secondId, thirdId, firstId]);
  });

  it('reorders multiple dialogues as one atomic bundle', async () => {
    const projectResponse = await request('project.create', {
      name: '多选重排测试',
    });

    if (!projectResponse.ok) {
      throw new Error(projectResponse.error.message);
    }

    const sceneId = projectResponse.result.project.entrySceneId;
    const createdIds: string[] = [];

    for (const text of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const response = await request('dialogue.add', {
        sceneId,
        speaker: text,
        text,
      });

      if (!response.ok || !response.result.nodeId) {
        throw new Error('C++ did not create a dialogue for group reorder');
      }
      createdIds.push(response.result.nodeId);
    }

    const [firstId, secondId, thirdId, fourthId, fifthId, sixthId] =
      createdIds;
    const moved = await request('dialogue.reorderMany', {
      sceneId,
      // 后端必须忽略 payload 顺序，仍按 Scene 中的 B、D 顺序移动。
      nodeIds: [fourthId, secondId],
      beforeNodeId: fifthId,
    });

    if (!moved.ok) {
      throw new Error(moved.error.message);
    }
    expect(
      moved.result.project.scenes[0].nodes.map((node) => node.id),
    ).toEqual([
      firstId,
      thirdId,
      secondId,
      fourthId,
      fifthId,
      sixthId,
    ]);

    const movedToEnd = await request('dialogue.reorderMany', {
      sceneId,
      nodeIds: [secondId, fourthId],
      beforeNodeId: null,
    });

    if (!movedToEnd.ok) {
      throw new Error(movedToEnd.error.message);
    }
    const expectedOrder = [
      firstId,
      thirdId,
      fifthId,
      sixthId,
      secondId,
      fourthId,
    ];
    expect(
      movedToEnd.result.project.scenes[0].nodes.map(
        (node) => node.id,
      ),
    ).toEqual(expectedOrder);

    const legalNoOp = await request('dialogue.reorderMany', {
      sceneId,
      nodeIds: [secondId, fourthId],
      beforeNodeId: null,
    });
    expect(legalNoOp).toMatchObject({ ok: true });
    if (legalNoOp.ok) {
      expect(
        legalNoOp.result.project.scenes[0].nodes.map(
          (node) => node.id,
        ),
      ).toEqual(expectedOrder);
    }

    const selectedAnchor = await request('dialogue.reorderMany', {
      sceneId,
      nodeIds: [secondId, fourthId],
      beforeNodeId: secondId,
    });
    expect(selectedAnchor).toMatchObject({
      ok: false,
      error: { code: 'invalid_params' },
    });

    const missingNode = await request('dialogue.reorderMany', {
      sceneId,
      nodeIds: [secondId, 'missing-node'],
      beforeNodeId: null,
    });
    expect(missingNode).toMatchObject({
      ok: false,
      error: { code: 'dialogue_not_found' },
    });

    const missingAnchor = await request('dialogue.reorderMany', {
      sceneId,
      nodeIds: [secondId, fourthId],
      beforeNodeId: 'missing-anchor',
    });
    expect(missingAnchor).toMatchObject({
      ok: false,
      error: { code: 'dialogue_not_found' },
    });

    const emptySelection = await request('dialogue.reorderMany', {
      sceneId,
      nodeIds: [],
      beforeNodeId: null,
    });
    expect(emptySelection).toMatchObject({
      ok: false,
      error: { code: 'invalid_params' },
    });

    const duplicateSelection = await request('dialogue.reorderMany', {
      sceneId,
      nodeIds: [secondId, secondId],
      beforeNodeId: null,
    });
    expect(duplicateSelection).toMatchObject({
      ok: false,
      error: { code: 'invalid_params' },
    });

    const unchanged = await request('project.get', {});
    if (!unchanged.ok) {
      throw new Error(unchanged.error.message);
    }
    expect(
      unchanged.result.project.scenes[0].nodes.map(
        (node) => node.id,
      ),
    ).toEqual(expectedOrder);
  });

  it('deletes multiple dialogues atomically', async () => {
    const projectResponse = await request('project.create', {
      name: '多选删除测试',
    });

    if (!projectResponse.ok) {
      throw new Error(projectResponse.error.message);
    }

    const sceneId = projectResponse.result.project.entrySceneId;
    const createdIds: string[] = [];

    for (const text of ['第一句', '第二句', '第三句']) {
      const response = await request('dialogue.add', {
        sceneId,
        speaker: '旁白',
        text,
      });

      if (!response.ok || !response.result.nodeId) {
        throw new Error('C++ did not create a dialogue for delete test');
      }
      createdIds.push(response.result.nodeId);
    }

    const invalidDelete = await request('dialogue.deleteMany', {
      sceneId,
      nodeIds: [createdIds[0], 'missing-node'],
    });

    expect(invalidDelete).toMatchObject({
      ok: false,
      error: { code: 'dialogue_not_found' },
    });

    const unchanged = await request('project.get', {});
    if (!unchanged.ok) {
      throw new Error(unchanged.error.message);
    }
    expect(unchanged.result.project.scenes[0].nodes).toHaveLength(3);

    const deleted = await request('dialogue.deleteMany', {
      sceneId,
      nodeIds: [createdIds[0], createdIds[2]],
    });

    if (!deleted.ok) {
      throw new Error(deleted.error.message);
    }
    expect(
      deleted.result.project.scenes[0].nodes.map(
        (node) => node.id,
      ),
    ).toEqual([createdIds[1]]);
  });

  it('moves and deletes mixed dialogue/background timeline nodes atomically', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'vn-engine-timeline-integration-'),
    );
    const fixturePath = path.join(directory, 'project.vn.json');
    const imageAssetId = 'image-1';
    const manifestContents = JSON.stringify({
      format: 'vn-engine-project',
      fileVersion: 4,
      project: {
        schemaVersion: 1,
        id: 'timeline-project',
        name: '混合时间线协议测试',
        entrySceneId: 'scene-1',
        scenes: [
          {
            schemaVersion: 1,
            id: 'scene-1',
            name: '场景 1',
            visuals: {
              backgroundAssetId: null,
              characters: [],
            },
            nodes: [],
          },
        ],
      },
      assets: [
        {
          id: imageAssetId,
          type: 'image',
          relativePath: 'assets/images/image-1.png',
          displayName: '测试背景',
        },
      ],
    });
    await writeFile(fixturePath, manifestContents, 'utf8');

    try {
      const opened = await requestBackendOnly('project.open', {
        contents: manifestContents,
      });

      if (!opened.ok) {
        throw new Error(opened.error.message);
      }

      const sceneId = opened.result.project.entrySceneId;

      const background = await request('background.add', {
        sceneId,
      });
      if (!background.ok || !background.result.nodeId) {
        throw new Error('C++ did not return a background node ID');
      }
      const backgroundId = background.result.nodeId;
      expect(
        background.result.project.scenes[0].nodes.find(
          (node) => node.id === backgroundId,
        ),
      ).toEqual({
        id: backgroundId,
        type: 'background',
        assetId: null,
      });

      const filledBackground = await request('background.update', {
        sceneId,
        nodeId: backgroundId,
        assetId: imageAssetId,
      });
      expect(filledBackground.ok).toBe(true);

      const character = await request('character.add', {
        sceneId,
        afterNodeId: backgroundId,
      });
      if (!character.ok || !character.result.nodeId) {
        throw new Error('C++ did not return a character node ID');
      }
      const characterId = character.result.nodeId;
      expect(
        character.result.project.scenes[0].nodes.find(
          (node) => node.id === characterId,
        ),
      ).toEqual({
        id: characterId,
        type: 'character',
        mode: 'show',
        assetId: null,
        slot: 'center',
        layer: 1,
        position: null,
        effect: null,
      });

      const filledCharacter = await request('character.update', {
        sceneId,
        nodeId: characterId,
        assetId: imageAssetId,
        slot: 'left',
        layer: 2,
        position: { x: 24, y: 88 },
      });
      expect(filledCharacter.ok).toBe(true);

      const effect = {
        type: 'shake' as const,
        durationMs: 600,
        intensity: 'normal' as const,
      };
      const effectUpdated = await request('characterEffect.update', {
        sceneId,
        nodeId: characterId,
        effect,
      });
      expect(effectUpdated.ok).toBe(true);

      const targetCharacter = await request('character.add', {
        sceneId,
        afterNodeId: characterId,
      });
      if (!targetCharacter.ok || !targetCharacter.result.nodeId) {
        throw new Error('C++ did not return the target character node ID');
      }
      const targetCharacterId = targetCharacter.result.nodeId;
      const targetFilled = await request('character.update', {
        sceneId,
        nodeId: targetCharacterId,
        assetId: imageAssetId,
        slot: 'right',
        layer: 3,
        position: null,
      });
      expect(targetFilled.ok).toBe(true);

      const effectMoved = await request('characterEffect.move', {
        sceneId,
        fromNodeId: characterId,
        toNodeId: targetCharacterId,
        effect,
      });
      if (!effectMoved.ok) {
        throw new Error(effectMoved.error.message);
      }
      const movedCharacters = effectMoved.result.project.scenes[0].nodes
        .filter((node) => node.type === 'character');
      expect(movedCharacters.find((node) => node.id === characterId))
        .toMatchObject({ effect: null });
      expect(movedCharacters.find((node) => node.id === targetCharacterId))
        .toMatchObject({ effect });

      const ordinaryUpdate = await request('character.update', {
        sceneId,
        nodeId: targetCharacterId,
        assetId: imageAssetId,
        slot: 'center',
        layer: 4,
        position: { x: 50, y: 90 },
      });
      if (!ordinaryUpdate.ok) {
        throw new Error(ordinaryUpdate.error.message);
      }
      expect(ordinaryUpdate.result.project.scenes[0].nodes.find(
        (node) => node.id === targetCharacterId,
      )).toMatchObject({ effect });

      const dialogue = await request('dialogue.add', {
        sceneId,
        speaker: 'A',
        text: '混合时间线',
      });
      if (!dialogue.ok || !dialogue.result.nodeId) {
        throw new Error('C++ did not return a dialogue node ID');
      }

      const moved = await request('timeline.reorderMany', {
        sceneId,
        nodeIds: [
          dialogue.result.nodeId,
          backgroundId,
          characterId,
          targetCharacterId,
        ],
        beforeNodeId: null,
      });
      expect(moved.ok).toBe(true);

      const deleted = await request('timeline.deleteMany', {
        sceneId,
        nodeIds: [
          backgroundId,
          characterId,
          targetCharacterId,
          dialogue.result.nodeId,
        ],
      });
      expect(deleted.ok).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('creates, edits, reorders, and deletes choice options through the real backend', async () => {
    const projectResponse = await request('project.create', {
      name: '选项分支协议测试',
    });

    if (!projectResponse.ok) {
      throw new Error(projectResponse.error.message);
    }

    const entrySceneId =
      projectResponse.result.project.entrySceneId;
    const secondScene = await request('scene.add', {});
    const thirdScene = await request('scene.add', {});

    if (
      !secondScene.ok ||
      !secondScene.result.sceneId ||
      !thirdScene.ok ||
      !thirdScene.result.sceneId
    ) {
      throw new Error('C++ did not create target scenes for choice test');
    }

    const choiceResponse = await request('choice.add', {
      sceneId: entrySceneId,
    });

    if (!choiceResponse.ok || !choiceResponse.result.nodeId) {
      throw new Error('C++ did not create a choice node');
    }

    const choiceNodeId = choiceResponse.result.nodeId;
    expect(
      choiceResponse.result.project.scenes[0].nodes.find(
        (node) => node.id === choiceNodeId,
      ),
    ).toEqual({
      id: choiceNodeId,
      type: 'choice',
      options: [],
    });

    const firstOptionResponse = await request(
      'choice.option.add',
      {
        sceneId: entrySceneId,
        nodeId: choiceNodeId,
        text: '  走向地下室  ',
        targetSceneId: secondScene.result.sceneId,
      },
    );

    if (
      !firstOptionResponse.ok ||
      !firstOptionResponse.result.optionId
    ) {
      throw new Error('C++ did not create the first choice option');
    }

    const firstOptionId = firstOptionResponse.result.optionId;
    const secondOptionResponse = await request(
      'choice.option.add',
      {
        sceneId: entrySceneId,
        nodeId: choiceNodeId,
        text: '留在原地',
        targetSceneId: entrySceneId,
        beforeOptionId: firstOptionId,
      },
    );

    if (
      !secondOptionResponse.ok ||
      !secondOptionResponse.result.optionId
    ) {
      throw new Error('C++ did not create the second choice option');
    }

    const secondOptionId = secondOptionResponse.result.optionId;
    const createdChoice =
      secondOptionResponse.result.project.scenes
        .find((scene) => scene.id === entrySceneId)
        ?.nodes.find(
          (node) => node.id === choiceNodeId && node.type === 'choice',
        );

    expect(createdChoice).toEqual({
      id: choiceNodeId,
      type: 'choice',
      options: [
        {
          id: secondOptionId,
          text: '留在原地',
          targetSceneId: entrySceneId,
        },
        {
          id: firstOptionId,
          text: '走向地下室',
          targetSceneId: secondScene.result.sceneId,
        },
      ],
    });

    const updated = await request('choice.option.update', {
      sceneId: entrySceneId,
      nodeId: choiceNodeId,
      optionId: firstOptionId,
      text: '前往天台',
      targetSceneId: thirdScene.result.sceneId,
    });
    expect(updated.ok).toBe(true);

    const reordered = await request('choice.option.reorder', {
      sceneId: entrySceneId,
      nodeId: choiceNodeId,
      optionId: firstOptionId,
      beforeOptionId: secondOptionId,
    });

    if (!reordered.ok) {
      throw new Error(reordered.error.message);
    }

    const reorderedChoice = reordered.result.project.scenes
      .find((scene) => scene.id === entrySceneId)
      ?.nodes.find(
        (node) => node.id === choiceNodeId && node.type === 'choice',
      );
    expect(
      reorderedChoice?.type === 'choice'
        ? reorderedChoice.options.map((option) => option.id)
        : [],
    ).toEqual([firstOptionId, secondOptionId]);

    const invalidTarget = await request('choice.option.update', {
      sceneId: entrySceneId,
      nodeId: choiceNodeId,
      optionId: secondOptionId,
      text: '不存在的出口',
      targetSceneId: 'missing-scene',
    });
    expect(invalidTarget).toMatchObject({
      ok: false,
      error: { code: 'target_scene_not_found' },
    });

    const deleted = await request('choice.option.delete', {
      sceneId: entrySceneId,
      nodeId: choiceNodeId,
      optionId: secondOptionId,
    });

    if (!deleted.ok) {
      throw new Error(deleted.error.message);
    }

    const finalChoice = deleted.result.project.scenes
      .find((scene) => scene.id === entrySceneId)
      ?.nodes.find(
        (node) => node.id === choiceNodeId && node.type === 'choice',
      );
    expect(finalChoice).toEqual({
      id: choiceNodeId,
      type: 'choice',
      options: [
        {
          id: firstOptionId,
          text: '前往天台',
          targetSceneId: thirdScene.result.sceneId,
        },
      ],
    });
  });

  it('round-trips paired CG display commands without timing out', async () => {
    const manifestContents = JSON.stringify({
      format: 'vn-engine-project',
      fileVersion: 17,
      project: {
        schemaVersion: 1,
        id: 'cg-display-project',
        name: 'CG display protocol',
        entrySceneId: 'scene-1',
        startScreen: {
          title: 'CG display protocol',
          backgroundAssetId: null,
          musicAssetId: null,
        },
        cgGallery: {
          pages: [{ imageAssetIds: Array(9).fill(null) }],
        },
        scenes: [{
          schemaVersion: 1,
          id: 'scene-1',
          name: 'Scene 1',
          visuals: { backgroundAssetId: null, characters: [] },
          nodes: [],
        }],
      },
      assets: [{
        id: 'cg-image-1',
        type: 'image',
        relativePath: 'assets/images/cg-image-1.png',
        displayName: 'CG 1',
      }],
    });
    const opened = await requestBackendOnly('project.open', {
      contents: manifestContents,
    });
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }

    const display = await request('cgDisplay.add', {
      sceneId: 'scene-1',
      assetId: 'cg-image-1',
      leadInMs: 1200,
    });
    if (!display.ok || !display.result.nodeId) {
      throw new Error('C++ did not create a CG display');
    }
    const displayId = display.result.nodeId;
    const endDisplay = display.result.project.scenes[0].nodes.find(
      (node) => node.type === 'cgEndDisplay',
    );
    if (!endDisplay || endDisplay.type !== 'cgEndDisplay') {
      throw new Error('C++ did not create a CG end marker');
    }
    expect(endDisplay.cgDisplayNodeId).toBe(displayId);

    const dialogue = await request('dialogue.add', {
      sceneId: 'scene-1',
      speaker: 'Narrator',
      text: 'The CG remains visible.',
      beforeNodeId: endDisplay.id,
    });
    expect(dialogue.ok).toBe(true);

    const updated = await request('cgDisplay.update', {
      sceneId: 'scene-1',
      nodeId: displayId,
      assetId: 'cg-image-1',
      leadInMs: 60000,
    });
    if (!updated.ok) {
      throw new Error(updated.error.message);
    }
    expect(updated.result.project.scenes[0].nodes.find(
      (node) => node.id === displayId,
    )).toEqual({
      id: displayId,
      type: 'cgDisplay',
      assetId: 'cg-image-1',
      leadInMs: 60000,
    });

    const deleted = await request('cgDisplay.delete', {
      sceneId: 'scene-1',
      nodeId: displayId,
    });
    if (!deleted.ok) {
      throw new Error(deleted.error.message);
    }
    expect(deleted.result.project.scenes[0].nodes).toEqual([]);
  });
});
