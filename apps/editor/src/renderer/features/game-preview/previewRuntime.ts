import type {
  DialogueNode,
  ProjectDocument,
} from '../../../shared/projectTypes';
import type { TimelineCharacterState } from '../form-editor/timelinePreview';

export type GamePreviewRuntime = {
  status: 'playing' | 'finished' | 'runtimeError';
  sceneId: string;
  nextNodeIndex: number;
  backgroundAssetId: string | null;
  characters: TimelineCharacterState[];
  dialogue: DialogueNode | null;
  errorMessage?: string;
};

function orderedCharacters(
  charactersByLayer: Map<number, TimelineCharacterState>,
): TimelineCharacterState[] {
  return [...charactersByLayer.values()].sort(
    (left, right) => left.layer - right.layer,
  );
}

export function advanceGamePreview(
  project: ProjectDocument,
  current: GamePreviewRuntime,
): GamePreviewRuntime {
  const charactersByLayer = new Map(
    current.characters.map((character) => [character.layer, character]),
  );
  let backgroundAssetId = current.backgroundAssetId;
  let sceneId = current.sceneId;
  let index = current.nextNodeIndex;
  const visitedPositions = new Set<string>();

  for (;;) {
    const scene = project.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return {
        ...current,
        status: 'runtimeError',
        sceneId,
        dialogue: null,
        errorMessage: '跳转的目标场景不存在',
      };
    }
    if (index >= scene.nodes.length) {
      return {
        status: 'finished',
        sceneId,
        nextNodeIndex: scene.nodes.length,
        backgroundAssetId,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
      };
    }
    const positionKey = `${sceneId}:${index}`;
    if (visitedPositions.has(positionKey)) {
      return {
        status: 'runtimeError',
        sceneId,
        nextNodeIndex: index,
        backgroundAssetId,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        errorMessage: '检测到没有对白可停留的场景跳转循环',
      };
    }
    visitedPositions.add(positionKey);
    const node = scene.nodes[index];
    index += 1;
    if (node.type === 'background') {
      backgroundAssetId = node.assetId;
      continue;
    }
    if (node.type === 'character') {
      if (node.assetId === null) {
        charactersByLayer.delete(node.layer);
      } else {
        charactersByLayer.set(node.layer, {
          nodeId: node.id,
          assetId: node.assetId,
          slot: node.slot,
          layer: node.layer,
        });
      }
      continue;
    }
    if (node.type === 'sceneJump') {
      const target = project.scenes.find(
        (candidate) => candidate.id === node.targetSceneId,
      );
      if (!target) {
        return {
          ...current,
          status: 'runtimeError',
          sceneId,
          dialogue: null,
          errorMessage: '跳转的目标场景不存在',
        };
      }
      sceneId = target.id;
      index = 0;
      backgroundAssetId = target.backgroundAssetId;
      charactersByLayer.clear();
      continue;
    }

    return {
      status: 'playing',
      sceneId,
      nextNodeIndex: index,
      backgroundAssetId,
      characters: orderedCharacters(charactersByLayer),
      dialogue: node,
    };
  }
}

export function startGamePreview(
  project: ProjectDocument,
): GamePreviewRuntime | null {
  const scene = project.scenes.find(
    (candidate) => candidate.id === project.entrySceneId,
  );
  if (!scene) {
    return null;
  }

  return advanceGamePreview(project, {
    status: 'playing',
    sceneId: scene.id,
    nextNodeIndex: 0,
    backgroundAssetId: scene.backgroundAssetId,
    characters: [],
    dialogue: null,
  });
}
