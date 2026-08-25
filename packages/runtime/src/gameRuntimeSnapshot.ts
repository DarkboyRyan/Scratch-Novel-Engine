import type {
  CharacterNode,
  ChoiceOption,
  DialogueNode,
  ProjectDocument,
} from './projectTypes';
import type { GameRuntime, RuntimeCharacterState } from './gameRuntime';

export const GAME_RUNTIME_SNAPSHOT_VERSION = 1 as const;

export type GameRuntimeSnapshot = {
  snapshotVersion: typeof GAME_RUNTIME_SNAPSHOT_VERSION;
  status: 'playing' | 'playingVideo' | 'choosing' | 'finished';
  sceneId: string;
  nextNodeIndex: number;
  bgmAssetId: string | null;
  bgmSequence: number;
  dialogueSequence: number;
  videoSequence: number;
};

export type SaveableGameRuntime = GameRuntime & {
  status: GameRuntimeSnapshot['status'];
  errorMessage?: never;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(value: JsonObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((field, index) => field === sortedExpected[index]);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !value.includes('\0');
}

function isSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNullableId(value: unknown): value is string | null {
  return value === null || isId(value);
}

function isPosition(value: unknown): boolean {
  return value === null || (
    isObject(value) &&
    hasExactFields(value, ['x', 'y']) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    value.x >= 0 &&
    value.x <= 100 &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y) &&
    value.y >= 0 &&
    value.y <= 100
  );
}

function isRuntimeCharacter(value: unknown): boolean {
  return isObject(value) &&
    hasExactFields(value, ['nodeId', 'assetId', 'slot', 'layer', 'position']) &&
    isId(value.nodeId) &&
    isId(value.assetId) &&
    (value.slot === 'left' || value.slot === 'center' || value.slot === 'right') &&
    Number.isInteger(value.layer) &&
    (value.layer as number) >= 1 &&
    (value.layer as number) <= 10 &&
    isPosition(value.position);
}

function isDialogue(value: unknown): boolean {
  return value === null || (
    isObject(value) &&
    hasExactFields(value, ['id', 'type', 'speaker', 'text', 'voiceAssetId']) &&
    isId(value.id) &&
    value.type === 'dialogue' &&
    typeof value.speaker === 'string' &&
    value.speaker.length <= 4096 &&
    !value.speaker.includes('\0') &&
    typeof value.text === 'string' &&
    value.text.length <= 1024 * 1024 &&
    !value.text.includes('\0') &&
    isNullableId(value.voiceAssetId)
  );
}

function isChoiceOption(value: unknown): boolean {
  return isObject(value) &&
    hasExactFields(value, ['id', 'text', 'targetSceneId']) &&
    isId(value.id) &&
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    value.text.length <= 65_536 &&
    !value.text.includes('\0') &&
    isId(value.targetSceneId);
}

export function isSaveableGameRuntime(
  value: unknown,
): value is SaveableGameRuntime {
  if (!isObject(value) || !hasExactFields(value, [
    'status',
    'sceneId',
    'nextNodeIndex',
    'backgroundAssetId',
    'bgmAssetId',
    'bgmSequence',
    'dialogueSequence',
    'videoAssetId',
    'videoSequence',
    'characters',
    'dialogue',
    'choices',
  ])) {
    return false;
  }
  if (
    (value.status !== 'playing' &&
      value.status !== 'playingVideo' &&
      value.status !== 'choosing' &&
      value.status !== 'finished') ||
    !isId(value.sceneId) ||
    !isSequence(value.nextNodeIndex) ||
    !isNullableId(value.backgroundAssetId) ||
    !isNullableId(value.bgmAssetId) ||
    !isSequence(value.bgmSequence) ||
    !isSequence(value.dialogueSequence) ||
    !isNullableId(value.videoAssetId) ||
    !isSequence(value.videoSequence) ||
    !Array.isArray(value.characters) ||
    value.characters.length > 10 ||
    !value.characters.every(isRuntimeCharacter) ||
    new Set(value.characters.map((character) =>
      (character as RuntimeCharacterState).layer)).size !== value.characters.length ||
    !isDialogue(value.dialogue) ||
    !Array.isArray(value.choices) ||
    value.choices.length > 1024 ||
    !value.choices.every(isChoiceOption)
  ) {
    return false;
  }
  const characters = value.characters as RuntimeCharacterState[];
  return characters.every(
    (character, index) => index === 0 ||
      characters[index - 1]!.layer < character.layer,
  );
}

