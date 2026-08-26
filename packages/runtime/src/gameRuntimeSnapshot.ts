import type {
  CharacterNode,
  ChoiceOption,
  DialogueNode,
  ProjectDocument,
  SceneDocument,
} from './projectTypes';
import {
  compileSceneControlFlow,
  type GameRuntime,
  type RuntimeCharacterState,
  type RuntimeLoopFrame,
  type RuntimeVariables,
} from './gameRuntime';
import {
  isLogicValue,
  isLogicVariableName,
  MAX_RUNTIME_VARIABLE_BYTES,
  MAX_RUNTIME_VARIABLES,
  projectLogicVariableNames,
  utf8ByteLength,
} from './logicValidation';

export const GAME_RUNTIME_SNAPSHOT_VERSION = 2 as const;

export type LegacyGameRuntimeSnapshot = {
  snapshotVersion: 1;
  status: 'playing' | 'playingVideo' | 'choosing' | 'finished';
  sceneId: string;
  nextNodeIndex: number;
  bgmAssetId: string | null;
  bgmSequence: number;
  dialogueSequence: number;
  videoSequence: number;
};

export type RuntimeLoopSnapshot = {
  repeatNodeId: string;
  remainingIterations: number;
};

export type CurrentGameRuntimeSnapshot = {
  snapshotVersion: typeof GAME_RUNTIME_SNAPSHOT_VERSION;
  status: 'playing' | 'playingVideo' | 'choosing' | 'finished';
  sceneId: string;
  nextNodeIndex: number;
  backgroundAssetId: string | null;
  bgmAssetId: string | null;
  bgmSequence: number;
  dialogueSequence: number;
  videoSequence: number;
  characters: RuntimeCharacterState[];
  variables: RuntimeVariables;
  loopStack: RuntimeLoopSnapshot[];
};

export type GameRuntimeSnapshot =
  | LegacyGameRuntimeSnapshot
  | CurrentGameRuntimeSnapshot;

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

