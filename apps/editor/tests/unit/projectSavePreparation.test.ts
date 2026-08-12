import { describe, expect, it, vi } from 'vitest';

import { prepareProjectSave } from '../../src/renderer/projectSavePreparation';

describe('prepareProjectSave', () => {
  it('flushes the active Blockly field before committing the project name', async () => {
    const order: string[] = [];

    await expect(
      prepareProjectSave({
        editorMode: 'blocks',
        flushBlockDraft: vi.fn(async () => {
          order.push('block-draft');
          return true;
        }),
        commitProjectName: vi.fn(async () => {
          order.push('project-name');
          return true;
        }),
        commitFormDraft: vi.fn(async () => {
          order.push('form-draft');
          return true;
        }),
      }),
    ).resolves.toBe(true);

    expect(order).toEqual(['block-draft', 'project-name']);
  });

  it('commits the project name before the form draft', async () => {
    const order: string[] = [];

    await expect(
      prepareProjectSave({
        editorMode: 'form',
        flushBlockDraft: vi.fn(async () => true),
        commitProjectName: vi.fn(async () => {
          order.push('project-name');
          return true;
        }),
        commitFormDraft: vi.fn(async () => {
          order.push('form-draft');
          return true;
        }),
      }),
    ).resolves.toBe(true);

    expect(order).toEqual(['project-name', 'form-draft']);
  });

  it('stops before disk save when any draft commit fails', async () => {
    const commitProjectName = vi.fn(async () => true);
    const commitFormDraft = vi.fn(async () => true);

    await expect(
      prepareProjectSave({
        editorMode: 'blocks',
        flushBlockDraft: vi.fn(async () => false),
        commitProjectName,
        commitFormDraft,
      }),
    ).resolves.toBe(false);

    expect(commitProjectName).not.toHaveBeenCalled();
    expect(commitFormDraft).not.toHaveBeenCalled();
  });
});
