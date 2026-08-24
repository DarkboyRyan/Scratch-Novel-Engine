import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as Blockly from 'blockly';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../../shared/projectTypes';
import { installInlineZoomControlIcons } from '../block-editor/zoomControlIcons';
import {
  getCgGalleryFieldUpdate,
  getDeletedCgGalleryPageUpdate,
  getNewCgGalleryPageDrop,
} from './cgGalleryBlockEvents';
import {
  cgGalleryPageBlockId,
  createCgGalleryToolbox,
  registerCgGalleryBlocks,
  renderCgGalleryBlocks,
} from './cgGalleryBlocks';
import { sameCgGalleryPages } from './cgGalleryProjection';

type CgGalleryDocument = ProjectDocument['cgGallery'];

type CgGalleryBlocklyWorkspaceProps = {
  gallery: CgGalleryDocument;
  assets: AssetDocument[];
  isBusy: boolean;
  onUpdateCgGallery: (
    pages: CgGalleryDocument['pages'],
  ) => Promise<boolean>;
  onDraftDirtyChange: (dirty: boolean) => void;
};

export type CgGalleryEditorHandle = {
  flushPendingDraft(): Promise<boolean>;
  focusPage(pageIndex: number): void;
};

export const CgGalleryBlocklyWorkspace = forwardRef<
  CgGalleryEditorHandle,
  CgGalleryBlocklyWorkspaceProps
>(function CgGalleryBlocklyWorkspace(
  {
    gallery,
    assets,
    isBusy,
    onUpdateCgGallery,
    onDraftDirtyChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const galleryRef = useRef(gallery);
  const assetsRef = useRef(assets);
  const isBusyRef = useRef(isBusy);
  const updateRef = useRef(onUpdateCgGallery);
  const draftDirtyRef = useRef(onDraftDirtyChange);
  const activeMutationRef = useRef<Promise<boolean> | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  galleryRef.current = gallery;
  assetsRef.current = assets;
  isBusyRef.current = isBusy;
  updateRef.current = onUpdateCgGallery;
  draftDirtyRef.current = onDraftDirtyChange;

  useImperativeHandle(ref, () => ({
    flushPendingDraft: () =>
      activeMutationRef.current ?? Promise.resolve(true),
    focusPage: (pageIndex) => {
      workspaceRef.current?.centerOnBlock(
        cgGalleryPageBlockId(pageIndex),
        true,
      );
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    registerCgGalleryBlocks();
    const workspace = Blockly.inject(container, {
      toolbox: createCgGalleryToolbox(),
      readOnly: false,
      move: { scrollbars: true, drag: false, wheel: false },
      renderer: 'zelos',
      sounds: false,
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        minScale: 0.55,
        maxScale: 1.25,
        scaleSpeed: 1.1,
      },
    });
    workspaceRef.current = workspace;
    installInlineZoomControlIcons(workspace.getParentSvg());
    renderCgGalleryBlocks(
      workspace,
      galleryRef.current,
      assetsRef.current,
      !isBusyRef.current,
    );

    const resizeObserver = new ResizeObserver(() => Blockly.svgResize(workspace));
    resizeObserver.observe(container);
    let active = true;

    const handleChange = (event: Blockly.Events.Abstract) => {
      const currentPages = galleryRef.current.pages;
      const nextPages =
        getNewCgGalleryPageDrop(event, workspace, currentPages) ??
        getDeletedCgGalleryPageUpdate(event, currentPages) ??
        getCgGalleryFieldUpdate(event, currentPages);
      if (nextPages === null) {
        return;
      }
      if (
        isBusyRef.current ||
        activeMutationRef.current !== null ||
        sameCgGalleryPages(nextPages, currentPages)
      ) {
        renderCgGalleryBlocks(
          workspace,
          galleryRef.current,
          assetsRef.current,
          !isBusyRef.current && activeMutationRef.current === null,
        );
        return;
      }

      setIsMutating(true);
      draftDirtyRef.current(true);
      const mutation = updateRef
        .current(nextPages)
        .catch((error: unknown) => {
          console.error('同步 CG 画廊失败', error);
          return false;
        })
        .then((updated) => {
          if (!updated && active) {
            renderCgGalleryBlocks(
              workspace,
              galleryRef.current,
              assetsRef.current,
              !isBusyRef.current,
            );
          }
          return updated;
        })
        .finally(() => {
          if (active) {
            setIsMutating(false);
            draftDirtyRef.current(false);
          }
          if (activeMutationRef.current === mutation) {
            activeMutationRef.current = null;
          }
        });
      activeMutationRef.current = mutation;
    };

    workspace.addChangeListener(handleChange);
    Blockly.svgResize(workspace);
    return () => {
      active = false;
      draftDirtyRef.current(false);
      resizeObserver.disconnect();
      workspace.removeChangeListener(handleChange);
      workspaceRef.current = null;
      workspace.dispose();
    };
  }, []);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    workspace.setIsReadOnly(isBusy || isMutating);
    renderCgGalleryBlocks(
      workspace,
      gallery,
      assets,
      !isBusy && !isMutating,
    );
  }, [assets, gallery, isBusy, isMutating]);

  return (
    <div
      ref={containerRef}
      className="blockly-workspace cg-gallery-blockly-workspace"
      data-testid="cg-gallery-blockly-workspace"
    />
  );
});
