import type { ProjectDocument } from '../../../shared/projectTypes';

// The main menu and CG gallery are Editor-owned synthetic scenes. They do not
// use UUIDs or enter project.scenes, so story commands can never mutate them as
// ordinary narrative scenes.
export const START_SCREEN_SCENE_ID = 'vn-editor:start-screen';
export const CG_GALLERY_SCENE_ID = 'vn-editor:cg-gallery';

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
): EditorSceneOption[] {
  return [
    {
      id: START_SCREEN_SCENE_ID,
      label: '主界面',
      kind: 'start-screen',
    },
    {
      id: CG_GALLERY_SCENE_ID,
      label: 'CG 画廊',
      kind: 'cg-gallery',
    },
    ...project.scenes.map((scene, index) => ({
      id: scene.id,
      label:
        scene.name === `场景 ${index + 1}`
          ? scene.name
          : `场景 ${index + 1} · ${scene.name}`,
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
    nextStartScreen.backgroundAssetId ===
      latestProject.startScreen.backgroundAssetId &&
    nextStartScreen.musicAssetId ===
      latestProject.startScreen.musicAssetId
  ) {
    return true;
  }

  return updateStartScreen(
    nextStartScreen.title,
    nextStartScreen.backgroundAssetId,
    nextStartScreen.musicAssetId,
  );
}
