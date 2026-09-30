/**
 * 文件主要作用：验证 project file IPC validation 的行为。
 * 测试覆盖：`project file IPC validation`。
 */

import { describe, expect, it } from 'vitest';

import { isProjectFileInvocation } from '../../src/main/ipc/validateProjectFileInvocation';

describe('project file IPC validation', () => {
  it('accepts bounded inert drafts and rejects paths, malformed fields and oversized recovery payloads', () => {
    const draft = { projectId: 'story', code: [{ key: 'story:scene', source: 'invalid code', baseSource: '' }] };
    expect(isProjectFileInvocation({ action: 'checkpoint-drafts', params: { drafts: draft } })).toBe(true);
    expect(isProjectFileInvocation({ action: 'recover', params: {} })).toBe(true);
    expect(isProjectFileInvocation({ action: 'recover', params: { filePath: '/tmp/forged' } })).toBe(false);
    for (const drafts of [
      { ...draft, filePath: '/tmp/forged' },
      { ...draft, code: [{ ...draft.code[0], source: 12n }] },
      { ...draft, code: [{ ...draft.code[0], source: '字'.repeat(750_000) }] },
      { ...draft, code: Array(101).fill(draft.code[0]) },
    ]) {
      expect(isProjectFileInvocation({ action: 'checkpoint-drafts', params: { drafts } })).toBe(false);
    }
  });
  it('accepts create with an optional project name', () => {
    expect(
      isProjectFileInvocation({ action: 'create', params: {} }),
    ).toBe(true);
    expect(
      isProjectFileInvocation({
        action: 'create',
        params: { name: 'My story' },
      }),
    ).toBe(true);
  });

  it('accepts open only when Renderer supplies no path', () => {
    expect(
      isProjectFileInvocation({ action: 'open', params: {} }),
    ).toBe(true);

    expect(
      isProjectFileInvocation({
        action: 'open',
        params: { filePath: '/tmp/project.vn.json' },
      }),
    ).toBe(false);
    expect(
      isProjectFileInvocation({
        action: 'open',
        params: { path: '/tmp/project.vn.json' },
      }),
    ).toBe(false);
  });

  it('accepts save only when Renderer supplies no path', () => {
    expect(
      isProjectFileInvocation({ action: 'save', params: {} }),
    ).toBe(true);
    expect(
      isProjectFileInvocation({
        action: 'save',
        params: { filePath: '/tmp/project.vn.json' },
      }),
    ).toBe(false);
  });

  it('accepts only an empty get-session request', () => {
    expect(
      isProjectFileInvocation({
        action: 'get-session',
        params: {},
      }),
    ).toBe(true);
    expect(
      isProjectFileInvocation({
        action: 'get-session',
        params: { filePath: '/tmp/project.vn.json' },
      }),
    ).toBe(false);
  });

  it('rejects unknown fields, actions, and malformed params', () => {
    for (const invocation of [
      { action: 'delete', params: {} },
      { action: 'open', params: null },
      { action: 'create', params: { name: 7 } },
      { action: 'create', params: {}, filePath: '/tmp/project.vn.json' },
    ]) {
      expect(isProjectFileInvocation(invocation)).toBe(false);
    }
  });
});
