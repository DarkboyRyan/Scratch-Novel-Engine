import type {
  CharacterSlot,
  ChoiceNode,
  ChoiceOption,
  DialogueNode,
  ProjectDocument,
} from './projectTypes';

export type RuntimeCharacterState = {
  nodeId: string;
  assetId: string;
  slot: CharacterSlot;
  layer: number;
};

export type GameRuntime = {
  status:
    | 'playing'
    | 'playingVideo'
    | 'choosing'
    | 'finished'
    | 'runtimeError';
  sceneId: string;
  nextNodeIndex: number;
  backgroundAssetId: string | null;
  bgmAssetId: string | null;
  bgmSequence: number;
  dialogueSequence: number;
  videoAssetId: string | null;
  videoSequence: number;
  characters: RuntimeCharacterState[];
  dialogue: DialogueNode | null;
  choices: ChoiceOption[];
  errorMessage?: string;
};

function activeChoiceNode(
  project: ProjectDocument,
  current: GameRuntime,
): ChoiceNode | null {
  if (current.status !== 'choosing' || current.nextNodeIndex < 1) {
    return null;
  }

  const scene = project.scenes.find(
    (candidate) => candidate.id === current.sceneId,
  );
  const node = scene?.nodes[current.nextNodeIndex - 1];
  return node?.type === 'choice' ? node : null;
}

// The cursor already points immediately after the blocking choice. Deriving
// the active node from it keeps authoring data out of the ephemeral state.
export function getChoices(
  project: ProjectDocument,
  current: GameRuntime,
): readonly ChoiceOption[] {
  return activeChoiceNode(project, current) ? current.choices : [];
}

function choiceRuntimeError(
  current: GameRuntime,
  errorMessage: string,
): GameRuntime {
  return {
    ...current,
    status: 'runtimeError',
    videoAssetId: null,
    dialogue: null,
    choices: [],
    errorMessage,
  };
}

function orderedCharacters(
  charactersByLayer: Map<number, RuntimeCharacterState>,
): RuntimeCharacterState[] {
  return [...charactersByLayer.values()].sort(
    (left, right) => left.layer - right.layer,
  );
}

export function advanceGame(
  project: ProjectDocument,
  current: GameRuntime,
): GameRuntime {
  const charactersByLayer = new Map(
    current.characters.map((character) => [character.layer, character]),
  );
  let backgroundAssetId = current.backgroundAssetId;
  let bgmAssetId = current.bgmAssetId;
  let bgmSequence = current.bgmSequence;
  const dialogueSequence = current.dialogueSequence;
  let videoSequence = current.videoSequence;
  let sceneId = current.sceneId;
  let index = current.nextNodeIndex;
  const visitedPositions = new Set<string>();

  for (;;) {
    const scene = project.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return {
        status: 'runtimeError',
        sceneId,
        nextNodeIndex: index,
        backgroundAssetId,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        videoAssetId: null,
        videoSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: [],
        errorMessage: '跳转的目标场景不存在',
      };
    }
    if (index >= scene.nodes.length) {
      return {
        status: 'finished',
        sceneId,
        nextNodeIndex: scene.nodes.length,
        backgroundAssetId,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        videoAssetId: null,
        videoSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: [],
      };
    }
    const positionKey = `${sceneId}:${index}`;
    if (visitedPositions.has(positionKey)) {
      return {
        status: 'runtimeError',
        sceneId,
        nextNodeIndex: index,
        backgroundAssetId,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        videoAssetId: null,
        videoSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: [],
        errorMessage: '检测到没有对白或可选项可停留的场景跳转循环',
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
    if (node.type === 'bgm') {
      bgmAssetId = node.assetId;
      bgmSequence += 1;
      continue;
    }
    if (node.type === 'video') {
      if (node.assetId === null) {
        continue;
      }
      videoSequence += 1;
      return {
        status: 'playingVideo',
        sceneId,
        nextNodeIndex: index,
        backgroundAssetId,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        videoAssetId: node.assetId,
        videoSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: [],
      };
    }
    if (node.type === 'choice') {
      if (node.options.length === 0) {
        continue;
      }
      return {
        status: 'choosing',
        sceneId,
        nextNodeIndex: index,
        backgroundAssetId,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        videoAssetId: null,
        videoSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: node.options,
      };
    }
    if (node.type === 'sceneJump') {
      const target = project.scenes.find(
        (candidate) => candidate.id === node.targetSceneId,
      );
      if (!target) {
        return {
          status: 'runtimeError',
          sceneId,
          nextNodeIndex: index,
          backgroundAssetId,
          bgmAssetId,
          bgmSequence,
          dialogueSequence,
          videoAssetId: null,
          videoSequence,
          characters: orderedCharacters(charactersByLayer),
          dialogue: null,
          choices: [],
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
      bgmAssetId,
      bgmSequence,
      dialogueSequence: dialogueSequence + 1,
      videoAssetId: null,
      videoSequence,
      characters: orderedCharacters(charactersByLayer),
      dialogue: node,
      choices: [],
    };
  }
}

export function selectChoice(
  project: ProjectDocument,
  current: GameRuntime,
  optionId: string,
): GameRuntime {
  if (current.status !== 'choosing') {
    return current;
  }

  const choice = activeChoiceNode(project, current);
  if (!choice) {
    return choiceRuntimeError(current, '当前选项节点不存在');
  }
  const option = choice.options.find((candidate) => candidate.id === optionId);
  if (!option) {
    return choiceRuntimeError(current, '选择的选项不存在');
  }
  const target = project.scenes.find(
    (candidate) => candidate.id === option.targetSceneId,
  );
  if (!target) {
    return choiceRuntimeError(current, '选项跳转的目标场景不存在');
  }

  return advanceGame(project, {
    status: 'playing',
    sceneId: target.id,
    nextNodeIndex: 0,
    backgroundAssetId: target.backgroundAssetId,
    bgmAssetId: current.bgmAssetId,
    bgmSequence: current.bgmSequence,
    dialogueSequence: current.dialogueSequence,
    videoAssetId: null,
    videoSequence: current.videoSequence,
    characters: [],
    dialogue: null,
    choices: [],
  });
}

export function startGame(project: ProjectDocument): GameRuntime | null {
  const scene = project.scenes.find(
    (candidate) => candidate.id === project.entrySceneId,
  );
  if (!scene) {
    return null;
  }

  return advanceGame(project, {
    status: 'playing',
    sceneId: scene.id,
    nextNodeIndex: 0,
    backgroundAssetId: scene.backgroundAssetId,
    bgmAssetId: null,
    bgmSequence: 0,
    dialogueSequence: 0,
    videoAssetId: null,
    videoSequence: 0,
    characters: [],
    dialogue: null,
    choices: [],
  });
}
