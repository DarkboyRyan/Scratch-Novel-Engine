import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
    const backendPath = path.resolve(
      process.cwd(),
      '../../engine/build',
      executableName,
    );

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

  it('creates authoritative entities and normalizes committed dialogue', async () => {
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
      speaker: '旁白',
      text: '来自 C++ 的对白',
    });

    const invalidUpdate = await request('dialogue.update', {
      sceneId: sceneResponse.result.sceneId,
      nodeId: dialogueResponse.result.nodeId,
      speaker: 'Alice',
      text: '   ',
    });

    expect(invalidUpdate).toMatchObject({
      ok: false,
      error: { code: 'dialogue_text_required' },
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
      speaker: 'Alice',
      text: '',
    });

    expect(clearingCommittedText).toMatchObject({
      ok: false,
      error: { code: 'dialogue_text_required' },
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
});
