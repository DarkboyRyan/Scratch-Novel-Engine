/**
 * 文件主要作用：管理标题界面 Blockly 工作区及资源拖放同步。
 * 包含实现：`StartScreenBlocklyWorkspaceHandle`、`StartScreenBlocklyWorkspace`。
 */

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
import {
  VN_AUDIO_ASSET_DRAG_TYPE,
  VN_IMAGE_ASSET_DRAG_TYPE,
} from '../assets/assetDragTypes';
import { getBlockClientRectangle } from '../block-editor/blockSelection';
import { installInlineZoomControlIcons } from '../block-editor/zoomControlIcons';
import {
  applyStartScreenBlocksLocalization,
  renderStartScreenBlocks,
  START_SCREEN_BLOCK_FIELDS,
  START_SCREEN_BLOCK_IDS,
  START_SCREEN_BACKGROUND_BLOCK_TYPE,
  START_SCREEN_MUSIC_BLOCK_TYPE,
} from './startScreenBlocks';
import { getStartScreenFieldUpdate } from './startScreenBlockEvents';
import {
  type EditorLabels,
  useEditorLabels,
} from '../../i18n/editorLocalization';

type StartScreenDocument = ProjectDocument['startScreen'];

type StartScreenBlocklyWorkspaceProps = {
  projectId: string;
  startScreen: StartScreenDocument;
  assets: AssetDocument[];
  isBusy: boolean;
  onUpdateStartScreen: (
    title: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ) => Promise<boolean>;
  onDraftDirtyChange: (dirty: boolean) => void;
};

export type StartScreenBlocklyWorkspaceHandle = {
  flushPendingDraft(): Promise<boolean>;
};

function renderWorkspaceProjection(
  workspace: Blockly.Workspace,
  startScreen: StartScreenDocument,
  assets: AssetDocument[],
  editable: boolean,
  pendingTitle: string | null,
  labels: EditorLabels,
): void {
  renderStartScreenBlocks(workspace, startScreen, assets, editable, labels);
  if (pendingTitle === null || pendingTitle === startScreen.title) {
    return;
  }

  const root = workspace.getBlockById(START_SCREEN_BLOCK_IDS.root);
  Blockly.Events.disable();
  try {
    root?.setFieldValue(pendingTitle, START_SCREEN_BLOCK_FIELDS.title);
  } finally {
    Blockly.Events.enable();
  }
}

function blockAtClientPoint(
  workspace: Blockly.WorkspaceSvg,
  blockType: string,
  clientX: number,
  clientY: number,
): Blockly.BlockSvg | null {
  const block = workspace
    .getBlocksByType(blockType, false)
    .find(
      (candidate): candidate is Blockly.BlockSvg =>
        candidate instanceof Blockly.BlockSvg,
    );
  if (!block) {
    return null;
  }

  const rectangle = getBlockClientRectangle(block, workspace);
  return clientX >= rectangle.left &&
    clientX <= rectangle.right &&
    clientY >= rectangle.top &&
    clientY <= rectangle.bottom
    ? block
    : null;
}

export const StartScreenBlocklyWorkspace = forwardRef<
  StartScreenBlocklyWorkspaceHandle,
  StartScreenBlocklyWorkspaceProps
