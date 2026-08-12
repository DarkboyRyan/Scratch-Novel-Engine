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
});
