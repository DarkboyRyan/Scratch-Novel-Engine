/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证独立资源管理工作区的搜索、筛选、排序、导入与按需媒体预览。
 * 测试覆盖：Unicode 名称搜索、分类计数、右键菜单、单选详情与音视频切换清理。
 */

import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AssetManager,
  filterAndSortAssets,
  MAX_ASSET_DISPLAY_NAME_BYTES,
  validateAssetDisplayName,
} from '../../src/renderer/features/assets/AssetManager';
import { logicalAssetPath } from '../../src/renderer/features/assets/logicalAssetPath';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  type AssetDocument,
  type ProjectDocument,
} from '../../src/shared/projectTypes';

const imageWithPrivateStorageMetadata = {
  id: 'image-private-key',
  type: 'image',
  displayName: 'Ｃａｆｅ́ 10.png',
  relativePath: 'assets/images/private-storage-name.png',
} satisfies AssetDocument & { relativePath: string };

const assets: AssetDocument[] = [
  imageWithPrivateStorageMetadata,
  { id: 'audio-private-key', type: 'audio', displayName: 'Theme.ogg' },
  { id: 'video-private-key', type: 'video', displayName: 'Opening.mp4' },
  { id: 'image-2-private-key', type: 'image', displayName: 'Café 2.png' },
];

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'project-private-key',
  name: 'Asset project',
  entrySceneId: 'scene-private-key',
  startScreen: {
    title: 'Asset project',
    eyebrow: '',
    backgroundAssetId: 'image-private-key',
    musicAssetId: 'audio-private-key',
    style: DEFAULT_START_SCREEN_STYLE,
  },
  cgGallery: {
    pages: [{ imageAssetIds: ['image-private-key'] }],
    style: DEFAULT_CG_GALLERY_STYLE,
  },
  scenes: [{
    schemaVersion: 1,
    id: 'scene-private-key',
    name: '场景 1',
    backgroundAssetId: 'image-private-key',
    backgroundScalePercent: 100,
    nodes: [],
  }],
};

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('AssetManager', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let pauseMedia: ReturnType<typeof vi.spyOn>;
  let loadMedia: ReturnType<typeof vi.spyOn>;
  const onImportImage = vi.fn().mockResolvedValue(undefined);
  const onImportAudio = vi.fn().mockResolvedValue(undefined);
  const onImportVideo = vi.fn().mockResolvedValue(undefined);
  const onRenameAsset = vi.fn().mockResolvedValue(true);
  const onDeleteAssets = vi.fn().mockResolvedValue(true);
  const resolveMediaUrl = vi.fn(async (assetId: string) => (
    `asset-media://preview/${assetId}`
  ));

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    pauseMedia = vi.spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    loadMedia = vi.spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    pauseMedia.mockRestore();
    loadMedia.mockRestore();
    container.remove();
  });

  async function renderManager(
    isBusy = false,
    isProjectNameEditing = false,
    projectGeneration = 0,
    imagePreviewUrl: string | null = 'asset-preview://image-one',
    renderedProject: ProjectDocument = project,
    strictMode = false,
  ): Promise<void> {
    await act(async () => {
      const content = (
        <EditorI18nProvider language="en-US">
          <AssetManager
            project={renderedProject}
            assets={assets}
            previewUrls={imagePreviewUrl === null ? {} : {
              'image-private-key': imagePreviewUrl,
            }}
            isBusy={isBusy}
            isProjectNameEditing={isProjectNameEditing}
            projectGeneration={projectGeneration}
            onImportImage={onImportImage}
            onImportAudio={onImportAudio}
            onImportVideo={onImportVideo}
            onRenameAsset={onRenameAsset}
            onDeleteAssets={onDeleteAssets}
            resolveMediaUrl={resolveMediaUrl}
          />
        </EditorI18nProvider>
      );
      root.render(strictMode ? <StrictMode>{content}</StrictMode> : content);
    });
    await act(async () => new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    }));
  }

  it('normalizes Unicode search, filters by type, and keeps project order by default', async () => {
    expect(
      filterAndSortAssets(assets, 'image', 'cafÉ', 'project').map(
        (asset) => asset.displayName,
      ),
    ).toEqual(['Ｃａｆｅ́ 10.png', 'Café 2.png']);
    expect(
      filterAndSortAssets(assets, 'image', '', 'name').map(
        (asset) => asset.displayName,
      ),
    ).toEqual(['Café 2.png', 'Ｃａｆｅ́ 10.png']);

    await renderManager();
    expect(container.textContent).toContain('All4');
    expect(container.textContent).toContain('Image2');
    expect(container.textContent).toContain('Audio1');
    expect(container.textContent).toContain('Video1');
    const lazyThumbnail = container.querySelector<HTMLImageElement>(
      '.asset-manager-card-preview img',
    );
    expect(lazyThumbnail?.getAttribute('loading')).toBe('lazy');
    expect(lazyThumbnail?.getAttribute('decoding')).toBe('async');

    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      if (!search) throw new Error('missing asset search input');
      setNativeInputValue(search, 'CAFÉ 2');
    });
    expect(container.textContent).toContain('Café 2.png');
    expect(container.textContent).not.toContain('Ｃａｆｅ́ 10.png');
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it('validates trimmed asset names by their UTF-8 byte budget', () => {
    expect(validateAssetDisplayName('  New portrait.png  ')).toEqual({
      valid: true,
      displayName: 'New portrait.png',
    });
    expect(validateAssetDisplayName('   ')).toEqual({
      valid: false,
      reason: 'required',
    });
    expect(validateAssetDisplayName('画'.repeat(85))).toEqual({
      valid: true,
      displayName: '画'.repeat(85),
    });
    expect(validateAssetDisplayName(
      '画'.repeat(Math.floor(MAX_ASSET_DISPLAY_NAME_BYTES / 3) + 1),
    )).toEqual({
      valid: false,
      reason: 'too-long',
    });
  });

  it('runs only the requested import callback and disables imports while busy', async () => {
    await renderManager();
    expect(
      container.querySelector('[role="group"][aria-label="Asset import actions"]'),
    ).not.toBeNull();
    const importAudio = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Import Audio',
    );
    await act(async () => importAudio?.click());
    expect(onImportAudio).toHaveBeenCalledOnce();
    expect(onImportImage).not.toHaveBeenCalled();
    expect(onImportVideo).not.toHaveBeenCalled();

    await renderManager(true);
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>(
        '.asset-manager-import-actions button',
      )).every((button) => button.disabled),
    ).toBe(true);
    const unusedImage = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Café 2.png'),
    );
    await act(async () => unusedImage?.click());
    expect(container.querySelector<HTMLInputElement>(
      '.asset-manager-rename-form input',
    )?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>(
      '.asset-manager-delete-button',
    )?.disabled).toBe(true);
  });

  it('announces media loading and failure states', async () => {
    let failResolution: ((reason?: unknown) => void) | undefined;
    resolveMediaUrl.mockReturnValueOnce(new Promise<string>((_resolve, reject) => {
      failResolution = reject;
    }));
    await renderManager();
    const audioButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Theme.ogg'),
    );
    await act(async () => audioButton?.click());

    const loadingStatus = container.querySelector('[role="status"]');
    expect(loadingStatus?.getAttribute('aria-live')).toBe('polite');
    expect(loadingStatus?.textContent).toBe('Loading preview…');

    await act(async () => failResolution?.(new Error('preview unavailable')));
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'This asset cannot be previewed right now.',
    );
  });

  it('ends the loading state when media URL resolution never settles', async () => {
    await renderManager();
    resolveMediaUrl.mockReturnValueOnce(new Promise<string>(() => {}));
    const audioButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Theme.ogg'),
    );

    vi.useFakeTimers();
    try {
      await act(async () => {
        audioButton?.click();
        await Promise.resolve();
      });
      expect(container.querySelector('[role="status"]')?.textContent).toBe(
        'Loading preview…',
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(container.querySelector('[role="status"]')?.textContent).toBe(
        'This asset cannot be previewed right now.',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves an active project-name draft until an import click handles it', async () => {
    await renderManager(false, true);
    const importImage = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Import Image',
    );
    if (!importImage) throw new Error('missing image import button');

    const pointerDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      importImage.dispatchEvent(pointerDown);
      importImage.click();
    });

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(onImportImage).toHaveBeenCalledOnce();
  });

  it('shows image usage without resolving media or exposing internal identifiers', async () => {
    await renderManager();
    const imageButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Ｃａｆｅ́ 10.png'),
    );
    await act(async () => imageButton?.click());

    expect(container.textContent).toContain('Title Screen · Background');
    expect(container.textContent).toContain('CG Gallery · Page 1 · Slot 1');
    expect(container.textContent).toContain('Scene 1 · Initial background');
    expect(container.textContent).not.toContain('场景 1');
    expect(container.querySelector('.asset-manager-large-preview img')).not.toBeNull();
    expect(container.querySelector('.asset-manager-preview-frame')?.getAttribute(
      'aria-busy',
    )).toBe('false');
    expect(container.querySelector('.asset-manager-preview-status')).toBeNull();
    expect(container.querySelector('.asset-manager-metadata code')?.textContent)
      .toBe(logicalAssetPath(imageWithPrivateStorageMetadata));
    expect(resolveMediaUrl).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('private-key');
    expect(container.textContent).not.toContain(
      imageWithPrivateStorageMetadata.relativePath,
    );
    const deleteButton = Array.from(container.querySelectorAll<HTMLButtonElement>(
      '.asset-manager-delete-button',
    ))[0];
    expect(deleteButton?.disabled).toBe(true);
    expect(container.textContent).toContain(
      'This asset is still in use. Remove the references listed above first.',
    );
  });

  it('opens a card context menu at the pointer and focuses the existing rename input', async () => {
    await renderManager();
    const imageButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Ｃａｆｅ́ 10.png'),
    );
    if (!imageButton) throw new Error('missing referenced image card');

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 96,
    });
    await act(async () => imageButton.dispatchEvent(contextMenuEvent));

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(imageButton.getAttribute('aria-pressed')).toBe('true');
    expect(imageButton.getAttribute('aria-haspopup')).toBe('menu');
    expect(imageButton.getAttribute('aria-expanded')).toBe('true');
    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menu?.getAttribute('aria-label')).toBe('Asset actions menu');
    expect(menu?.style.left).toBe('140px');
    expect(menu?.style.top).toBe('96px');
    const actions = Array.from(
      menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    expect(actions.map((action) => action.textContent)).toEqual([
      'Rename Asset',
      'Delete Asset',
    ]);
    expect(actions[0]).toBe(document.activeElement);
    expect(actions[1]?.disabled).toBe(true);
    expect(actions[1]?.title).toContain('still in use');

    await act(async () => actions[0]?.click());
    const renameInput = container.querySelector<HTMLInputElement>(
      '.asset-manager-rename-form input',
    );
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(imageButton.getAttribute('aria-expanded')).toBe('false');
    expect(renameInput).toBe(document.activeElement);
    expect(renameInput?.selectionStart).toBe(0);
    expect(renameInput?.selectionEnd).toBe(renameInput?.value.length);
  });

  it('supports Shift+F10 navigation and restores card focus on Escape', async () => {
    await renderManager();
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    if (!videoButton) throw new Error('missing video card');
    videoButton.focus();

    const openEvent = new KeyboardEvent('keydown', {
      key: 'F10',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => videoButton.dispatchEvent(openEvent));
    expect(openEvent.defaultPrevented).toBe(true);
    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    const actions = Array.from(
      menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    expect(actions[0]).toBe(document.activeElement);

    await act(async () => menu?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })));
    expect(actions[1]).toBe(document.activeElement);

    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(videoButton).toBe(document.activeElement);
  });

  it('routes context-menu deletion through the existing confirm and delete flow', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderManager();
    const initiallySelectedButton = Array.from(
      container.querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Café 2.png'));
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    if (!initiallySelectedButton || !videoButton) {
      throw new Error('missing context-menu test cards');
    }
    await act(async () => initiallySelectedButton.click());
    await act(async () => videoButton.dispatchEvent(new MouseEvent(
      'contextmenu',
      { bubbles: true, cancelable: true, clientX: 90, clientY: 75 },
    )));
    expect(container.querySelector(
      '.asset-manager-grid button[aria-pressed="true"]',
    )?.textContent).toContain('Opening.mp4');
    const deleteAction = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ).find((button) => button.textContent === 'Delete Asset');
    expect(deleteAction?.disabled).toBe(false);

    await act(async () => {
      deleteAction?.click();
      await Promise.resolve();
    });

    expect(confirm).toHaveBeenCalledWith(
      'Delete “Opening.mp4”? The engine will recheck the complete project. This removes the asset from the manifest but retains its underlying file as unreferenced data. The Editor cannot undo this action.',
    );
    expect(onDeleteAssets).toHaveBeenCalledWith(['video-private-key']);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Asset removed from the current project manifest. Its underlying file was retained as unreferenced data.',
    );
    confirm.mockRestore();
  });

  it('closes on outside pointer, scroll, resize, and Tab with intentional focus', async () => {
    await renderManager();
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    if (!videoButton) throw new Error('missing video card');
    const openMenu = async (): Promise<HTMLElement> => {
      await act(async () => videoButton.dispatchEvent(new MouseEvent(
        'contextmenu',
        { bubbles: true, cancelable: true, clientX: 80, clientY: 70 },
      )));
      const menu = container.querySelector<HTMLElement>('[role="menu"]');
      if (!menu) throw new Error('missing asset context menu');
      return menu;
    };

    await openMenu();
    const outsideButton = document.createElement('button');
    document.body.append(outsideButton);
    outsideButton.focus();
    await act(async () => outsideButton.dispatchEvent(new Event(
      'pointerdown',
      { bubbles: true },
    )));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(outsideButton).toBe(document.activeElement);

    await openMenu();
    await act(async () => window.dispatchEvent(new Event('scroll')));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(videoButton).not.toBe(document.activeElement);

    await openMenu();
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(videoButton).not.toBe(document.activeElement);

    const menu = await openMenu();
    await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(videoButton).toBe(document.activeElement);
    outsideButton.remove();
  });

  it('clears a context selection when a new project reuses the same asset IDs', async () => {
    await renderManager();
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    if (!videoButton) throw new Error('missing video card');
    await act(async () => videoButton.dispatchEvent(new MouseEvent(
      'contextmenu',
      { bubbles: true, cancelable: true },
    )));
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    await renderManager(false, false, 0, 'asset-preview://image-one', {
      ...project,
      id: 'different-project-private-key',
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector(
      '.asset-manager-grid button[aria-pressed="true"]',
    )).toBeNull();
    expect(container.querySelector('.asset-manager-details-empty')).not.toBeNull();
  });

  it('closes the menu but preserves selection when preview generation changes', async () => {
    await renderManager();
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    if (!videoButton) throw new Error('missing video card');
    await act(async () => videoButton.dispatchEvent(new MouseEvent(
      'contextmenu',
      { bubbles: true, cancelable: true },
    )));
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    await renderManager(false, false, 1);

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector(
      '.asset-manager-grid button[aria-pressed="true"]',
    )?.textContent).toContain('Opening.mp4');
    expect(container.querySelector('.asset-manager-details-content')).not.toBeNull();
  });

  it('renames an unused asset with a trimmed name and reports success', async () => {
    await renderManager();
    const imageButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Café 2.png'),
    );
    await act(async () => imageButton?.click());

    expect(container.querySelector('.asset-manager-unused')).toBeNull();
    expect(container.textContent).not.toContain(
      'No visible reference was found here. The engine will still check the complete project before deletion.',
    );

    const renameInput = container.querySelector<HTMLInputElement>(
      '.asset-manager-rename-form input',
    );
    if (!renameInput) throw new Error('missing rename input');
    expect(renameInput.getAttribute('aria-describedby')).toBeNull();
    expect(container.textContent).not.toContain(
      'Its code path updates with this name. Project rules check duplicates.',
    );
    await act(async () => setNativeInputValue(renameInput, '   '));
    expect(renameInput.getAttribute('aria-describedby'))
      .toBe('asset-manager-rename-error');
    expect(container.querySelector('#asset-manager-rename-error')?.getAttribute(
      'role',
    )).toBe('alert');
    expect(container.querySelector('#asset-manager-rename-error')?.textContent)
      .toBe('Asset name cannot be empty.');
    await act(async () => setNativeInputValue(renameInput, '  Hero.png  '));
    expect(renameInput.getAttribute('aria-describedby')).toBeNull();
    expect(container.querySelector('#asset-manager-rename-error')).toBeNull();
    const renameButton = container.querySelector<HTMLButtonElement>(
      '.asset-manager-rename-form button',
    );
    await act(async () => {
      renameButton?.click();
      await Promise.resolve();
    });

    expect(onRenameAsset).toHaveBeenCalledWith(
      'image-2-private-key',
      'Hero.png',
    );
    expect(container.querySelector('[role="status"]')?.textContent)
      .toBe('Asset renamed.');
    expect(renameInput.value).toBe('Hero.png');
  });

  it('keeps the selected asset and rename draft when the mutation fails', async () => {
    onRenameAsset.mockResolvedValueOnce(false);
    await renderManager();
    const imageButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Café 2.png'),
    );
    await act(async () => imageButton?.click());
    const renameInput = container.querySelector<HTMLInputElement>(
      '.asset-manager-rename-form input',
    );
    if (!renameInput) throw new Error('missing rename input');
    await act(async () => setNativeInputValue(renameInput, 'Failed name.png'));
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '.asset-manager-rename-form button',
      )?.click();
      await Promise.resolve();
    });

    expect(renameInput.value).toBe('Failed name.png');
    expect(container.querySelector(
      '.asset-manager-grid button[aria-pressed="true"]',
    )?.textContent).toContain('Café 2.png');
    expect(container.querySelector('.asset-manager-operation-message')).toBeNull();
  });

  it('deletes only an unused selected asset after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderManager();
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    await act(async () => videoButton?.click());
    const deleteButton = container.querySelector<HTMLButtonElement>(
      '.asset-manager-delete-button',
    );
    expect(deleteButton?.disabled).toBe(false);
    await act(async () => {
      deleteButton?.click();
      await Promise.resolve();
    });

    expect(confirm).toHaveBeenCalledWith(
      'Delete “Opening.mp4”? The engine will recheck the complete project. This removes the asset from the manifest but retains its underlying file as unreferenced data. The Editor cannot undo this action.',
    );
    expect(onDeleteAssets).toHaveBeenCalledWith(['video-private-key']);
    expect(container.querySelector('[role="status"]')?.textContent)
      .toBe(
        'Asset removed from the current project manifest. Its underlying file was retained as unreferenced data.',
      );
    expect(container.querySelector('.asset-manager-details-empty')).not.toBeNull();
    confirm.mockRestore();
  });

  it('keeps an unused asset selected when deletion fails', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    onDeleteAssets.mockResolvedValueOnce(false);
    await renderManager();
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    await act(async () => videoButton?.click());
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '.asset-manager-delete-button',
      )?.click();
      await Promise.resolve();
    });

    expect(container.querySelector(
      '.asset-manager-grid button[aria-pressed="true"]',
    )?.textContent).toContain('Opening.mp4');
    expect(container.querySelector('.asset-manager-details-content')).not.toBeNull();
    confirm.mockRestore();
  });

  it('resolves only selected audio/video and releases media on switch and unmount', async () => {
    await renderManager();
    const audioButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Theme.ogg'),
    );
    await act(async () => {
      audioButton?.click();
      await Promise.resolve();
    });

    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
    expect(resolveMediaUrl).toHaveBeenLastCalledWith('audio-private-key');
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(container.querySelectorAll('video')).toHaveLength(0);
    const audio = container.querySelector('audio');
    if (!audio) throw new Error('missing selected audio preview');
    expect(audio.controls).toBe(true);
    expect(container.querySelector('.asset-manager-preview-status')).toBeNull();
    pauseMedia.mockClear();
    loadMedia.mockClear();

    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    await act(async () => {
      videoButton?.click();
      await Promise.resolve();
    });

    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
    expect(resolveMediaUrl).toHaveBeenLastCalledWith('video-private-key');
    expect(container.querySelectorAll('audio')).toHaveLength(0);
    expect(container.querySelectorAll('video')).toHaveLength(1);
    const selectedVideo = container.querySelector('video');
    expect(selectedVideo?.controls).toBe(true);
    expect(selectedVideo?.playsInline).toBe(true);
    expect(pauseMedia).toHaveBeenCalled();
    expect(loadMedia).toHaveBeenCalled();
    expect(audio.hasAttribute('src')).toBe(false);

    const staleVideo = container.querySelector('video');
    if (!staleVideo) throw new Error('missing selected video preview');
    pauseMedia.mockClear();
    loadMedia.mockClear();
    await renderManager(false, false, 1);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(3);
    expect(resolveMediaUrl).toHaveBeenLastCalledWith('video-private-key');
    expect(staleVideo.hasAttribute('src')).toBe(false);
    expect(pauseMedia).toHaveBeenCalled();
    expect(loadMedia).toHaveBeenCalled();

    const refreshedVideo = container.querySelector('video');
    if (!refreshedVideo) throw new Error('missing refreshed video preview');
    pauseMedia.mockClear();
    loadMedia.mockClear();
    await act(async () => root.render(null));
    expect(pauseMedia).toHaveBeenCalled();
    expect(loadMedia).toHaveBeenCalled();
    expect(refreshedVideo.hasAttribute('src')).toBe(false);
  });

  it('keeps preview sources attached under React StrictMode', async () => {
    await renderManager(
      false,
      false,
      0,
      'asset-preview://image-one',
      project,
      true,
    );
    const imageButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Ｃａｆｅ́ 10.png'),
    );
    await act(async () => {
      imageButton?.click();
      await Promise.resolve();
    });
    expect(container.querySelector(
      '.asset-manager-large-preview img',
    )?.getAttribute('src')).toBe('asset-preview://image-one');

    const audioButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Theme.ogg'),
    );
    await act(async () => {
      audioButton?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('audio')?.getAttribute('src')).toBe(
      'asset-media://preview/audio-private-key',
    );
    expect(resolveMediaUrl).toHaveBeenCalledOnce();
  });

  it('shows a localized fallback when the selected media itself cannot load', async () => {
    await renderManager();
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    await act(async () => {
      videoButton?.click();
      await Promise.resolve();
    });

    const video = container.querySelector('video');
    if (!video) throw new Error('missing selected video preview');
    pauseMedia.mockClear();
    loadMedia.mockClear();
    await act(async () => video.dispatchEvent(new Event('error')));

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('.asset-manager-preview-status')?.textContent)
      .toBe('This asset cannot be previewed right now.');
    expect(video.hasAttribute('src')).toBe(false);
    expect(pauseMedia).toHaveBeenCalled();
    expect(loadMedia).toHaveBeenCalled();
  });

  it('shows the same loading and error fallback for an image preview', async () => {
    await renderManager();
    const imageButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Ｃａｆｅ́ 10.png'),
    );
    await act(async () => imageButton?.click());

    const image = container.querySelector<HTMLImageElement>(
      '.asset-manager-large-preview img',
    );
    if (!image) throw new Error('missing selected image preview');
    expect(container.querySelector('.asset-manager-preview-status')).toBeNull();
    await act(async () => image.dispatchEvent(new Event('error')));

    expect(container.querySelector('.asset-manager-large-preview img')).toBeNull();
    expect(container.querySelector('.asset-manager-preview-status')?.textContent)
      .toBe('This asset cannot be previewed right now.');
    expect(image.hasAttribute('src')).toBe(false);
  });

  it('releases and reloads an image preview when its project generation changes', async () => {
    await renderManager();
    const imageButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Ｃａｆｅ́ 10.png'),
    );
    await act(async () => {
      imageButton?.click();
      await Promise.resolve();
    });

    const staleImage = container.querySelector<HTMLImageElement>(
      '.asset-manager-large-preview img',
    );
    if (!staleImage) throw new Error('missing selected image preview');
    expect(staleImage.getAttribute('src')).toBe('asset-preview://image-one');

    await renderManager(false, false, 1, 'asset-preview://image-two');
    expect(staleImage.hasAttribute('src')).toBe(false);
    const refreshedImage = container.querySelector<HTMLImageElement>(
      '.asset-manager-large-preview img',
    );
    if (!refreshedImage) throw new Error('missing refreshed image preview');
    expect(refreshedImage.getAttribute('src')).toBe('asset-preview://image-two');
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it('ignores a stale media URL resolution after switching assets', async () => {
    let resolveAudio: ((url: string) => void) | undefined;
    resolveMediaUrl
      .mockReturnValueOnce(new Promise<string>((resolve) => {
        resolveAudio = resolve;
      }))
      .mockResolvedValueOnce('asset-media://preview/video-private-key');
    await renderManager();
    const audioButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Theme.ogg'),
    );
    const videoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Opening.mp4'),
    );
    await act(async () => audioButton?.click());
    await act(async () => {
      videoButton?.click();
      await Promise.resolve();
    });
    await act(async () => resolveAudio?.('asset-media://preview/audio-private-key'));

    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      'asset-media://preview/video-private-key',
    );
  });
});
