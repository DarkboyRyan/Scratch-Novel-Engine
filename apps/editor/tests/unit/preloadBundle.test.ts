import { builtinModules } from 'node:module';
import path from 'node:path';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const editorRoot = path.resolve(__dirname, '../..');

describe('sandboxed preload bundle', () => {
  it('does not import Node built-ins outside Electron sandbox support', async () => {
    const nodeBuiltins = [
      ...builtinModules,
      ...builtinModules.map((moduleName) => `node:${moduleName}`),
    ];
    const buildResult = await build({
      configFile: false,
      root: editorRoot,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        copyPublicDir: false,
        lib: {
          entry: path.join(editorRoot, 'src/preload.ts'),
          formats: ['cjs'],
          fileName: 'preload',
        },
        rollupOptions: {
          external: ['electron', ...nodeBuiltins],
        },
      },
    });

    if (!Array.isArray(buildResult) && 'close' in buildResult) {
      throw new Error('Preload safety test unexpectedly entered watch mode.');
    }
    const outputs = Array.isArray(buildResult)
      ? buildResult
      : [buildResult];
    const chunks = outputs.flatMap((output) =>
      output.output.filter((item) => item.type === 'chunk'),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].imports).toEqual(['electron']);
  });
});