function parseSnapshot(value: unknown): GameRuntimeSnapshot | null {
  if (!isObject(value) || !hasExactFields(value, [
    'snapshotVersion',
    'status',
    'sceneId',
    'nextNodeIndex',
    'bgmAssetId',
    'bgmSequence',
    'dialogueSequence',
    'videoSequence',
  ])) {
    return null;
  }
  if (
    value.snapshotVersion !== GAME_RUNTIME_SNAPSHOT_VERSION ||
    (value.status !== 'playing' &&
      value.status !== 'playingVideo' &&
      value.status !== 'choosing' &&
      value.status !== 'finished') ||
    !isId(value.sceneId) ||
    !isSequence(value.nextNodeIndex) ||
    (value.bgmAssetId !== null && !isId(value.bgmAssetId)) ||
    !isSequence(value.bgmSequence) ||
    !isSequence(value.dialogueSequence) ||
    !isSequence(value.videoSequence)
  ) {
    return null;
  }
  return value as GameRuntimeSnapshot;
}

export function isGameRuntimeSnapshot(
  value: unknown,
): value is GameRuntimeSnapshot {
  return parseSnapshot(value) !== null;
}

function sameDialogue(
  left: DialogueNode | null,
  right: DialogueNode | null,
): boolean {
  return left === right || (
    left !== null &&
    right !== null &&
    left.id === right.id &&
    left.speaker === right.speaker &&
    left.text === right.text &&
    left.voiceAssetId === right.voiceAssetId
  );
}

function sameChoices(
  left: readonly ChoiceOption[],
  right: readonly ChoiceOption[],
): boolean {
  return left.length === right.length && left.every((option, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      option.id === candidate.id &&
      option.text === candidate.text &&
      option.targetSceneId === candidate.targetSceneId;
  });
}

function sameCharacters(
  left: readonly RuntimeCharacterState[],
  right: readonly RuntimeCharacterState[],
): boolean {
  return left.length === right.length && left.every((character, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      character.nodeId === candidate.nodeId &&
      character.assetId === candidate.assetId &&
      character.slot === candidate.slot &&
      character.layer === candidate.layer &&
      (character.position === candidate.position || (
        character.position !== null &&
        candidate.position !== null &&
        character.position.x === candidate.position.x &&
        character.position.y === candidate.position.y
      ));
  });
}

function applyCharacter(
  characters: Map<number, RuntimeCharacterState>,
  node: CharacterNode,
): void {
  if (node.assetId === null) {
    characters.delete(node.layer);
    return;
  }
  characters.set(node.layer, {
    nodeId: node.id,
    assetId: node.assetId,
    slot: node.slot,
    layer: node.layer,
    position: node.position,
  });
}

