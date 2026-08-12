import { describe, expect, it } from 'vitest';

import {
  projectSaveStatus,
  projectWindowTitle,
} from '../../src/renderer/projectSessionPresentation';

describe('project session presentation', () => {
  it('distinguishes unsaved, modified, and saved window titles', () => {
    expect(projectWindowTitle('故事', null, true)).toBe(
      '● 故事 [未保存] — VN Engine Editor',
    );
    expect(projectWindowTitle('故事', '/tmp/project.vn.json', true)).toBe(
      '● 故事 — VN Engine Editor',
    );
    expect(projectWindowTitle('故事', '/tmp/project.vn.json', false)).toBe(
      '故事 — VN Engine Editor',
    );
  });

  it('prioritizes saving over dirty status text', () => {
    expect(projectSaveStatus(true, true)).toBe('正在保存…');
    expect(projectSaveStatus(false, true)).toBe('未保存');
    expect(projectSaveStatus(false, false)).toBe('已保存');
  });
});
