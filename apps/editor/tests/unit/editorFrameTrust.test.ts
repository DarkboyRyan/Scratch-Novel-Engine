import { describe, expect, it } from 'vitest';

import { isSameEditorLocation } from '../../src/main/security/editorFrameTrust';

describe('editor frame trust', () => {
  it('accepts the same editor document with a hash or query', () => {
    const expected = 'http://localhost:5173/index.html';

    expect(
      isSameEditorLocation(
        'http://localhost:5173/index.html?mode=blocks#scene-1',
        expected,
      ),
    ).toBe(true);
  });

  it('rejects another origin, protocol, or document path', () => {
    const expected = 'file:///Applications/VN/index.html';

    expect(
      isSameEditorLocation('https://example.com/', expected),
    ).toBe(false);
    expect(
      isSameEditorLocation('file:///Applications/VN/other.html', expected),
    ).toBe(false);
    expect(isSameEditorLocation('not a URL', expected)).toBe(false);
  });
});
