import { describe, expect, it } from 'vitest';

import rendererConfig from '../../vite.renderer.config';

describe('Player Vite Renderer dependency optimization', () => {
  it('keeps live workspace packages out of the pre-bundle cache', () => {
    expect(rendererConfig.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining([
        '@vnengine/runtime',
        '@vnengine/player-ui',
      ]),
    );
  });
});
