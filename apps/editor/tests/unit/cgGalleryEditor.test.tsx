/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 CG gallery Editor 的行为。
 * 测试覆盖：`CG gallery Editor`。
 */

import * as Blockly from 'blockly';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { ResourcePanel } from '../../src/renderer/features/assets/ResourcePanel';
import {
  getCgGalleryFieldUpdate,
  getDeletedCgGalleryPageUpdate,
  getNewCgGalleryPageDrop,
} from '../../src/renderer/features/cg-gallery/cgGalleryBlockEvents';
import {
  CG_GALLERY_PAGE_BLOCK_TYPE,
  cgGalleryImageFieldName,
  cgGalleryPageBlockId,
  createCgGalleryToolbox,
  renderCgGalleryBlocks,
} from '../../src/renderer/features/cg-gallery/cgGalleryBlocks';
import type { CgGalleryEditorHandle } from '../../src/renderer/features/cg-gallery/CgGalleryBlocklyWorkspace';
import { CgGalleryFormEditor } from '../../src/renderer/features/cg-gallery/CgGalleryFormEditor';
import {
  CG_GALLERY_PAGE_SIZE,
  appendCgGalleryPage,
  createEmptyCgGalleryPage,
  deleteCgGalleryPage,
  projectCgGalleryPages,
  updateCgGallerySlot,
} from '../../src/renderer/features/cg-gallery/cgGalleryProjection';
import {
  CG_GALLERY_SCENE_ID,
  createEditorSceneOptions,
  editorSurfaceReducer,
} from '../../src/renderer/features/start-screen/startScreenScene';
import type {
  AssetDocument,
  ProjectDocument,
} from '../../src/shared/projectTypes';

function fixedSlots(
  ...assetIds: Array<string | null>
): Array<string | null> {
  return Array.from(
    { length: CG_GALLERY_PAGE_SIZE },
    (_, index) => assetIds[index] ?? null,
  );
}

const assets: AssetDocument[] = Array.from({ length: 12 }, (_, index) => ({
  id: `cg-${index + 1}`,
  type: 'image' as const,
  displayName: `CG ${index + 1}.png`,
}));

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'cg-project',
  name: 'CG Project',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'CG Project',
    eyebrow: 'A VN ENGINE STORY',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: {
    pages: [
      {
        imageAssetIds: fixedSlots(
          ...assets.slice(0, 9).map((asset) => asset.id),
        ),
      },
      { imageAssetIds: fixedSlots('cg-10') },
    ],
  },
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-1',
      name: '场景 1',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [],
    },
  ],
};

