/**
 * 文件主要作用：提供独立的项目资源管理工作区。
 * 关键实现：分类搜索、稳定排序、单选详情、重命名、零引用删除以及音视频按需预览。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../../shared/projectTypes';
import { resolveEditorMediaUrl } from '../../application/editorMediaGateway';
import type { MediaUrlResolver } from '../../application/mediaPort';
import { useEditorLabels } from '../../i18n/editorLocalization';
import {
  collectAssetReferences,
  type AssetReference,
} from './assetReferences';
import { logicalAssetPath } from './logicalAssetPath';
import { localizeGeneratedSceneName } from '../start-screen/startScreenScene';

import './AssetManager.css';

export type AssetManagerCategory = 'all' | AssetDocument['type'];
export type AssetManagerSortOrder = 'project' | 'name';
export const MAX_ASSET_DISPLAY_NAME_BYTES = 256;

type AssetContextMenu = {
  assetId: string;
  projectId: string;
  projectGeneration: number;
  left: number;
  top: number;
};

const CONTEXT_MENU_VIEWPORT_MARGIN = 8;

type AssetManagerProps = {
  project: ProjectDocument;
  assets: AssetDocument[];
  previewUrls: Readonly<Record<string, string>>;
  isBusy: boolean;
  isProjectNameEditing: boolean;
  projectGeneration: number;
  onImportImage: () => Promise<void>;
  onImportAudio: () => Promise<void>;
  onImportVideo: () => Promise<void>;
  onRenameAsset: (assetId: string, displayName: string) => Promise<boolean>;
  onDeleteAssets: (assetIds: string[]) => Promise<boolean>;
  resolveMediaUrl?: MediaUrlResolver;
};

export type AssetRenameValidation =
  | { valid: true; displayName: string }
  | { valid: false; reason: 'required' | 'too-long' };

export function validateAssetDisplayName(value: string): AssetRenameValidation {
  const displayName = value.trim();
  if (displayName.length === 0) {
    return { valid: false, reason: 'required' };
  }
  if (new TextEncoder().encode(displayName).length > MAX_ASSET_DISPLAY_NAME_BYTES) {
    return { valid: false, reason: 'too-long' };
  }
  return { valid: true, displayName };
}

export function normalizeAssetSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function filterAndSortAssets(
  assets: AssetDocument[],
  category: AssetManagerCategory,
  searchQuery: string,
  sortOrder: AssetManagerSortOrder,
  locale = 'en-US',
): AssetDocument[] {
  const normalizedQuery = normalizeAssetSearchText(searchQuery.trim());
  const filteredAssets = assets.filter((asset) => (
    (category === 'all' || asset.type === category) &&
    (normalizedQuery.length === 0 ||
      normalizeAssetSearchText(asset.displayName).includes(normalizedQuery))
  ));

  if (sortOrder === 'project') {
    return filteredAssets;
  }

  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: 'base',
  });
  return filteredAssets
    .map((asset, projectIndex) => ({ asset, projectIndex }))
    .sort((left, right) => (
      collator.compare(left.asset.displayName, right.asset.displayName) ||
      left.projectIndex - right.projectIndex
    ))
    .map(({ asset }) => asset);
}

type AssetPreviewState = 'resolving' | 'ready' | 'unavailable';

const ASSET_PREVIEW_RESOLUTION_TIMEOUT_MS = 10_000;

function releaseMediaElement(element: HTMLMediaElement): void {
  element.pause();
  element.removeAttribute('src');
  element.load();
}

function AssetMediaPreview({
  asset,
  previewUrl,
  resolveMediaUrl,
  loadingLabel,
  unavailableLabel,
  previewLabel,
  projectGeneration,
}: {
  asset: AssetDocument;
  previewUrl?: string;
  resolveMediaUrl: MediaUrlResolver;
  loadingLabel: string;
  unavailableLabel: string;
  previewLabel: string;
  projectGeneration: number;
}) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<AssetPreviewState>(
    'resolving',
  );
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const setMediaElementRef = useCallback((element: HTMLMediaElement | null) => {
    mediaElementRef.current = element;
  }, []);
  const releaseCurrentPreview = useCallback((): void => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement !== null) {
      releaseMediaElement(mediaElement);
    }
    const imageElement = imageElementRef.current;
    if (imageElement !== null) {
      imageElement.removeAttribute('src');
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    let isSettled = false;
    releaseCurrentPreview();
    setMediaUrl(null);
    setPreviewState('resolving');

    const existingImageUrl = asset.type === 'image' && previewUrl
      ? previewUrl
      : null;
    const resolutionTimeout = window.setTimeout(() => {
      if (isActive && !isSettled) {
        isSettled = true;
        setMediaUrl(null);
        setPreviewState('unavailable');
      }
    }, ASSET_PREVIEW_RESOLUTION_TIMEOUT_MS);
    const urlResolution = Promise.resolve().then(() => {
      if (!isActive) {
        return null;
      }
      return existingImageUrl === null
        ? resolveMediaUrl(asset.id)
        : existingImageUrl;
    });

    void urlResolution
      .then((url) => {
        if (isActive && !isSettled) {
          isSettled = true;
          window.clearTimeout(resolutionTimeout);
          const resolvedUrl = typeof url === 'string' && url.length > 0
            ? url
            : null;
          setMediaUrl(resolvedUrl);
          setPreviewState(resolvedUrl === null ? 'unavailable' : 'ready');
        }
      })
      .catch(() => {
        if (isActive && !isSettled) {
          isSettled = true;
          window.clearTimeout(resolutionTimeout);
          setMediaUrl(null);
          setPreviewState('unavailable');
        }
      });

    return () => {
      isActive = false;
      window.clearTimeout(resolutionTimeout);
    };
  }, [
    asset.id,
    asset.type,
    previewUrl,
    projectGeneration,
    releaseCurrentPreview,
    resolveMediaUrl,
  ]);

  useLayoutEffect(() => () => {
    releaseCurrentPreview();
  }, [releaseCurrentPreview]);

  if (previewState === 'resolving') {
    return (
      <p className="asset-manager-preview-status" role="status" aria-live="polite">
        {loadingLabel}
      </p>
    );
  }
  if (previewState === 'unavailable' || mediaUrl === null) {
    return (
      <p className="asset-manager-preview-status" role="status" aria-live="polite">
        {unavailableLabel}
      </p>
    );
  }

  const markUnavailable = (): void => {
    releaseCurrentPreview();
    setMediaUrl(null);
    setPreviewState('unavailable');
  };

  return (
    <div
      className={`asset-manager-preview-frame is-${previewState}`}
      aria-busy="false"
    >
      {asset.type === 'image' ? (
        <img
          ref={imageElementRef}
          className="asset-manager-image-preview"
          src={mediaUrl}
          alt={asset.displayName}
          onError={markUnavailable}
        />
      ) : asset.type === 'video' ? (
        <video
          ref={setMediaElementRef}
          className="asset-manager-media-preview"
          src={mediaUrl}
          controls
          playsInline
          preload="metadata"
          aria-label={previewLabel}
          onError={markUnavailable}
        />
      ) : (
        <audio
          ref={setMediaElementRef}
          className="asset-manager-audio-preview"
          src={mediaUrl}
          controls
          preload="metadata"
          aria-label={previewLabel}
          onError={markUnavailable}
        />
      )}
    </div>
  );
}

function assetTypeLabel(
  asset: AssetDocument,
  labels: ReturnType<typeof useEditorLabels>,
): string {
  switch (asset.type) {
    case 'image':
      return labels.common.image;
    case 'audio':
      return labels.common.audio;
    case 'video':
      return labels.common.video;
  }
}

function sceneReferenceUsageLabel(
  usage: Extract<AssetReference, { surface: 'scene' }>['usage'],
  labels: ReturnType<typeof useEditorLabels>,
): string {
  switch (usage) {
    case 'initial-background':
      return labels.resource.referenceInitialBackground;
    case 'dialogue-voice':
      return labels.resource.referenceDialogueVoice;
    case 'timeline-background':
      return labels.resource.referenceTimelineBackground;
    case 'character':
      return labels.resource.referenceCharacter;
    case 'bgm':
      return labels.resource.referenceBgm;
    case 'video':
      return labels.resource.referenceVideo;
    case 'cg-display':
      return labels.resource.referenceCgDisplay;
  }
}

function formatReference(
  reference: AssetReference,
  labels: ReturnType<typeof useEditorLabels>,
): string {
  if (reference.surface === 'start-screen') {
    return reference.usage === 'background'
      ? labels.resource.referenceStartScreenBackground
      : labels.resource.referenceStartScreenMusic;
  }
  if (reference.surface === 'cg-gallery') {
    return `${labels.common.cgGallery} · ${labels.resource.pagePrefix}${reference.pageNumber}${labels.resource.pageSuffix} · ${labels.resource.slotPrefix}${reference.slotNumber}${labels.resource.slotSuffix}`;
  }

  const nodeLocation = reference.nodeNumber === undefined
    ? ''
    : ` · ${labels.resource.nodePrefix}${reference.nodeNumber}${labels.resource.nodeSuffix}`;
  return `${reference.sceneName}${nodeLocation} · ${sceneReferenceUsageLabel(reference.usage, labels)}`;
}

export function AssetManager({
  project,
  assets,
  previewUrls,
  isBusy,
  isProjectNameEditing,
  projectGeneration,
  onImportImage,
  onImportAudio,
  onImportVideo,
  onRenameAsset,
  onDeleteAssets,
  resolveMediaUrl = resolveEditorMediaUrl,
}: AssetManagerProps) {
  const labels = useEditorLabels();
  const [category, setCategory] = useState<AssetManagerCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<AssetManagerSortOrder>('project');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [operationMessage, setOperationMessage] = useState('');
  const [contextMenu, setContextMenu] = useState<AssetContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const projectIdentityRef = useRef({
    projectId: project.id,
    projectGeneration,
  });

  const counts = useMemo(() => ({
    all: assets.length,
    image: assets.filter((asset) => asset.type === 'image').length,
    audio: assets.filter((asset) => asset.type === 'audio').length,
    video: assets.filter((asset) => asset.type === 'video').length,
  }), [assets]);
  const visibleAssets = useMemo(() => filterAndSortAssets(
    assets,
    category,
    searchQuery,
    sortOrder,
    labels.locale,
  ), [assets, category, labels.locale, searchQuery, sortOrder]);
  const selectedAsset = visibleAssets.find(
    (asset) => asset.id === selectedAssetId,
  ) ?? null;
  const references = useMemo(
    () => selectedAsset === null
      ? []
      : collectAssetReferences(
          project,
          selectedAsset.id,
          (sceneName, sceneIndex) => localizeGeneratedSceneName(
            sceneName,
            sceneIndex,
            labels,
          ),
        ),
    [labels, project, selectedAsset],
  );
  const renameValidation = validateAssetDisplayName(renameDraft);
  const normalizedRename = renameValidation.valid
    ? renameValidation.displayName
    : '';
  const renameUnchanged = selectedAsset !== null &&
    normalizedRename === selectedAsset.displayName;
  const controlsBusy = isBusy || isMutating;
  const contextMenuMatchesProject = contextMenu !== null &&
    contextMenu.projectId === project.id &&
    contextMenu.projectGeneration === projectGeneration;

  const closeContextMenu = useCallback((restoreFocus = true): void => {
    const trigger = contextMenuTriggerRef.current;
    setContextMenu(null);
    contextMenuTriggerRef.current = null;
    if (restoreFocus && trigger?.isConnected) {
      trigger.focus();
    }
  }, []);

  const openContextMenu = useCallback((
    assetId: string,
    trigger: HTMLButtonElement,
    left: number,
    top: number,
  ): void => {
    contextMenuTriggerRef.current = trigger;
    setSelectedAssetId(assetId);
    setOperationMessage('');
    setContextMenu({
      assetId,
      projectId: project.id,
      projectGeneration,
      left,
      top,
    });
  }, [project.id, projectGeneration]);

  const preserveProjectNameDraftFocus = (
    event: React.MouseEvent<HTMLButtonElement>,
  ): void => {
    // A pointer press precedes the project-name input's blur. Keeping focus
    // here lets the import callback commit the draft itself, so a busy-state
    // rerender cannot disable and swallow the original click.
    if (isProjectNameEditing) {
      event.preventDefault();
    }
  };

  useEffect(() => {
    if (
      selectedAssetId !== null &&
      !visibleAssets.some((asset) => asset.id === selectedAssetId)
    ) {
      setSelectedAssetId(null);
    }
  }, [selectedAssetId, visibleAssets]);

  useEffect(() => {
    if (
      contextMenu !== null &&
      !visibleAssets.some((asset) => asset.id === contextMenu.assetId)
    ) {
      closeContextMenu(false);
    }
  }, [closeContextMenu, contextMenu, visibleAssets]);

  useEffect(() => {
    if (contextMenu === null) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !contextMenuRef.current?.contains(event.target)
      ) {
        closeContextMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeContextMenu();
      }
    };
    const handleViewportChange = (): void => closeContextMenu(false);

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    const previousIdentity = projectIdentityRef.current;
    if (
      previousIdentity.projectId === project.id &&
      previousIdentity.projectGeneration === projectGeneration
    ) {
      return;
    }
    projectIdentityRef.current = {
      projectId: project.id,
      projectGeneration,
    };
    closeContextMenu(false);
    if (previousIdentity.projectId !== project.id) {
      setSelectedAssetId(null);
      setOperationMessage('');
    }
  }, [closeContextMenu, project.id, projectGeneration]);

  useLayoutEffect(() => {
    if (contextMenu === null || contextMenuRef.current === null) {
      return;
    }

    const menu = contextMenuRef.current;
    const bounds = menu.getBoundingClientRect();
    const maximumLeft = Math.max(
      CONTEXT_MENU_VIEWPORT_MARGIN,
      window.innerWidth - bounds.width - CONTEXT_MENU_VIEWPORT_MARGIN,
    );
    const maximumTop = Math.max(
      CONTEXT_MENU_VIEWPORT_MARGIN,
      window.innerHeight - bounds.height - CONTEXT_MENU_VIEWPORT_MARGIN,
    );
    const left = Math.min(
      Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, contextMenu.left),
      maximumLeft,
    );
    const top = Math.min(
      Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, contextMenu.top),
      maximumTop,
    );
    if (left !== contextMenu.left || top !== contextMenu.top) {
      setContextMenu((current) => current === null
        ? null
        : { ...current, left, top });
    }
  }, [contextMenu]);

  useEffect(() => {
    if (contextMenu === null) {
      return;
    }
    const firstAction = contextMenuRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    (firstAction ?? contextMenuRef.current)?.focus();
  }, [contextMenu?.assetId]);

  useEffect(() => {
    setRenameDraft(selectedAsset?.displayName ?? '');
  }, [selectedAsset?.displayName, selectedAsset?.id]);

  const handleRenameAsset = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (
      selectedAsset === null ||
      controlsBusy ||
      !renameValidation.valid ||
      renameUnchanged
    ) {
      return;
    }

    setIsMutating(true);
    setOperationMessage('');
    try {
      const renamed = await onRenameAsset(
        selectedAsset.id,
        renameValidation.displayName,
      );
      if (renamed) {
        setRenameDraft(renameValidation.displayName);
        setOperationMessage(labels.resource.renameSucceeded);
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteAsset = async (): Promise<void> => {
    if (selectedAsset === null || controlsBusy || references.length > 0) {
      return;
    }
    const assetId = selectedAsset.id;
    const confirmed = window.confirm(
      `${labels.resource.deleteConfirmPrefix}${selectedAsset.displayName}${labels.resource.deleteConfirmSuffix}`,
    );
    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    setOperationMessage('');
    try {
      const deleted = await onDeleteAssets([assetId]);
      if (deleted) {
        setSelectedAssetId((current) => current === assetId ? null : current);
        setOperationMessage(labels.resource.deleteSucceeded);
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleContextMenuKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    if (event.key === 'Tab') {
      // Restore the trigger synchronously, then let the browser continue its
      // normal forward/backward Tab order from that mounted card.
      closeContextMenu();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const actions = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    );
    if (actions.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = actions.indexOf(document.activeElement as HTMLButtonElement);
    const targetIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + actions.length) % actions.length
          : (currentIndex - 1 + actions.length) % actions.length;
    actions[targetIndex]?.focus();
  };

  const categories: Array<{
    value: AssetManagerCategory;
    label: string;
    count: number;
  }> = [
    { value: 'all', label: labels.resource.allAssets, count: counts.all },
    { value: 'image', label: labels.common.image, count: counts.image },
    { value: 'audio', label: labels.common.audio, count: counts.audio },
    { value: 'video', label: labels.common.video, count: counts.video },
  ];

  return (
    <main className="asset-manager" aria-labelledby="asset-manager-title">
      <div className="asset-manager-heading">
        <header className="asset-manager-header">
          <div>
            <h1 id="asset-manager-title">{labels.resource.managerTitle}</h1>
            <p>{labels.resource.managerHelp}</p>
          </div>
          <div
            className="asset-manager-import-actions"
            role="group"
            aria-label={labels.resource.importActions}
          >
            <button
              type="button"
              disabled={controlsBusy}
              onMouseDown={preserveProjectNameDraftFocus}
              onClick={() => void onImportImage()}
            >
              {labels.resource.importImage}
            </button>
            <button
              type="button"
              disabled={controlsBusy}
              onMouseDown={preserveProjectNameDraftFocus}
              onClick={() => void onImportAudio()}
            >
              {labels.resource.importAudio}
            </button>
            <button
              type="button"
              disabled={controlsBusy}
              onMouseDown={preserveProjectNameDraftFocus}
              onClick={() => void onImportVideo()}
            >
              {labels.resource.importVideo}
            </button>
          </div>
        </header>

        {operationMessage.length > 0 && (
          <p
            className="asset-manager-operation-message"
            role="status"
            aria-live="polite"
          >
            {operationMessage}
          </p>
        )}
      </div>

      <div className="asset-manager-body">
        <nav
          className="asset-manager-categories"
          aria-label={labels.resource.categories}
        >
          {categories.map((item) => (
            <button
              type="button"
              key={item.value}
              className={category === item.value ? 'is-active' : undefined}
              aria-pressed={category === item.value}
              onClick={() => setCategory(item.value)}
            >
              <span>{item.label}</span>
              <span aria-label={`${item.count} ${labels.resource.itemUnit}`}>
                {item.count}
              </span>
            </button>
          ))}
        </nav>

        <section className="asset-manager-library" aria-label={labels.resource.library}>
          <div className="asset-manager-controls">
            <label className="asset-manager-search">
              <span>{labels.resource.search}</span>
              <input
                type="search"
                value={searchQuery}
                placeholder={labels.resource.searchPlaceholder}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
              />
            </label>
            <label className="asset-manager-sort">
              <span>{labels.resource.sort}</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(
                  event.currentTarget.value as AssetManagerSortOrder,
                )}
              >
                <option value="project">{labels.resource.projectOrder}</option>
                <option value="name">{labels.resource.nameOrder}</option>
              </select>
            </label>
          </div>

          {visibleAssets.length === 0 ? (
            <p className="asset-manager-empty">
              {assets.length === 0
                ? labels.resource.empty
                : labels.resource.noMatches}
            </p>
          ) : (
            <ul className="asset-manager-grid" aria-label={labels.resource.assetGrid}>
              {visibleAssets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={asset.id === selectedAssetId ? 'is-selected' : undefined}
                    aria-pressed={asset.id === selectedAssetId}
                    aria-haspopup="menu"
                    aria-expanded={
                      contextMenuMatchesProject && contextMenu.assetId === asset.id
                    }
                    onClick={() => {
                      closeContextMenu(false);
                      setSelectedAssetId(asset.id);
                      setOperationMessage('');
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openContextMenu(
                        asset.id,
                        event.currentTarget,
                        event.clientX,
                        event.clientY,
                      );
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key !== 'ContextMenu' &&
                        !(event.shiftKey && event.key === 'F10')
                      ) {
                        return;
                      }
                      event.preventDefault();
                      const bounds = event.currentTarget.getBoundingClientRect();
                      openContextMenu(
                        asset.id,
                        event.currentTarget,
                        bounds.left + Math.min(24, bounds.width / 2),
                        bounds.top + Math.min(24, bounds.height / 2),
                      );
                    }}
                  >
                    <span className="asset-manager-card-preview" aria-hidden="true">
                      {asset.type === 'image' && previewUrls[asset.id] ? (
                        <img
                          src={previewUrls[asset.id]}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : asset.type === 'image' ? (
                        <span>{labels.resource.imagePlaceholder}</span>
                      ) : asset.type === 'audio' ? (
                        <span className="asset-manager-card-icon">♫</span>
                      ) : (
                        <span className="asset-manager-card-icon">▶</span>
                      )}
                    </span>
                    <span className="asset-manager-card-name">{asset.displayName}</span>
                    <span className="asset-manager-card-type">
                      {assetTypeLabel(asset, labels)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="asset-manager-details" aria-labelledby="asset-details-title">
          <h2 id="asset-details-title">{labels.resource.details}</h2>
          {selectedAsset === null ? (
            <p className="asset-manager-details-empty">
              {labels.resource.selectForDetails}
            </p>
          ) : (
            <div className="asset-manager-details-content">
              <div className="asset-manager-large-preview">
                <AssetMediaPreview
                  key={`${project.id}:${selectedAsset.id}:${projectGeneration}`}
                  asset={selectedAsset}
                  previewUrl={previewUrls[selectedAsset.id]}
                  resolveMediaUrl={resolveMediaUrl}
                  projectGeneration={projectGeneration}
                  loadingLabel={labels.resource.loadingPreview}
                  unavailableLabel={labels.resource.previewUnavailable}
                  previewLabel={selectedAsset.type === 'audio'
                    ? labels.resource.audioPreview
                    : selectedAsset.type === 'video'
                      ? labels.resource.videoPreview
                      : selectedAsset.displayName}
                />
              </div>

              <dl className="asset-manager-metadata">
                <div>
                  <dt>{labels.resource.name}</dt>
                  <dd>{selectedAsset.displayName}</dd>
                </div>
                <div>
                  <dt>{labels.resource.type}</dt>
                  <dd>{assetTypeLabel(selectedAsset, labels)}</dd>
                </div>
                <div>
                  <dt>{labels.resource.logicalPath}</dt>
                  <dd>
                    <code>{logicalAssetPath(selectedAsset)}</code>
                  </dd>
                </div>
                <div>
                  <dt>{labels.resource.references}</dt>
                  <dd>{references.length}{labels.resource.referenceUnit}</dd>
                </div>
              </dl>

              {references.length > 0 && (
                <ol className="asset-manager-reference-list">
                  {references.map((reference, index) => (
                    <li key={index}>{formatReference(reference, labels)}</li>
                  ))}
                </ol>
              )}

              <section
                className="asset-manager-edit-actions"
                aria-label={labels.resource.editActions}
              >
                <form
                  className="asset-manager-rename-form"
                  aria-label={labels.resource.renameAsset}
                  onSubmit={(event) => void handleRenameAsset(event)}
                >
                  <label>
                    <span>{labels.resource.renameAsset}</span>
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                      disabled={controlsBusy}
                      aria-invalid={!renameValidation.valid}
                      aria-describedby={renameValidation.valid
                        ? undefined
                        : 'asset-manager-rename-error'}
                      onChange={(event) => {
                        setRenameDraft(event.currentTarget.value);
                        setOperationMessage('');
                      }}
                    />
                  </label>
                  {!renameValidation.valid && (
                    <p
                      id="asset-manager-rename-error"
                      className="asset-manager-action-error"
                      role="alert"
                    >
                      {renameValidation.reason === 'required'
                        ? labels.resource.renameRequired
                        : labels.resource.renameTooLong}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={controlsBusy || !renameValidation.valid || renameUnchanged}
                    onMouseDown={preserveProjectNameDraftFocus}
                  >
                    {controlsBusy
                      ? labels.resource.processingAsset
                      : labels.resource.renameAsset}
                  </button>
                </form>

                <div className="asset-manager-delete-action">
                  <button
                    type="button"
                    className="asset-manager-delete-button"
                    disabled={controlsBusy || references.length > 0}
                    aria-describedby="asset-manager-delete-help"
                    onMouseDown={preserveProjectNameDraftFocus}
                    onClick={() => void handleDeleteAsset()}
                  >
                    {controlsBusy
                      ? labels.resource.processingAsset
                      : labels.resource.deleteAsset}
                  </button>
                  <p id="asset-manager-delete-help" className="asset-manager-action-help">
                    {references.length > 0
                      ? labels.resource.deleteBlockedByReferences
                      : labels.resource.deleteUnusedHelp}
                  </p>
                </div>
              </section>
            </div>
          )}
        </aside>
      </div>

      {contextMenuMatchesProject &&
        selectedAsset?.id === contextMenu.assetId && (
        <div
          ref={contextMenuRef}
          className="asset-manager-context-menu"
          role="menu"
          aria-label={labels.resource.contextMenu}
          tabIndex={-1}
          style={{ left: contextMenu.left, top: contextMenu.top }}
          onKeyDown={handleContextMenuKeyDown}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={controlsBusy}
            onClick={() => {
              if (
                contextMenu.projectId !== project.id ||
                contextMenu.projectGeneration !== projectGeneration
              ) {
                closeContextMenu(false);
                return;
              }
              const input = renameInputRef.current;
              closeContextMenu(false);
              input?.focus();
              input?.select();
            }}
          >
            {labels.resource.renameAsset}
          </button>
          <button
            type="button"
            role="menuitem"
            className="asset-manager-context-delete"
            disabled={controlsBusy || references.length > 0}
            title={references.length > 0
              ? labels.resource.deleteBlockedByReferences
              : undefined}
            onClick={() => {
              if (
                contextMenu.projectId !== project.id ||
                contextMenu.projectGeneration !== projectGeneration
              ) {
                closeContextMenu(false);
                return;
              }
              closeContextMenu();
              void handleDeleteAsset();
            }}
          >
            {labels.resource.deleteAsset}
          </button>
        </div>
      )}
    </main>
  );
}
