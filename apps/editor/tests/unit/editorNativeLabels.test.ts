import { describe, expect, it } from 'vitest';

import { getEditorNativeLabels } from '../../src/main/i18n/editorNativeLabels';

describe('Editor native labels', () => {
  it('localizes project, asset and export native dialogs', () => {
    const labels = getEditorNativeLabels('en-US');
    expect(labels.project.openTitle).toBe('Open VN Engine Project');
    expect(labels.project.saveLocationMessage('Story', 'project.vn.json'))
      .toContain('Story');
    expect(labels.asset.importTitle(labels.asset.nouns.image))
      .toBe('Import Image Asset');
    expect(labels.export.webTitle).toBe('Export Web Game ZIP');
    expect(labels.export.button).toBe('Export');
    expect(labels.window).toEqual({
      untitledProject: 'Untitled Project',
      unsaved: 'Unsaved',
    });
  });
});
