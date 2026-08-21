import type { ProjectDocument } from '../../../shared/projectTypes';

// The main menu is an Editor-owned synthetic scene. It deliberately does not
// use a UUID or enter project.scenes, so story commands can never mutate it as
// if it were an ordinary narrative scene.
export const START_SCREEN_SCENE_ID = 'vn-editor:start-screen';

export type EditorSurface = 'start-screen' | 'story';
export type EditorSurfaceAction =
  | { type: 'project-loaded' }
  | { type: 'select-start-screen' }
  | { type: 'select-story' };

export function initialEditorSurface(): EditorSurface {
  return 'start-screen';
}

export function editorSurfaceReducer(
  _current: EditorSurface,
  action: EditorSurfaceAction,
): EditorSurface {
  return action.type === 'select-story' ? 'story' : 'start-screen';
}

export type EditorSceneOption = {
  id: string;
  label: string;
  kind: 'start-screen' | 'story';
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