>(function StartScreenBlocklyWorkspace(
  {
    projectId,
    startScreen,
    assets,
    isBusy,
    onUpdateStartScreen,
    onDraftDirtyChange,
  },
  ref,
) {
  const labels = useEditorLabels();
  const initialLabelsRef = useRef(labels);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const projectIdRef = useRef(projectId);
  const pendingTitleRef = useRef<string | null>(null);
  const startScreenRef = useRef(startScreen);
  const assetsRef = useRef(assets);
  const isBusyRef = useRef(isBusy);
  const updateStartScreenRef = useRef(onUpdateStartScreen);
  const draftDirtyChangeRef = useRef(onDraftDirtyChange);
  const activeMutationRef = useRef<Promise<boolean> | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const runMutationRef = useRef<(
    title: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ) => Promise<boolean>>(() => Promise.resolve(false));

  startScreenRef.current = startScreen;
  assetsRef.current = assets;
  isBusyRef.current = isBusy;
  updateStartScreenRef.current = onUpdateStartScreen;
  draftDirtyChangeRef.current = onDraftDirtyChange;
  if (projectIdRef.current !== projectId) {
    projectIdRef.current = projectId;
    pendingTitleRef.current = null;
  }

  useImperativeHandle(ref, () => ({
    flushPendingDraft: async () => {
      if (activeMutationRef.current) {
        return activeMutationRef.current;
      }
      const workspace = workspaceRef.current;
      const root = workspace?.getBlockById(START_SCREEN_BLOCK_IDS.root);
      if (!workspace || !root) {
        return true;
      }
      const title = String(
        root.getFieldValue(START_SCREEN_BLOCK_FIELDS.title) ?? '',
      );
      if (title === startScreenRef.current.title) {
        return true;
      }
      Blockly.Events.disable();
      try {
        Blockly.WidgetDiv.hideIfOwnerIsInWorkspace(workspace);
      } finally {
        Blockly.Events.enable();
      }
      pendingTitleRef.current = title;
      return runMutationRef.current(
        title,
        startScreenRef.current.backgroundAssetId,
        startScreenRef.current.musicAssetId,
      );
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const workspace = Blockly.inject(container, {
      readOnly: false,
      move: {
        scrollbars: true,
        drag: false,
        wheel: false,
      },
      renderer: 'zelos',
      sounds: false,
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1,
        minScale: 0.65,
        maxScale: 1.4,
        scaleSpeed: 1.1,
      },
    });
    workspaceRef.current = workspace;
    installInlineZoomControlIcons(workspace.getParentSvg());
    renderWorkspaceProjection(
      workspace,
      startScreenRef.current,
      assetsRef.current,
      !isBusyRef.current,
      pendingTitleRef.current,
      initialLabelsRef.current,
    );

    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(workspace);
    });
    resizeObserver.observe(container);

    let isActive = true;

    const runMutation = (
      title: string,
      backgroundAssetId: string | null,
      musicAssetId: string | null,
    ): Promise<boolean> => {
      const current = startScreenRef.current;
      if (
        isBusyRef.current ||
        activeMutationRef.current ||
        (title === current.title &&
          backgroundAssetId === current.backgroundAssetId &&
          musicAssetId === current.musicAssetId)
      ) {
        return activeMutationRef.current ?? Promise.resolve(true);
      }

      const mutation = (async () => {
        let updated = false;
        pendingTitleRef.current =
          title === current.title ? null : title;
        setIsMutating(true);
        try {
          updated = await updateStartScreenRef.current(
            title,
            backgroundAssetId,
            musicAssetId,
          );
          return updated;
        } catch (error: unknown) {
          console.error('同步主界面内容失败', error);
          return false;
        } finally {
          if (isActive) {
            setIsMutating(false);
          }
          if (updated) {
            pendingTitleRef.current = null;
          }
          if (isActive && !updated) {
            renderWorkspaceProjection(
              workspace,
              startScreenRef.current,
              assetsRef.current,
              !isBusyRef.current,
              pendingTitleRef.current,
              labelsRef.current,
            );
          }
          if (isActive) {
            draftDirtyChangeRef.current(
              pendingTitleRef.current !== null,
            );
          }
        }
      })();
      activeMutationRef.current = mutation;
      void mutation.finally(() => {
        if (activeMutationRef.current === mutation) {
          activeMutationRef.current = null;
        }
      });
      return mutation;
    };
    runMutationRef.current = runMutation;

    const dropKind = (
      event: DragEvent,
    ): 'background' | 'music' | null => {
      if (
        event.dataTransfer?.types.includes(VN_IMAGE_ASSET_DRAG_TYPE) &&
        blockAtClientPoint(
          workspace,
          START_SCREEN_BACKGROUND_BLOCK_TYPE,
          event.clientX,
          event.clientY,
        )
      ) {
        return 'background';
      }

      if (
        event.dataTransfer?.types.includes(VN_AUDIO_ASSET_DRAG_TYPE) &&
        blockAtClientPoint(
          workspace,
          START_SCREEN_MUSIC_BLOCK_TYPE,
          event.clientX,
          event.clientY,
        )
      ) {
        return 'music';
      }

      return null;
    };

    const dropTarget = (
      event: DragEvent,
    ):
      | { kind: 'background'; assetId: string }
      | { kind: 'music'; assetId: string }
      | null => {
      const kind = dropKind(event);
      if (!kind) {
        return null;
      }
      const dataType =
        kind === 'background'
          ? VN_IMAGE_ASSET_DRAG_TYPE
          : VN_AUDIO_ASSET_DRAG_TYPE;
      const assetType = kind === 'background' ? 'image' : 'audio';
      const assetId = event.dataTransfer?.getData(dataType) ?? '';
      if (
        !assetId ||
        !assetsRef.current.some(
          (asset) => asset.id === assetId && asset.type === assetType,
        )
      ) {
        return null;
      }
      return kind === 'background'
        ? { kind: 'background', assetId }
        : { kind: 'music', assetId };
    };

    const handleAssetDragOver = (event: DragEvent) => {
      if (
        isBusyRef.current ||
        activeMutationRef.current ||
        !dropKind(event)
      ) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleAssetDrop = (event: DragEvent) => {
      if (isBusyRef.current || activeMutationRef.current) {
        return;
      }

      const target = dropTarget(event);
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const current = startScreenRef.current;
      const root = workspace.getBlockById(START_SCREEN_BLOCK_IDS.root);
      const title = String(
        root?.getFieldValue(START_SCREEN_BLOCK_FIELDS.title) ??
          current.title,
      );
      const backgroundAssetId =
        target.kind === 'background'
          ? target.assetId
          : current.backgroundAssetId;
      const musicAssetId =
        target.kind === 'music' ? target.assetId : current.musicAssetId;
      if (
        backgroundAssetId === current.backgroundAssetId &&
        musicAssetId === current.musicAssetId
      ) {
        return;
      }

      void runMutation(
        title,
        backgroundAssetId,
        musicAssetId,
      );
    };

    const handleWorkspaceChange = (event: Blockly.Events.Abstract) => {
      if (
        event.type ===
        Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE
      ) {
        const root = workspace.getBlockById(
          START_SCREEN_BLOCK_IDS.root,
        );
        const title = String(
          root?.getFieldValue(START_SCREEN_BLOCK_FIELDS.title) ?? '',
        );
        pendingTitleRef.current =
          title === startScreenRef.current.title ? null : title;
        draftDirtyChangeRef.current(pendingTitleRef.current !== null);
        return;
      }
      const update = getStartScreenFieldUpdate(event, workspace);
      if (update === null) {
        return;
      }
      if (isBusyRef.current || activeMutationRef.current) {
        renderWorkspaceProjection(
          workspace,
          startScreenRef.current,
          assetsRef.current,
          false,
          pendingTitleRef.current,
          labelsRef.current,
        );
        return;
      }
      void runMutation(
        update.title,
        update.backgroundAssetId,
        update.musicAssetId,
      );
    };

    container.addEventListener('dragover', handleAssetDragOver);
    container.addEventListener('drop', handleAssetDrop);
    workspace.addChangeListener(handleWorkspaceChange);
    Blockly.svgResize(workspace);

    return () => {
      isActive = false;
      draftDirtyChangeRef.current(false);
      runMutationRef.current = () => Promise.resolve(false);
      resizeObserver.disconnect();
      container.removeEventListener('dragover', handleAssetDragOver);
      container.removeEventListener('drop', handleAssetDrop);
      workspace.removeChangeListener(handleWorkspaceChange);
      workspaceRef.current = null;
      workspace.dispose();
    };
  }, []);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    renderWorkspaceProjection(
      workspace,
      startScreen,
      assets,
      !isBusy && !isMutating,
      pendingTitleRef.current,
      labelsRef.current,
    );
  }, [assets, isBusy, isMutating, projectId, startScreen]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    applyStartScreenBlocksLocalization(
      workspace,
      startScreenRef.current,
      assetsRef.current,
      labels,
    );
  }, [labels]);

  return (
    <div
      ref={containerRef}
      className="blockly-workspace start-screen-blockly-workspace"
      data-testid="start-screen-blockly-workspace"
    />
  );
});
