/**
 * 文件主要作用：验证 Web Player template contract 的行为。
 * 测试覆盖：`Web Player template contract`。
 */

import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  loadWebPlayerTemplate,
  resolveWebPlayerTemplateRoot,
  WEB_PLAYER_TEMPLATE_FORMAT,
  WEB_PLAYER_TEMPLATE_VERSION,
} from '../../src/main/export/WebPlayerTemplate';

function fileRecord(filePath: string, contents: string) {
  return {
    path: filePath,
    bytes: Buffer.byteLength(contents),
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

describe('Web Player template contract', () => {
  const roots: string[] = [];

  async function createTemplate(overrides: Record<string, unknown> = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vn-web-template-'));
    roots.push(root);
    const index = '<!doctype html><div id="root"></div>\n';
    const script = 'console.log("web player");\n';
    await mkdir(path.join(root, 'payload', 'player-assets'), { recursive: true });
    await writeFile(path.join(root, 'payload', 'index.html'), index);
    await writeFile(path.join(root, 'payload', 'player-assets', 'player.js'), script);
    const manifest = {
      format: WEB_PLAYER_TEMPLATE_FORMAT,
      templateVersion: WEB_PLAYER_TEMPLATE_VERSION,
      payloadRoot: 'payload',
      entry: 'index.html',
      runtimeCompatibility: '>=1 <11',
      playerVersion: '1.0.0',
      files: [
        fileRecord('index.html', index),
        fileRecord('player-assets/player.js', script),
      ],
      ...overrides,
    };
    await writeFile(
      path.join(root, 'web-player-template.json'),
      `${JSON.stringify(manifest)}\n`,
    );
    return root;
  }

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('loads an exact signed payload manifest', async () => {
    const root = await createTemplate();

    await expect(loadWebPlayerTemplate(root)).resolves.toMatchObject({
      manifest: {
        format: WEB_PLAYER_TEMPLATE_FORMAT,
        templateVersion: WEB_PLAYER_TEMPLATE_VERSION,
        runtimeCompatibility: '>=1 <11',
        playerVersion: '1.0.0',
      },
    });
  });

  it('rejects unknown fields, unsafe paths, and incompatible runtimes', async () => {
    await expect(
      loadWebPlayerTemplate(await createTemplate({ extra: true })),
    ).rejects.toThrow('exact 契约');
    await expect(
      loadWebPlayerTemplate(await createTemplate({ payloadRoot: '../payload' })),
    ).rejects.toThrow('exact 契约');
    await expect(
      loadWebPlayerTemplate(
        await createTemplate({ runtimeCompatibility: '>=1 <6' }),
      ),
    ).rejects.toThrow('exact 契约');
  });

  it('rejects payload tampering and undeclared extra files', async () => {
    const changed = await createTemplate();
    await writeFile(
      path.join(changed, 'payload', 'player-assets', 'player.js'),
      'tampered\n',
    );
    await expect(loadWebPlayerTemplate(changed)).rejects.toThrow(
      '签名清单不一致',
    );

    const extra = await createTemplate();
    await writeFile(path.join(extra, 'payload', 'player-assets', 'extra.js'), 'x');
    await expect(loadWebPlayerTemplate(extra)).rejects.toThrow(
      '签名清单不一致',
    );
  });

  it.runIf(process.platform !== 'win32')(
    'rejects symbolic links in the signed payload',
    async () => {
      const root = await createTemplate();
      await rm(path.join(root, 'payload', 'player-assets', 'player.js'));
      await symlink(
        path.join(root, 'payload', 'index.html'),
        path.join(root, 'payload', 'player-assets', 'player.js'),
      );

      await expect(loadWebPlayerTemplate(root)).rejects.toThrow(
        '不允许符号链接',
      );
    },
  );

  it('resolves a Main-owned development override and packaged resource', () => {
    expect(
      resolveWebPlayerTemplateRoot(
        '/resources',
        { VN_WEB_PLAYER_TEMPLATE_ROOT: '/private/templates/web' },
        { isPackaged: false, appPath: '/workspace/apps/editor' },
      ),
    ).toBe(path.resolve('/private/templates/web'));
    expect(resolveWebPlayerTemplateRoot('/resources', {})).toBe(
      path.join('/resources', 'web-player-template'),
    );
    expect(
      resolveWebPlayerTemplateRoot('/resources', {}, {
        isPackaged: false,
        appPath: '/workspace/My_Game_Engine/apps/editor',
      }),
    ).toBe(
      path.resolve(
        '/workspace/My_Game_Engine/apps/editor',
        '..',
        '..',
        'engine',
        'stage',
        'web-player-template',
      ),
    );
    expect(() =>
      resolveWebPlayerTemplateRoot(
        '/resources',
        { VN_WEB_PLAYER_TEMPLATE_ROOT: '/tmp/untrusted' },
        { isPackaged: true, appPath: '/Applications/Editor.app' },
      ),
    ).toThrow('不允许覆盖');
  });
});
