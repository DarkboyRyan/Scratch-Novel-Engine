/**
 * 文件主要作用：管理标题、CG 画廊和故事三类编辑界面导航状态。
 * 包含实现：`START_SCREEN_SCENE_ID`、`CG_GALLERY_SCENE_ID`、`EditorSurface`、`EditorSurfaceAction`、`initialEditorSurface`、`editorSurfaceReducer` 等 10 项。
 */

import type { ProjectDocument } from '../../../shared/projectTypes';
import { START_SCREEN_EYEBROW_MAX_UTF8_BYTES } from '../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../i18n/editorLocalization';

// The main menu and CG gallery are Editor-owned synthetic scenes. They do not
// use UUIDs or enter project.scenes, so story commands can never mutate them as
// ordinary narrative scenes.
export const START_SCREEN_SCENE_ID = 'vn-editor:start-screen';
export const CG_GALLERY_SCENE_ID = 'vn-editor:cg-gallery';

export function trimStartScreenAsciiWhitespace(value: string): string {
  const isAsciiWhitespace = (codeUnit: number): boolean =>
    codeUnit === 0x20 || (codeUnit >= 0x09 && codeUnit <= 0x0d);
  let start = 0;
  let end = value.length;
  while (start < end && isAsciiWhitespace(value.charCodeAt(start))) {
    start += 1;
  }
  while (end > start && isAsciiWhitespace(value.charCodeAt(end - 1))) {
    end -= 1;
  }
  return value.slice(start, end);
}

/**
 * Keeps only scalar Unicode values that fit the Author eyebrow byte limit.
 * Invalid UTF-16 code units are discarded instead of being silently encoded
 * as U+FFFD by TextEncoder, and the final scalar is never split.
 */
export function constrainStartScreenEyebrowInput(value: string): string {
  let sanitizedByteLength = 0;
  let sanitized = '';

  for (let index = 0; index < value.length;) {
    const first = value.charCodeAt(index);
    if (first === 0) {
      index += 1;
      continue;
    }

    let scalar = value[index] ?? '';
    let scalarBytes = first <= 0x7f ? 1 : first <= 0x7ff ? 2 : 3;
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) {
        index += 1;
        continue;
      }
      scalar = value.slice(index, index + 2);
      scalarBytes = 4;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      index += 1;
      continue;
    }

    sanitized += scalar;
    sanitizedByteLength += scalarBytes;
    index += scalar.length;
  }

  const trimmed = trimStartScreenAsciiWhitespace(sanitized);
  let constrainedByteLength = 0;
  let constrained = '';
  for (const scalar of trimmed) {
    const codePoint = scalar.codePointAt(0) ?? 0;
    const scalarBytes = codePoint <= 0x7f
      ? 1
      : codePoint <= 0x7ff
        ? 2
        : codePoint <= 0xffff
          ? 3
          : 4;
    if (
      constrainedByteLength + scalarBytes >
      START_SCREEN_EYEBROW_MAX_UTF8_BYTES
    ) {
      break;
    }
    constrained += scalar;
    constrainedByteLength += scalarBytes;
  }

  // Preserve ordinary boundary spaces while the user is still typing. Once
  // they would consume the byte budget, drop them before truncating the scalar
  // content so a leading space cannot steal one byte from the authored value.
  return sanitizedByteLength <= START_SCREEN_EYEBROW_MAX_UTF8_BYTES &&
    constrained === trimmed
    ? sanitized
    : constrained;
}

export function normalizeStartScreenEyebrowInput(value: string): string {
  return trimStartScreenAsciiWhitespace(
    constrainStartScreenEyebrowInput(value),
  );
}

export type EditorSurface = 'start-screen' | 'cg-gallery' | 'story';
export type EditorSurfaceAction =
  | { type: 'project-loaded' }
  | { type: 'select-start-screen' }
  | { type: 'select-cg-gallery' }
  | { type: 'select-story' };

export function initialEditorSurface(): EditorSurface {
  return 'start-screen';
}

export function editorSurfaceReducer(
  _current: EditorSurface,
  action: EditorSurfaceAction,
): EditorSurface {
  if (action.type === 'select-story') {
    return 'story';
  }
  return action.type === 'select-cg-gallery'
    ? 'cg-gallery'
    : 'start-screen';
}

export type EditorSceneOption = {
  id: string;
  label: string;
  kind: 'start-screen' | 'cg-gallery' | 'story';
};

export function createEditorSceneOptions(
  project: Pick<ProjectDocument, 'scenes'>,
  labels: EditorLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE),
): EditorSceneOption[] {
  return [
    {
      id: START_SCREEN_SCENE_ID,
      label: labels.common.mainMenu,
      kind: 'start-screen',
    },
    {
      id: CG_GALLERY_SCENE_ID,
      label: labels.common.cgGallery,
      kind: 'cg-gallery',
    },
    ...project.scenes.map((scene, index) => ({
      id: scene.id,
      label:
        scene.name === `场景 ${index + 1}`
          ? `${labels.common.scene} ${index + 1}`
          : `${labels.common.scene} ${index + 1} · ${scene.name}`,
      kind: 'story' as const,
    })),
  ];
}

type StartScreenProjectSnapshot = Pick<ProjectDocument, 'startScreen'>;

export type StartScreenPatch = Partial<
  ProjectDocument['startScreen']
>;

export async function updateStartScreenFromLatest(
  patch: StartScreenPatch,
  prepareCurrentEdits: () => Promise<boolean>,
  getLatestProject: () => Promise<StartScreenProjectSnapshot | null>,
  updateStartScreen: (
    title: string,
    eyebrow: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ) => Promise<boolean>,
): Promise<boolean> {
  if (!(await prepareCurrentEdits())) {
    return false;
  }

  // `prepareCurrentEdits` may have waited for an in-flight title or media edit.
  // React's render snapshot can still contain older values at this point, so
  // read the authoritative backend state before issuing this command.
  const latestProject = await getLatestProject();
  if (latestProject === null) {
    return false;
  }
  const nextStartScreen = {
    ...latestProject.startScreen,
    ...patch,
  };
  if (
    nextStartScreen.title === latestProject.startScreen.title &&
    nextStartScreen.eyebrow === latestProject.startScreen.eyebrow &&
    nextStartScreen.backgroundAssetId ===
      latestProject.startScreen.backgroundAssetId &&
    nextStartScreen.musicAssetId ===
      latestProject.startScreen.musicAssetId
  ) {
    return true;
  }

  return updateStartScreen(
    nextStartScreen.title,
    nextStartScreen.eyebrow,
    nextStartScreen.backgroundAssetId,
    nextStartScreen.musicAssetId,
  );
}