describe('CG gallery Editor', () => {
  it('projects only persisted fixed pages and edits exact slots', () => {
    expect(projectCgGalleryPages(project.cgGallery.pages)).toEqual([
      {
        pageNumber: 1,
        slots: project.cgGallery.pages[0].imageAssetIds,
      },
      {
        pageNumber: 2,
        slots: project.cgGallery.pages[1].imageAssetIds,
      },
    ]);

    const oneFullPage = [{ imageAssetIds: fixedSlots(...Array(9).fill('a')) }];
    expect(projectCgGalleryPages(oneFullPage)).toHaveLength(1);
    expect(createEmptyCgGalleryPage()).toEqual({
      imageAssetIds: fixedSlots(),
    });

    const source = [
      { imageAssetIds: fixedSlots('a', 'b') },
      { imageAssetIds: fixedSlots('c') },
    ];
    expect(updateCgGallerySlot(source, 0, 2, 'c')).toEqual([
      { imageAssetIds: fixedSlots('a', 'b', 'c') },
      { imageAssetIds: fixedSlots() },
    ]);
    expect(appendCgGalleryPage(source)).toEqual([
      ...source,
      createEmptyCgGalleryPage(),
    ]);
    expect(deleteCgGalleryPage(source, 0)).toEqual([source[1]]);
    expect(deleteCgGalleryPage([source[0]], 0)).toEqual([source[0]]);
  });

  it('offers CG as a synthetic surface before story scenes', () => {
    expect(createEditorSceneOptions(project)[1]).toEqual({
      id: CG_GALLERY_SCENE_ID,
      label: 'CG 画廊',
      kind: 'cg-gallery',
    });
    expect(
      editorSurfaceReducer('story', { type: 'select-cg-gallery' }),
    ).toBe('cg-gallery');
  });

  it('renders one block per persisted page with nine editable dropdowns', () => {
    const workspace = new Blockly.Workspace();
    renderCgGalleryBlocks(workspace, project.cgGallery, assets);
    const firstPage = workspace.getBlockById(cgGalleryPageBlockId(0));
    const secondPage = workspace.getBlockById(cgGalleryPageBlockId(1));

    expect(workspace.getAllBlocks(false)).toHaveLength(2);
    expect(firstPage).not.toBeNull();
    expect(secondPage).not.toBeNull();
    expect(firstPage?.isMovable()).toBe(false);
    expect(firstPage?.isDeletable()).toBe(true);
    expect(
      firstPage?.getField(cgGalleryImageFieldName(0)),
    ).toBeInstanceOf(Blockly.FieldDropdown);

    const emptyField = secondPage?.getField(
      cgGalleryImageFieldName(1),
    ) as Blockly.FieldDropdown;
    expect(emptyField).toBeInstanceOf(Blockly.FieldDropdown);
    expect(emptyField.getValue()).toBe('');
    expect(emptyField.getText()).toBe('无');
    expect(emptyField.isEnabled()).toBe(true);
    expect(
      Array.from(
        { length: CG_GALLERY_PAGE_SIZE },
        (_, index) => secondPage?.getField(cgGalleryImageFieldName(index)),
      ).every((field) => field instanceof Blockly.FieldDropdown),
    ).toBe(true);

    expect(createCgGalleryToolbox()).toMatchObject({
      contents: [
        {
          contents: [
            { kind: 'block', type: CG_GALLERY_PAGE_BLOCK_TYPE },
          ],
        },
      ],
    });
    workspace.dispose();
  });

  it('translates slot edits, toolbox drops, and page deletes to page documents', () => {
    const workspace = new Blockly.Workspace();
    renderCgGalleryBlocks(workspace, project.cgGallery, assets);

    expect(
      getCgGalleryFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: cgGalleryPageBlockId(1),
          element: 'field',
          name: cgGalleryImageFieldName(1),
          newValue: 'cg-11',
        } as Blockly.Events.BlockChange,
        project.cgGallery.pages,
      ),
    ).toEqual([
      project.cgGallery.pages[0],
      { imageAssetIds: fixedSlots('cg-10', 'cg-11') },
    ]);

    workspace.newBlock(CG_GALLERY_PAGE_BLOCK_TYPE, 'toolbox-page');
    expect(
      getNewCgGalleryPageDrop(
        {
          type: Blockly.Events.BLOCK_MOVE,
          blockId: 'toolbox-page',
          reason: ['drag'],
        } as Blockly.Events.BlockMove,
        workspace as Blockly.WorkspaceSvg,
        project.cgGallery.pages,
      ),
    ).toEqual([
      ...project.cgGallery.pages,
      createEmptyCgGalleryPage(),
    ]);

    expect(
      getDeletedCgGalleryPageUpdate(
        {
          type: Blockly.Events.BLOCK_DELETE,
          blockId: cgGalleryPageBlockId(0),
        } as Blockly.Events.BlockDelete,
        project.cgGallery.pages,
      ),
    ).toEqual([project.cgGallery.pages[1]]);
    expect(
      getDeletedCgGalleryPageUpdate(
        {
          type: Blockly.Events.BLOCK_DELETE,
          blockId: cgGalleryPageBlockId(0),
        } as Blockly.Events.BlockDelete,
        [project.cgGallery.pages[0]],
      ),
    ).toBeNull();
    workspace.dispose();
  });

  it('previews fixed slots, switches pages, and updates a selected slot', async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const root = createRoot(container);
    const editorRef = createRef<CgGalleryEditorHandle>();
    const update = vi.fn().mockResolvedValue(true);
    const previewUrls = Object.fromEntries(
      assets.map((asset) => [asset.id, `vn-preview://${asset.id}`]),
    );

    await act(async () => {
      root.render(
        <CgGalleryFormEditor
          ref={editorRef}
          project={project}
          assets={assets}
          previewUrls={previewUrls}
          isBusy={false}
          isStartPreviewDisabled={false}
          onSceneChange={async () => {}}
          onUpdateCgGallery={update}
          onDraftDirtyChange={() => {}}
          onStartPreview={() => {}}
        />,
      );
    });

    expect(container.querySelectorAll('.cg-gallery-thumbnail')).toHaveLength(9);
    expect(container.querySelectorAll('.cg-gallery-slot-empty')).toHaveLength(0);
    await act(async () => {
      (
        container.querySelector(
          '.cg-gallery-thumbnail',
        ) as HTMLButtonElement
      ).click();
    });
    expect(container.querySelector('[aria-label="查看 CG 大图"]')).not.toBeNull();
    await act(async () => {
      (
        container.querySelector(
          '[aria-label="关闭大图"]',
        ) as HTMLButtonElement
      ).click();
      (
        container.querySelector(
          '.cg-gallery-pagination button:last-child',
        ) as HTMLButtonElement
      ).click();
    });
    expect(container.querySelectorAll('.cg-gallery-thumbnail')).toHaveLength(1);
    expect(container.querySelectorAll('.cg-gallery-slot-empty')).toHaveLength(8);

    const secondSlot = container.querySelector(
      '[aria-label="图片 2"]',
    ) as HTMLSelectElement;
    await act(async () => {
      secondSlot.value = 'cg-11';
      secondSlot.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledWith([
      project.cgGallery.pages[0],
      { imageAssetIds: fixedSlots('cg-10', 'cg-11') },
    ]);

    await act(async () => {
      root.unmount();
    });
  });

  it('adds and deletes explicit pages from the form editor', async () => {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const root = createRoot(container);
    const update = vi.fn().mockResolvedValue(true);

    await act(async () => {
      root.render(
        <CgGalleryFormEditor
          project={project}
          assets={assets}
          previewUrls={{}}
          isBusy={false}
          isStartPreviewDisabled={false}
          onSceneChange={async () => {}}
          onUpdateCgGallery={update}
          onDraftDirtyChange={() => {}}
          onStartPreview={() => {}}
        />,
      );
    });

    await act(async () => {
      (container.querySelector('.cg-gallery-page-actions button') as HTMLButtonElement).click();
    });
    expect(update).toHaveBeenLastCalledWith([
      ...project.cgGallery.pages,
      createEmptyCgGalleryPage(),
    ]);

    const projectWithNewPage: ProjectDocument = {
      ...project,
      cgGallery: {
        pages: [
          ...project.cgGallery.pages,
          createEmptyCgGalleryPage(),
        ],
      },
    };
    update.mockClear();
    await act(async () => {
      root.render(
        <CgGalleryFormEditor
          project={projectWithNewPage}
          assets={assets}
          previewUrls={{}}
          isBusy={false}
          isStartPreviewDisabled={false}
          onSceneChange={async () => {}}
          onUpdateCgGallery={update}
          onDraftDirtyChange={() => {}}
          onStartPreview={() => {}}
        />,
      );
    });
    await act(async () => {
      (
        container.querySelector(
          '.cg-gallery-page-actions button:last-child',
        ) as HTMLButtonElement
      ).click();
    });
    expect(update).toHaveBeenLastCalledWith(project.cgGallery.pages);

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps image resources read-only on the CG surface', async () => {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const root = createRoot(container);
    const selectBackground = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <ResourcePanel
          assets={assets}
          backgroundAssetId={null}
          backgroundScalePercent={100}
          backgroundScaleDraft="100"
          backgroundScaleDraftInvalid={false}
          supportsBackgroundScale={false}
          previewUrls={{}}
          isBusy={false}
          imageSelectionPurpose="cg-gallery"
          onImportImage={async () => {}}
          onImportAudio={async () => {}}
          onImportVideo={async () => {}}
          onBackgroundScaleDraftChange={() => {}}
          onCommitBackgroundScaleDraft={async () => true}
          onSelectBackground={selectBackground}
        />,
      );
    });

    expect(container.textContent).not.toContain('点击图片加入 CG');
    expect(
      container.querySelector('[aria-label="背景缩放百分比"]'),
    ).toBeNull();
    const imageButton = container.querySelector(
      '[aria-label="图片资源"] button',
    ) as HTMLButtonElement;
    expect(imageButton.disabled).toBe(true);
    expect(imageButton.draggable).toBe(false);
    await act(async () => {
      imageButton.click();
    });
    expect(selectBackground).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
