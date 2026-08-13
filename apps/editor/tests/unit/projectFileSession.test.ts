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
      filePath: null,
      revision: 2,
      savedRevision: null,
      isDirty: true,
    });
  });

  it('becomes clean only when the user-visible file is committed', () => {
    const session = new ProjectFileSession();
    session.markCreated({
      revision: 2,
      savedRevision: null,
      isDirty: true,
    });

    session.markSaved('/projects/story/custom.vn.json', {
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    });

    expect(session.snapshot()).toEqual({
      filePath: '/projects/story/custom.vn.json',
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    });
  });
});