function isVariables(value: unknown): value is RuntimeVariables {
  if (!isObject(value) || Object.keys(value).length > MAX_RUNTIME_VARIABLES) {
    return false;
  }
  let bytes = 0;
  return Object.entries(value).every(([name, variable]) => {
    if (!isLogicVariableName(name) || !isLogicValue(variable)) {
      return false;
    }
    bytes += utf8ByteLength(name);
    bytes += typeof variable === 'string'
      ? utf8ByteLength(variable)
      : typeof variable === 'boolean' ? 5 : 32;
    return bytes <= MAX_RUNTIME_VARIABLE_BYTES;
  });
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

function isRuntimeCharacter(value: unknown): value is RuntimeCharacterState {
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

function isDialogue(value: unknown): value is DialogueNode | null {
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

function isChoiceOption(value: unknown): value is ChoiceOption {
  return isObject(value) &&
    hasExactFields(value, ['id', 'text', 'targetSceneId']) &&
    isId(value.id) &&
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    value.text.length <= 65_536 &&
    !value.text.includes('\0') &&
    isId(value.targetSceneId);
}

function isRuntimeLoopFrame(value: unknown): value is RuntimeLoopFrame {
  return isObject(value) &&
    hasExactFields(value, [
      'repeatNodeId',
      'repeatNodeIndex',
      'endNodeIndex',
      'remainingIterations',
    ]) &&
    isId(value.repeatNodeId) &&
    isSequence(value.repeatNodeIndex) &&
    isSequence(value.endNodeIndex) &&
    Number.isSafeInteger(value.remainingIterations) &&
    (value.remainingIterations as number) >= 1 &&
    (value.remainingIterations as number) <= 1_000;
}

function isRuntimeLoopSnapshot(value: unknown): value is RuntimeLoopSnapshot {
  return isObject(value) &&
    hasExactFields(value, ['repeatNodeId', 'remainingIterations']) &&
    isId(value.repeatNodeId) &&
    Number.isSafeInteger(value.remainingIterations) &&
    (value.remainingIterations as number) >= 1 &&
    (value.remainingIterations as number) <= 1_000;
}

function sortedCharacters(value: RuntimeCharacterState[]): boolean {
  return value.every(
    (character, index) => index === 0 ||
      value[index - 1]!.layer < character.layer,
  );
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
    'variables',
    'loopStack',
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
    !sortedCharacters(value.characters as RuntimeCharacterState[]) ||
    !isDialogue(value.dialogue) ||
    !Array.isArray(value.choices) ||
    value.choices.length > 1024 ||
    !value.choices.every(isChoiceOption) ||
    !isVariables(value.variables) ||
    !Array.isArray(value.loopStack) ||
    value.loopStack.length > 16 ||
    !value.loopStack.every(isRuntimeLoopFrame)
  ) {
    return false;
  }
  return true;
}

function parseLegacySnapshot(value: JsonObject): LegacyGameRuntimeSnapshot | null {
  if (!hasExactFields(value, [
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
    value.snapshotVersion !== 1 ||
    (value.status !== 'playing' &&
      value.status !== 'playingVideo' &&
      value.status !== 'choosing' &&
      value.status !== 'finished') ||
    !isId(value.sceneId) ||
    !isSequence(value.nextNodeIndex) ||
    !isNullableId(value.bgmAssetId) ||
    !isSequence(value.bgmSequence) ||
    !isSequence(value.dialogueSequence) ||
    !isSequence(value.videoSequence)
  ) {
    return null;
  }
  return value as LegacyGameRuntimeSnapshot;
}

function parseCurrentSnapshot(value: JsonObject): CurrentGameRuntimeSnapshot | null {
  if (!hasExactFields(value, [
    'snapshotVersion',
    'status',
    'sceneId',
    'nextNodeIndex',
    'backgroundAssetId',
    'bgmAssetId',
    'bgmSequence',
    'dialogueSequence',
    'videoSequence',
    'characters',
    'variables',
    'loopStack',
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
    !isNullableId(value.backgroundAssetId) ||
    !isNullableId(value.bgmAssetId) ||
    !isSequence(value.bgmSequence) ||
    !isSequence(value.dialogueSequence) ||
    !isSequence(value.videoSequence) ||
    !Array.isArray(value.characters) ||
    value.characters.length > 10 ||
    !value.characters.every(isRuntimeCharacter) ||
    !sortedCharacters(value.characters) ||
    !isVariables(value.variables) ||
    !Array.isArray(value.loopStack) ||
    value.loopStack.length > 16 ||
    !value.loopStack.every(isRuntimeLoopSnapshot)
  ) {
    return null;
  }
  return value as CurrentGameRuntimeSnapshot;
}

function parseSnapshot(value: unknown): GameRuntimeSnapshot | null {
  if (!isObject(value)) {
    return null;
  }
  return value.snapshotVersion === 1
    ? parseLegacySnapshot(value)
    : parseCurrentSnapshot(value);
}

export function isGameRuntimeSnapshot(
  value: unknown,
): value is GameRuntimeSnapshot {
  return parseSnapshot(value) !== null;
}

export function areGameRuntimeSnapshotsEqual(
  leftValue: unknown,
  rightValue: unknown,
): boolean {
  const left = parseSnapshot(leftValue);
  const right = parseSnapshot(rightValue);
  if (left === null || right === null || left.snapshotVersion !== right.snapshotVersion) {
    return false;
  }
  if (
    left.status !== right.status ||
    left.sceneId !== right.sceneId ||
    left.nextNodeIndex !== right.nextNodeIndex ||
    left.bgmAssetId !== right.bgmAssetId ||
    left.bgmSequence !== right.bgmSequence ||
    left.dialogueSequence !== right.dialogueSequence ||
    left.videoSequence !== right.videoSequence
  ) {
    return false;
  }
  if (left.snapshotVersion === 1 || right.snapshotVersion === 1) {
    return left.snapshotVersion === 1 && right.snapshotVersion === 1;
  }
  return left.backgroundAssetId === right.backgroundAssetId &&
    sameCharacters(left.characters, right.characters) &&
    sameVariables(left.variables, right.variables) &&
    left.loopStack.length === right.loopStack.length &&
    left.loopStack.every((frame, index) => {
      const candidate = right.loopStack[index];
      return candidate !== undefined &&
        frame.repeatNodeId === candidate.repeatNodeId &&
        frame.remainingIterations === candidate.remainingIterations;
    });
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

function sameVariables(
  left: RuntimeVariables,
  right: RuntimeVariables,
): boolean {
  const leftNames = Object.keys(left).sort();
  const rightNames = Object.keys(right).sort();
  return leftNames.length === rightNames.length && leftNames.every(
    (name, index) => name === rightNames[index] && left[name] === right[name],
  );
}

function sameLoopStack(
  left: readonly RuntimeLoopFrame[],
  right: readonly RuntimeLoopFrame[],
): boolean {
  return left.length === right.length && left.every((frame, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      frame.repeatNodeId === candidate.repeatNodeId &&
      frame.repeatNodeIndex === candidate.repeatNodeIndex &&
      frame.endNodeIndex === candidate.endNodeIndex &&
      frame.remainingIterations === candidate.remainingIterations;
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

function knownBgm(project: ProjectDocument, assetId: string | null): boolean {
  return assetId === null || project.scenes.some((scene) =>
    scene.nodes.some((node) => node.type === 'bgm' && node.assetId === assetId),
  );
}

function restoreBlockingPresentation(
  scene: SceneDocument,
  status: CurrentGameRuntimeSnapshot['status'],
  nextNodeIndex: number,
): {
  dialogue: DialogueNode | null;
  videoAssetId: string | null;
  choices: ChoiceOption[];
} | null {
  if (status === 'finished') {
    return nextNodeIndex === scene.nodes.length
      ? { dialogue: null, videoAssetId: null, choices: [] }
      : null;
  }
  if (nextNodeIndex < 1) {
    return null;
  }
  const node = scene.nodes[nextNodeIndex - 1];
  if (status === 'playing') {
    return node?.type === 'dialogue'
      ? { dialogue: node, videoAssetId: null, choices: [] }
      : null;
  }
  if (status === 'playingVideo') {
    return node?.type === 'video' && node.assetId !== null
      ? { dialogue: null, videoAssetId: node.assetId, choices: [] }
      : null;
  }
  return node?.type === 'choice' && node.options.length > 0
    ? { dialogue: null, videoAssetId: null, choices: node.options }
    : null;
}

function restoreLegacyGameRuntimeSnapshot(
  project: ProjectDocument,
  snapshot: LegacyGameRuntimeSnapshot,
): GameRuntime | null {
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
    const node = scene.nodes[index]!;
    const isBlockingNode = index === blockingIndex && snapshot.status !== 'finished';
    if (
      node.type === 'sceneJump' ||
      node.type === 'variableSet' ||
      node.type === 'variableChange' ||
      node.type === 'logicIf' ||
      node.type === 'logicElse' ||
      node.type === 'logicEndIf' ||
      node.type === 'logicRepeat' ||
      node.type === 'logicEndRepeat'
    ) {
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
    (lastLocalBgm !== undefined && snapshot.bgmAssetId !== lastLocalBgm) ||
    !knownBgm(project, snapshot.bgmAssetId)
  ) {
    return null;
  }

  const blocking = restoreBlockingPresentation(
    scene,
    snapshot.status,
    snapshot.nextNodeIndex,
  );
  if (blocking === null) {
    return null;
  }
  return {
    status: snapshot.status,
    sceneId: snapshot.sceneId,
    nextNodeIndex: snapshot.nextNodeIndex,
    backgroundAssetId,
    bgmAssetId: snapshot.bgmAssetId,
    bgmSequence: snapshot.bgmSequence,
    dialogueSequence: snapshot.dialogueSequence,
    videoAssetId: blocking.videoAssetId,
    videoSequence: snapshot.videoSequence,
    characters: [...characters.values()].sort((left, right) => left.layer - right.layer),
    dialogue: blocking.dialogue,
    choices: blocking.choices,
    variables: {},
    loopStack: [],
  };
}

function characterMatchesProject(
  scene: SceneDocument,
  character: RuntimeCharacterState,
): boolean {
  return scene.nodes.some((node) => node.type === 'character' &&
    node.id === character.nodeId &&
    node.assetId === character.assetId &&
    node.slot === character.slot &&
    node.layer === character.layer &&
    (node.position === character.position || (
      node.position !== null &&
      character.position !== null &&
      node.position.x === character.position.x &&
      node.position.y === character.position.y
    )),
  );
}

function restoreCurrentGameRuntimeSnapshot(
  project: ProjectDocument,
  snapshot: CurrentGameRuntimeSnapshot,
): GameRuntime | null {
  const declaredVariableNames = projectLogicVariableNames(project);
  if (Object.keys(snapshot.variables).some(
    (name) => !declaredVariableNames.has(name),
  )) {
    return null;
  }

  const scene = project.scenes.find((candidate) => candidate.id === snapshot.sceneId);
  if (scene === undefined || snapshot.nextNodeIndex > scene.nodes.length) {
    return null;
  }
  const controlFlow = compileSceneControlFlow(scene.nodes);
  if (typeof controlFlow === 'string') {
    return null;
  }
  const blocking = restoreBlockingPresentation(
    scene,
    snapshot.status,
    snapshot.nextNodeIndex,
  );
  if (blocking === null || !knownBgm(project, snapshot.bgmAssetId)) {
    return null;
  }
  if (snapshot.status === 'finished' && snapshot.loopStack.length !== 0) {
    return null;
  }

  const blockingIndex = snapshot.nextNodeIndex - 1;
  const activeRepeats = [...controlFlow.repeatByStart.values()]
    .filter((control) =>
      control.repeatIndex < blockingIndex && blockingIndex < control.endIndex)
    .sort((left, right) => left.repeatIndex - right.repeatIndex);
  if (activeRepeats.length !== snapshot.loopStack.length) {
    return null;
  }
  const loopStack: RuntimeLoopFrame[] = [];
  for (let index = 0; index < activeRepeats.length; index += 1) {
    const control = activeRepeats[index]!;
    const saved = snapshot.loopStack[index]!;
    const repeat = scene.nodes[control.repeatIndex];
    if (
      repeat?.type !== 'logicRepeat' ||
      repeat.id !== saved.repeatNodeId ||
      saved.remainingIterations > repeat.count
    ) {
      return null;
    }
    loopStack.push({
      repeatNodeId: repeat.id,
      repeatNodeIndex: control.repeatIndex,
      endNodeIndex: control.endIndex,
      remainingIterations: saved.remainingIterations,
    });
  }

  const allowedBackgrounds = new Set<string | null>([scene.backgroundAssetId]);
  for (const node of scene.nodes) {
    if (node.type === 'background') {
      allowedBackgrounds.add(node.assetId);
    }
  }
  if (
    !allowedBackgrounds.has(snapshot.backgroundAssetId) ||
    !snapshot.characters.every((character) =>
      characterMatchesProject(scene, character))
  ) {
    return null;
  }

  return {
    status: snapshot.status,
    sceneId: snapshot.sceneId,
    nextNodeIndex: snapshot.nextNodeIndex,
    backgroundAssetId: snapshot.backgroundAssetId,
    bgmAssetId: snapshot.bgmAssetId,
    bgmSequence: snapshot.bgmSequence,
    dialogueSequence: snapshot.dialogueSequence,
    videoAssetId: blocking.videoAssetId,
    videoSequence: snapshot.videoSequence,
    characters: snapshot.characters.map((character) => ({
      ...character,
      position: character.position === null ? null : { ...character.position },
    })),
    dialogue: blocking.dialogue,
    choices: blocking.choices,
    variables: { ...snapshot.variables },
    loopStack,
  };
}

export function restoreGameRuntimeSnapshot(
  project: ProjectDocument,
  value: unknown,
): GameRuntime | null {
  const snapshot = parseSnapshot(value);
  if (snapshot === null) {
    return null;
  }
  return snapshot.snapshotVersion === 1
    ? restoreLegacyGameRuntimeSnapshot(project, snapshot)
    : restoreCurrentGameRuntimeSnapshot(project, snapshot);
}

function canonicalVariables(variables: RuntimeVariables): RuntimeVariables {
  return Object.fromEntries(
    Object.keys(variables).sort().map((name) => [name, variables[name]!]),
  );
}

export function createGameRuntimeSnapshot(
  project: ProjectDocument,
  current: GameRuntime,
): CurrentGameRuntimeSnapshot | null {
  if (!isSaveableGameRuntime(current)) {
    return null;
  }
  const snapshot: CurrentGameRuntimeSnapshot = {
    snapshotVersion: GAME_RUNTIME_SNAPSHOT_VERSION,
    status: current.status,
    sceneId: current.sceneId,
    nextNodeIndex: current.nextNodeIndex,
    backgroundAssetId: current.backgroundAssetId,
    bgmAssetId: current.bgmAssetId,
    bgmSequence: current.bgmSequence,
    dialogueSequence: current.dialogueSequence,
    videoSequence: current.videoSequence,
    characters: current.characters.map((character) => ({
      ...character,
      position: character.position === null ? null : { ...character.position },
    })),
    variables: canonicalVariables(current.variables),
    loopStack: current.loopStack.map((frame) => ({
      repeatNodeId: frame.repeatNodeId,
      remainingIterations: frame.remainingIterations,
    })),
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
    !sameVariables(restored.variables, current.variables) ||
    !sameLoopStack(restored.loopStack, current.loopStack) ||
    current.errorMessage !== undefined
  ) {
    return null;
  }
  return snapshot;
}
