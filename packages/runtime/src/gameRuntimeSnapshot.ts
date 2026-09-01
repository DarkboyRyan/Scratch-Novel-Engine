/**
 * 主要作用：创建、校验、比较并恢复版本化游戏运行快照。
 * 关键函数与实现：createGameRuntimeSnapshot、restoreGameRuntimeSnapshot、isGameRuntimeSnapshot；采用纯 TypeScript 状态转换与严格类型守卫，保持平台无关。
 */
import type {
  CharacterNode,
  CharacterPosition,
  CharacterSlot,
  ChoiceOption,
  DialogueNode,
  ProjectDocument,
  SceneDocument,
} from './projectTypes';
import { isCharacterEffect } from './characterEffect';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  isImageScalePercent,
} from './imageScale';
import {
  compileSceneControlFlow,
  type GameRuntime,
  MAX_CG_LEAD_IN_MS,
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

export const GAME_RUNTIME_SNAPSHOT_VERSION = 5 as const;

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

export type LegacyRuntimeCharacterSnapshot = {
  nodeId: string;
  assetId: string;
  slot: CharacterSlot;
  layer: number;
  position: CharacterPosition | null;
};

export type EffectRuntimeCharacterSnapshot = LegacyRuntimeCharacterSnapshot & {
  opacity: 0 | 1;
  effectSequence: number;
};

export type RuntimeCharacterSnapshot = EffectRuntimeCharacterSnapshot & {
  scalePercent: number;
};

export type LogicGameRuntimeSnapshot = {
  snapshotVersion: 2;
  status: 'playing' | 'playingVideo' | 'choosing' | 'finished';
  sceneId: string;
  nextNodeIndex: number;
  backgroundAssetId: string | null;
  bgmAssetId: string | null;
  bgmSequence: number;
  dialogueSequence: number;
  videoSequence: number;
  characters: LegacyRuntimeCharacterSnapshot[];
  variables: RuntimeVariables;
  loopStack: RuntimeLoopSnapshot[];
};

export type CgGameRuntimeSnapshot = Omit<
  LogicGameRuntimeSnapshot,
  'snapshotVersion' | 'status'
> & {
  snapshotVersion: 3;
  status:
    | LogicGameRuntimeSnapshot['status']
    | 'waitingCgLeadIn';
  cgAssetId: string | null;
  cgLeadInMs: number;
  cgSequence: number;
};

export type EffectGameRuntimeSnapshot = Omit<
  CgGameRuntimeSnapshot,
  'snapshotVersion' | 'characters'
> & {
  snapshotVersion: 4;
  characterEffectSequence: number;
  characters: EffectRuntimeCharacterSnapshot[];
};

export type CurrentGameRuntimeSnapshot = Omit<
  EffectGameRuntimeSnapshot,
  'snapshotVersion' | 'backgroundAssetId' | 'characters'
> & {
  snapshotVersion: typeof GAME_RUNTIME_SNAPSHOT_VERSION;
  backgroundAssetId: string | null;
  backgroundScalePercent: number;
  characters: RuntimeCharacterSnapshot[];
};

export type GameRuntimeSnapshot =
  | LegacyGameRuntimeSnapshot
  | LogicGameRuntimeSnapshot
  | CgGameRuntimeSnapshot
  | EffectGameRuntimeSnapshot
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

function isLegacyRuntimeCharacter(
  value: unknown,
): value is LegacyRuntimeCharacterSnapshot {
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

function isRuntimeCharacter(value: unknown): value is RuntimeCharacterState {
  return isObject(value) &&
    hasExactFields(value, [
      'nodeId',
      'assetId',
      'slot',
      'layer',
      'position',
      'scalePercent',
      'opacity',
      'effect',
      'effectSequence',
    ]) &&
    isId(value.nodeId) &&
    isId(value.assetId) &&
    (value.slot === 'left' || value.slot === 'center' || value.slot === 'right') &&
    Number.isInteger(value.layer) &&
    (value.layer as number) >= 1 &&
    (value.layer as number) <= 10 &&
    isPosition(value.position) &&
    isImageScalePercent(value.scalePercent) &&
    (value.opacity === 0 || value.opacity === 1) &&
    (value.effect === null || isCharacterEffect(value.effect)) &&
    isSequence(value.effectSequence) &&
    (value.effectSequence as number) >= 1;
}

function isEffectRuntimeCharacterSnapshot(
  value: unknown,
): value is EffectRuntimeCharacterSnapshot {
  return isObject(value) &&
    hasExactFields(value, [
      'nodeId',
      'assetId',
      'slot',
      'layer',
      'position',
      'opacity',
      'effectSequence',
    ]) &&
    isId(value.nodeId) &&
    isId(value.assetId) &&
    (value.slot === 'left' || value.slot === 'center' || value.slot === 'right') &&
    Number.isInteger(value.layer) &&
    (value.layer as number) >= 1 &&
    (value.layer as number) <= 10 &&
    isPosition(value.position) &&
    (value.opacity === 0 || value.opacity === 1) &&
    isSequence(value.effectSequence) &&
    (value.effectSequence as number) >= 1;
}

function isRuntimeCharacterSnapshot(
  value: unknown,
): value is RuntimeCharacterSnapshot {
  return isObject(value) &&
    hasExactFields(value, [
      'nodeId',
      'assetId',
      'slot',
      'layer',
      'position',
      'scalePercent',
      'opacity',
      'effectSequence',
    ]) &&
    isId(value.nodeId) &&
    isId(value.assetId) &&
    (value.slot === 'left' || value.slot === 'center' || value.slot === 'right') &&
    Number.isInteger(value.layer) &&
    (value.layer as number) >= 1 &&
    (value.layer as number) <= 10 &&
    isPosition(value.position) &&
    isImageScalePercent(value.scalePercent) &&
    (value.opacity === 0 || value.opacity === 1) &&
    isSequence(value.effectSequence) &&
    (value.effectSequence as number) >= 1;
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

function sortedCharacters(
  value: readonly { layer: number }[],
): boolean {
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
    'backgroundScalePercent',
    'bgmAssetId',
    'bgmSequence',
    'dialogueSequence',
    'characterEffectSequence',
    'videoAssetId',
    'videoSequence',
    'cgAssetId',
    'cgLeadInMs',
    'cgSequence',
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
      value.status !== 'waitingCgLeadIn' &&
      value.status !== 'choosing' &&
      value.status !== 'finished') ||
    !isId(value.sceneId) ||
    !isSequence(value.nextNodeIndex) ||
    !isNullableId(value.backgroundAssetId) ||
    !isImageScalePercent(value.backgroundScalePercent) ||
    (value.backgroundAssetId === null &&
      value.backgroundScalePercent !== DEFAULT_IMAGE_SCALE_PERCENT) ||
    !isNullableId(value.bgmAssetId) ||
    !isSequence(value.bgmSequence) ||
    !isSequence(value.dialogueSequence) ||
    !isSequence(value.characterEffectSequence) ||
    !isNullableId(value.videoAssetId) ||
    !isSequence(value.videoSequence) ||
    !isNullableId(value.cgAssetId) ||
    !isSequence(value.cgLeadInMs) ||
    (value.cgLeadInMs as number) > MAX_CG_LEAD_IN_MS ||
    !isSequence(value.cgSequence) ||
    !Array.isArray(value.characters) ||
    value.characters.length > 10 ||
    !value.characters.every(isRuntimeCharacter) ||
    (value.characters as RuntimeCharacterState[]).some((character) =>
      character.effectSequence > (value.characterEffectSequence as number)) ||
    !(value.characters as RuntimeCharacterState[]).every((character) =>
      character.effect === null || (
        character.effectSequence >= 1 &&
        character.opacity === (character.effect.type === 'fadeOut' ? 0 : 1)
      )) ||
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
  if (value.status === 'waitingCgLeadIn') {
    return value.cgAssetId !== null &&
      value.cgSequence >= 1 &&
      value.videoAssetId === null &&
      value.dialogue === null &&
      value.choices.length === 0;
  }
  return value.cgLeadInMs === 0 &&
    (value.cgAssetId === null || value.status === 'playing');
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

function parseLogicSnapshot(value: JsonObject): LogicGameRuntimeSnapshot | null {
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
    value.snapshotVersion !== 2 ||
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
    !value.characters.every(isLegacyRuntimeCharacter) ||
    !sortedCharacters(value.characters) ||
    !isVariables(value.variables) ||
    !Array.isArray(value.loopStack) ||
    value.loopStack.length > 16 ||
    !value.loopStack.every(isRuntimeLoopSnapshot)
  ) {
    return null;
  }
  return value as LogicGameRuntimeSnapshot;
}

function parseCgSnapshot(
  value: JsonObject,
):
  | CgGameRuntimeSnapshot
  | EffectGameRuntimeSnapshot
  | CurrentGameRuntimeSnapshot
  | null {
  const hasEffects = value.snapshotVersion === 4 ||
    value.snapshotVersion === GAME_RUNTIME_SNAPSHOT_VERSION;
  const hasImageScale = value.snapshotVersion === GAME_RUNTIME_SNAPSHOT_VERSION;
  if (!hasExactFields(value, [
    'snapshotVersion',
    'status',
    'sceneId',
    'nextNodeIndex',
    'backgroundAssetId',
    ...(hasImageScale ? ['backgroundScalePercent'] : []),
    'bgmAssetId',
    'bgmSequence',
    'dialogueSequence',
    ...(hasEffects ? ['characterEffectSequence'] : []),
    'videoSequence',
    'cgAssetId',
    'cgLeadInMs',
    'cgSequence',
    'characters',
    'variables',
    'loopStack',
  ])) {
    return null;
  }
  if (
    (value.snapshotVersion !== 3 && !hasEffects) ||
    (value.status !== 'playing' &&
      value.status !== 'playingVideo' &&
      value.status !== 'waitingCgLeadIn' &&
      value.status !== 'choosing' &&
      value.status !== 'finished') ||
    !isId(value.sceneId) ||
    !isSequence(value.nextNodeIndex) ||
    !isNullableId(value.backgroundAssetId) ||
    (hasImageScale && !isImageScalePercent(value.backgroundScalePercent)) ||
    (hasImageScale && value.backgroundAssetId === null &&
      value.backgroundScalePercent !== DEFAULT_IMAGE_SCALE_PERCENT) ||
    !isNullableId(value.bgmAssetId) ||
    !isSequence(value.bgmSequence) ||
    !isSequence(value.dialogueSequence) ||
    (hasEffects && !isSequence(value.characterEffectSequence)) ||
    !isSequence(value.videoSequence) ||
    !isNullableId(value.cgAssetId) ||
    !isSequence(value.cgLeadInMs) ||
    (value.cgLeadInMs as number) > MAX_CG_LEAD_IN_MS ||
    !isSequence(value.cgSequence) ||
    !Array.isArray(value.characters) ||
    value.characters.length > 10 ||
    !value.characters.every(
      hasImageScale
        ? isRuntimeCharacterSnapshot
        : hasEffects
          ? isEffectRuntimeCharacterSnapshot
          : isLegacyRuntimeCharacter,
    ) ||
    (hasEffects && (value.characters as EffectRuntimeCharacterSnapshot[]).some(
      (character) => character.effectSequence >
        (value.characterEffectSequence as number),
    )) ||
    !sortedCharacters(value.characters) ||
    !isVariables(value.variables) ||
    !Array.isArray(value.loopStack) ||
    value.loopStack.length > 16 ||
    !value.loopStack.every(isRuntimeLoopSnapshot)
  ) {
    return null;
  }
  if (
    (
      value.status === 'waitingCgLeadIn' &&
      (value.cgAssetId === null || (value.cgSequence as number) < 1)
    ) ||
    (value.status !== 'waitingCgLeadIn' && value.cgLeadInMs !== 0) ||
    (
      value.cgAssetId !== null &&
      value.status !== 'playing' &&
      value.status !== 'waitingCgLeadIn'
    )
  ) {
    return null;
  }
  return value as
    | CgGameRuntimeSnapshot
    | EffectGameRuntimeSnapshot
    | CurrentGameRuntimeSnapshot;
}

function parseSnapshot(value: unknown): GameRuntimeSnapshot | null {
  if (!isObject(value)) {
    return null;
  }
  if (value.snapshotVersion === 1) {
    return parseLegacySnapshot(value);
  }
  if (value.snapshotVersion === 2) {
    return parseLogicSnapshot(value);
  }
  return parseCgSnapshot(value);
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
  const structuredEqual = left.backgroundAssetId === right.backgroundAssetId &&
    sameCharacters(left.characters, right.characters) &&
    sameVariables(left.variables, right.variables) &&
    left.loopStack.length === right.loopStack.length &&
    left.loopStack.every((frame, index) => {
      const candidate = right.loopStack[index];
      return candidate !== undefined &&
        frame.repeatNodeId === candidate.repeatNodeId &&
        frame.remainingIterations === candidate.remainingIterations;
    });
  if (!structuredEqual) {
    return false;
  }
  if (left.snapshotVersion === 2 || right.snapshotVersion === 2) {
    return left.snapshotVersion === 2 && right.snapshotVersion === 2;
  }
  const cgEqual = left.cgAssetId === right.cgAssetId &&
    left.cgLeadInMs === right.cgLeadInMs &&
    left.cgSequence === right.cgSequence;
  if (!cgEqual) {
    return false;
  }
  if (left.snapshotVersion === 3 || right.snapshotVersion === 3) {
    return left.snapshotVersion === 3 && right.snapshotVersion === 3;
  }
  if (
    left.characterEffectSequence !== right.characterEffectSequence ||
    left.snapshotVersion !== right.snapshotVersion
  ) {
    return false;
  }
  return left.snapshotVersion !== GAME_RUNTIME_SNAPSHOT_VERSION ||
    (
      right.snapshotVersion === GAME_RUNTIME_SNAPSHOT_VERSION &&
      left.backgroundScalePercent === right.backgroundScalePercent
    );
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

type ComparableCharacter =
  | LegacyRuntimeCharacterSnapshot
  | EffectRuntimeCharacterSnapshot
  | RuntimeCharacterSnapshot
  | RuntimeCharacterState;

function sameCharacters(
  left: readonly ComparableCharacter[],
  right: readonly ComparableCharacter[],
): boolean {
  return left.length === right.length && left.every((character, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      character.nodeId === candidate.nodeId &&
      character.assetId === candidate.assetId &&
      character.slot === candidate.slot &&
      character.layer === candidate.layer &&
      (
        !('scalePercent' in character) && !('scalePercent' in candidate) ||
        'scalePercent' in character &&
        'scalePercent' in candidate &&
        character.scalePercent === candidate.scalePercent
      ) &&
      (
        !('opacity' in character) && !('opacity' in candidate) ||
        'opacity' in character &&
        'opacity' in candidate &&
        character.opacity === candidate.opacity &&
        character.effectSequence === candidate.effectSequence
      ) &&
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

function maxCharacterEffectSequence(
  characters: readonly Pick<RuntimeCharacterState, 'effectSequence'>[],
): number {
  return characters.reduce(
    (maximum, character) => Math.max(maximum, character.effectSequence),
    0,
  );
}

function applyCharacter(
  characters: Map<number, RuntimeCharacterState>,
  node: CharacterNode,
): void {
  if (node.assetId === null) {
    characters.delete(node.layer);
    return;
  }
  const previousSequence = characters.get(node.layer)?.effectSequence ?? 0;
  characters.set(node.layer, {
    nodeId: node.id,
    assetId: node.assetId,
    slot: node.slot,
    layer: node.layer,
    position: node.position,
    scalePercent: DEFAULT_IMAGE_SCALE_PERCENT,
    opacity: 1,
    effect: null,
    effectSequence: previousSequence + 1,
  });
}

function knownBgm(project: ProjectDocument, assetId: string | null): boolean {
  return assetId === null || project.scenes.some((scene) =>
    scene.nodes.some((node) => node.type === 'bgm' && node.assetId === assetId),
  );
}

function restoreBlockingPresentation(
  scene: SceneDocument,
  status: GameRuntimeSnapshot['status'],
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
  if (status === 'waitingCgLeadIn') {
    return node?.type === 'cgDisplay'
      ? { dialogue: null, videoAssetId: null, choices: [] }
      : null;
  }
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
      node.type === 'logicEndRepeat' ||
      node.type === 'cgDisplay' ||
      node.type === 'cgEndDisplay' ||
      (node.type === 'character' && node.effect !== null)
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
    backgroundScalePercent: DEFAULT_IMAGE_SCALE_PERCENT,
    bgmAssetId: snapshot.bgmAssetId,
    bgmSequence: snapshot.bgmSequence,
    dialogueSequence: snapshot.dialogueSequence,
    characterEffectSequence: maxCharacterEffectSequence([...characters.values()]),
    videoAssetId: blocking.videoAssetId,
    videoSequence: snapshot.videoSequence,
    cgAssetId: null,
    cgLeadInMs: 0,
    cgSequence: 0,
    characters: [...characters.values()].sort((left, right) => left.layer - right.layer),
    dialogue: blocking.dialogue,
    choices: blocking.choices,
    variables: {},
    loopStack: [],
  };
}

function characterMatchesProject(
  scene: SceneDocument,
  character: ComparableCharacter,
): boolean {
  return scene.nodes.some((node) => node.type === 'character' &&
    node.id === character.nodeId &&
    node.assetId === character.assetId &&
    node.slot === character.slot &&
    node.layer === character.layer &&
    (
      !('scalePercent' in character) ||
      node.scalePercent === character.scalePercent
    ) &&
    (node.position === character.position || (
      node.position !== null &&
      character.position !== null &&
      node.position.x === character.position.x &&
      node.position.y === character.position.y
    )) &&
    (
      !('opacity' in character) ||
      character.opacity === (node.effect?.type === 'fadeOut' ? 0 : 1)
    ),
  );
}

function restoreCurrentGameRuntimeSnapshot(
  project: ProjectDocument,
  snapshot:
    | LogicGameRuntimeSnapshot
    | CgGameRuntimeSnapshot
    | EffectGameRuntimeSnapshot
    | CurrentGameRuntimeSnapshot,
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
  if (
    snapshot.snapshotVersion === 2 &&
    scene.nodes.some((node) =>
      node.type === 'cgDisplay' || node.type === 'cgEndDisplay')
  ) {
    return null;
  }
  if (
    snapshot.snapshotVersion < 4 &&
    scene.nodes.some((node) => node.type === 'character' && node.effect !== null)
  ) {
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
  let cgAssetId: string | null = null;
  let cgLeadInMs = 0;
  let cgSequence = 0;
  if (snapshot.snapshotVersion !== 2) {
    cgSequence = snapshot.cgSequence;
    if (snapshot.status === 'waitingCgLeadIn') {
      const display = scene.nodes[blockingIndex];
      if (
        display?.type !== 'cgDisplay' ||
        !controlFlow.cgByStart.has(blockingIndex) ||
        snapshot.cgAssetId !== display.assetId ||
        snapshot.cgLeadInMs !== display.leadInMs ||
        snapshot.cgSequence < 1
      ) {
        return null;
      }
      cgAssetId = display.assetId;
      cgLeadInMs = display.leadInMs;
    } else {
      const activeCgs = [...controlFlow.cgByStart.values()].filter(
        (control) =>
          control.displayIndex < blockingIndex &&
          blockingIndex < control.endIndex,
      );
      if (activeCgs.length > 1) {
        return null;
      }
      const display = activeCgs.length === 1
        ? scene.nodes[activeCgs[0]!.displayIndex]
        : null;
      const expectedCgAssetId = display?.type === 'cgDisplay'
        ? display.assetId
        : null;
      if (
        snapshot.cgAssetId !== expectedCgAssetId ||
        snapshot.cgLeadInMs !== 0 ||
        (expectedCgAssetId !== null && snapshot.cgSequence < 1)
      ) {
        return null;
      }
      cgAssetId = expectedCgAssetId;
    }
  }
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
  const allowedScaledBackgrounds = new Set<string>([
    `${scene.backgroundAssetId ?? ''}\0${scene.backgroundScalePercent}`,
  ]);
  for (const node of scene.nodes) {
    if (node.type === 'background') {
      allowedBackgrounds.add(node.assetId);
      allowedScaledBackgrounds.add(`${node.assetId ?? ''}\0${node.scalePercent}`);
    }
  }
  if (
    !allowedBackgrounds.has(snapshot.backgroundAssetId) ||
    (
      snapshot.snapshotVersion === GAME_RUNTIME_SNAPSHOT_VERSION &&
      !allowedScaledBackgrounds.has(
        `${snapshot.backgroundAssetId ?? ''}\0${snapshot.backgroundScalePercent}`,
      )
    ) ||
    !snapshot.characters.every((character) =>
      characterMatchesProject(scene, character))
  ) {
    return null;
  }

  const characters = snapshot.characters.map((character) => ({
    ...character,
    position: character.position === null ? null : { ...character.position },
    opacity: 'opacity' in character ? character.opacity : 1,
    scalePercent: 'scalePercent' in character
      ? character.scalePercent
      : DEFAULT_IMAGE_SCALE_PERCENT,
    effect: null,
    effectSequence: 'effectSequence' in character
      ? character.effectSequence
      : 1,
  }));
  const characterEffectSequence = (
    snapshot.snapshotVersion === 4 ||
    snapshot.snapshotVersion === GAME_RUNTIME_SNAPSHOT_VERSION
  )
    ? snapshot.characterEffectSequence
    : maxCharacterEffectSequence(characters);

  return {
    status: snapshot.status,
    sceneId: snapshot.sceneId,
    nextNodeIndex: snapshot.nextNodeIndex,
    backgroundAssetId: snapshot.backgroundAssetId,
    backgroundScalePercent: snapshot.snapshotVersion ===
      GAME_RUNTIME_SNAPSHOT_VERSION
      ? snapshot.backgroundScalePercent
      : DEFAULT_IMAGE_SCALE_PERCENT,
    bgmAssetId: snapshot.bgmAssetId,
    bgmSequence: snapshot.bgmSequence,
    dialogueSequence: snapshot.dialogueSequence,
    characterEffectSequence,
    videoAssetId: blocking.videoAssetId,
    videoSequence: snapshot.videoSequence,
    cgAssetId,
    cgLeadInMs,
    cgSequence,
    characters,
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
    backgroundScalePercent: current.backgroundScalePercent,
    bgmAssetId: current.bgmAssetId,
    bgmSequence: current.bgmSequence,
    dialogueSequence: current.dialogueSequence,
    characterEffectSequence: current.characterEffectSequence,
    videoSequence: current.videoSequence,
    cgAssetId: current.cgAssetId,
    cgLeadInMs: current.cgLeadInMs,
    cgSequence: current.cgSequence,
    characters: current.characters.map((character) => ({
      nodeId: character.nodeId,
      assetId: character.assetId,
      slot: character.slot,
      layer: character.layer,
      position: character.position === null ? null : { ...character.position },
      scalePercent: character.scalePercent,
      opacity: character.opacity,
      effectSequence: character.effectSequence,
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
    restored.backgroundScalePercent !== current.backgroundScalePercent ||
    restored.bgmAssetId !== current.bgmAssetId ||
    restored.bgmSequence !== current.bgmSequence ||
    restored.dialogueSequence !== current.dialogueSequence ||
    restored.characterEffectSequence !== current.characterEffectSequence ||
    restored.videoAssetId !== current.videoAssetId ||
    restored.videoSequence !== current.videoSequence ||
    restored.cgAssetId !== current.cgAssetId ||
    restored.cgLeadInMs !== current.cgLeadInMs ||
    restored.cgSequence !== current.cgSequence ||
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
