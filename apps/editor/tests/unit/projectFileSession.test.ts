import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ProjectFileSession } from '../../src/main/project/ProjectFileSession';

describe('ProjectFileSession logical save boundary', () => {
  it('stays logically dirty after a private C++ working save', () => {
    const session = new ProjectFileSession();
    session.markCreated({
      revision: 2,
      savedRevision: null,
      isDirty: true,
    });

    session.updateEngineSession({
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    });

    expect(session.snapshot()).toEqual({
      hasStorage: false,
      projectFolderName: null,
      revision: 2,
      savedRevision: null,
      isDirty: true,
    });
  });

  it('becomes clean only when the user-visible file is committed', () => {
    const session = new ProjectFileSession();
    const manifestContents = '{"format":"vn-engine-project"}\n';
    session.markCreated({
      revision: 2,
      savedRevision: null,
      isDirty: true,
    });

    session.markSaved('/projects/我的故事', {
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    }, manifestContents);

    expect(session.snapshot()).toEqual({
      hasStorage: true,
      projectFolderName: '我的故事',
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    });
    expect(session.getSavedManifestSha256()).toBe(
      createHash('sha256')
        .update(manifestContents, 'utf8')
        .digest('hex'),
    );
  });

  it('keeps native paths in Main-only accessors', () => {
    const session = new ProjectFileSession();
    session.markOpened('/projects/story', {
      revision: 1,
      savedRevision: 1,
      isDirty: false,
    });

    expect(session.getProjectRootPath()).toBe('/projects/story');
    expect(session.getManifestPath()).toBe(
      '/projects/story/project.vn.json',
    );
    expect(session.snapshot()).not.toHaveProperty('filePath');
    expect(session.snapshot()).not.toHaveProperty('manifestSha256');
  });

  it('clears the private saved-manifest digest for a new project', () => {
    const session = new ProjectFileSession();
    session.markOpened(
      '/projects/story',
      { revision: 1, savedRevision: 1, isDirty: false },
      '{"format":"vn-engine-project"}\n',
    );
    expect(session.getSavedManifestSha256()).toMatch(/^[a-f0-9]{64}$/);

    session.markCreated({
      revision: 2,
      savedRevision: null,
      isDirty: true,
    });
    expect(session.getSavedManifestSha256()).toBeNull();
  });
});