export function restoreGameRuntimeSnapshot(
  project: ProjectDocument,
  value: unknown,
): GameRuntime | null {
  const snapshot = parseSnapshot(value);
  if (snapshot === null) {
    return null;
  }
  const scene = project.scenes.find((candidate) => candidate.id === snapshot.sceneId);
  if (scene === undefined || snapshot.nextNodeIndex > scene.nodes.length) {
    return null;
  }

  const blockingIndex = snapshot.nextNodeIndex - 1;
  if (snapshot.status !== 'finished' && blockingIndex < 0) {
    return null;
  }
  if (snapshot.status === 'finished' && snapshot.nextNodeIndex !== scene.nodes.length) {
    return null;
  }

  let backgroundAssetId = scene.backgroundAssetId;
  const characters = new Map<number, RuntimeCharacterState>();
  let lastLocalBgm: string | null | undefined;
  let localBgmChanges = 0;
  let localDialogues = 0;
  let localVideos = 0;

  for (let index = 0; index < snapshot.nextNodeIndex; index += 1) {
    const node = scene.nodes[index];
    const isBlockingNode = index === blockingIndex && snapshot.status !== 'finished';
    if (node.type === 'sceneJump') {
      return null;
    }
    if (node.type === 'choice' && node.options.length > 0 && !isBlockingNode) {
      return null;
    }
    if (node.type === 'background') {
      backgroundAssetId = node.assetId;
    } else if (node.type === 'character') {
      applyCharacter(characters, node);
    } else if (node.type === 'bgm') {
      lastLocalBgm = node.assetId;
      localBgmChanges += 1;
    } else if (node.type === 'dialogue') {
      localDialogues += 1;
    } else if (node.type === 'video' && node.assetId !== null) {
      localVideos += 1;
    }
  }

  if (
    snapshot.bgmSequence < localBgmChanges ||
    snapshot.dialogueSequence < localDialogues ||
    snapshot.videoSequence < localVideos ||
    (lastLocalBgm !== undefined && snapshot.bgmAssetId !== lastLocalBgm)
  ) {
    return null;
  }
  if (snapshot.bgmAssetId !== null) {
    const knownBgm = project.scenes.some((candidate) =>
      candidate.nodes.some(
        (node) => node.type === 'bgm' && node.assetId === snapshot.bgmAssetId,
      ),
    );
    if (!knownBgm) {
      return null;
    }
  }

  const blockingNode = blockingIndex >= 0 ? scene.nodes[blockingIndex] : undefined;
  let dialogue: DialogueNode | null = null;
  let videoAssetId: string | null = null;
  let choices: ChoiceOption[] = [];
  if (snapshot.status === 'playing') {
    if (blockingNode?.type !== 'dialogue') {
      return null;
    }
    dialogue = blockingNode;
  } else if (snapshot.status === 'playingVideo') {
    if (blockingNode?.type !== 'video' || blockingNode.assetId === null) {
      return null;
    }
    videoAssetId = blockingNode.assetId;
  } else if (snapshot.status === 'choosing') {
    if (blockingNode?.type !== 'choice' || blockingNode.options.length === 0) {
      return null;
    }
    choices = blockingNode.options;
  }

  return {
    status: snapshot.status,
    sceneId: snapshot.sceneId,
    nextNodeIndex: snapshot.nextNodeIndex,
    backgroundAssetId,
    bgmAssetId: snapshot.bgmAssetId,
    bgmSequence: snapshot.bgmSequence,
    dialogueSequence: snapshot.dialogueSequence,
    videoAssetId,
    videoSequence: snapshot.videoSequence,
    characters: [...characters.values()].sort((left, right) => left.layer - right.layer),
    dialogue,
    choices,
  };
}

export function createGameRuntimeSnapshot(
  project: ProjectDocument,
  current: GameRuntime,
): GameRuntimeSnapshot | null {
  if (!isSaveableGameRuntime(current)) {
    return null;
  }
  const snapshot: GameRuntimeSnapshot = {
    snapshotVersion: GAME_RUNTIME_SNAPSHOT_VERSION,
    status: current.status,
    sceneId: current.sceneId,
    nextNodeIndex: current.nextNodeIndex,
    bgmAssetId: current.bgmAssetId,
    bgmSequence: current.bgmSequence,
    dialogueSequence: current.dialogueSequence,
    videoSequence: current.videoSequence,
  };
  const restored = restoreGameRuntimeSnapshot(project, snapshot);
  if (
    restored === null ||
    restored.status !== current.status ||
    restored.sceneId !== current.sceneId ||
    restored.nextNodeIndex !== current.nextNodeIndex ||
    restored.backgroundAssetId !== current.backgroundAssetId ||
    restored.bgmAssetId !== current.bgmAssetId ||
    restored.bgmSequence !== current.bgmSequence ||
    restored.dialogueSequence !== current.dialogueSequence ||
    restored.videoAssetId !== current.videoAssetId ||
    restored.videoSequence !== current.videoSequence ||
    !sameCharacters(restored.characters, current.characters) ||
    !sameDialogue(restored.dialogue, current.dialogue) ||
    !sameChoices(restored.choices, current.choices) ||
    current.errorMessage !== undefined
  ) {
    return null;
  }
  return snapshot;
}
