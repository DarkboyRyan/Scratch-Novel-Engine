/**
 * 主要作用：执行视觉小说场景、选择、逻辑、循环、CG 与人物状态。
 * 关键函数与实现：startGame、advanceGame、chooseOption、completeCgLeadIn、compileSceneControlFlow；采用纯 TypeScript 状态转换与严格类型守卫，保持平台无关。
 */
import type {
  CharacterEffect,
  CharacterPosition,
  CharacterSlot,
  ChoiceNode,
  ChoiceOption,
  DialogueNode,
  LogicCondition,
  LogicOperand,
  LogicValue,
  ProjectDocument,
  SceneNode,
} from './projectTypes';
import { isCharacterEffect } from './characterEffect';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  isImageScalePercent,
} from './imageScale';
import {
  isLogicCondition,
  isLogicValue,
  isLogicVariableName,
  MAX_AUTOMATIC_STEPS_PER_ADVANCE,
  MAX_LOGIC_NESTING_DEPTH,
  MAX_REPEAT_COUNT,
  validateProjectLogicVariableBudget,
} from './logicValidation';

export {
  MAX_AUTOMATIC_STEPS_PER_ADVANCE,
  MAX_LOGIC_NESTING_DEPTH,
  MAX_REPEAT_COUNT,
} from './logicValidation';

export const MAX_CG_LEAD_IN_MS = 60_000;

export type RuntimeCharacterState = {
  nodeId: string;
  assetId: string;
  slot: CharacterSlot;
  layer: number;
  position: CharacterPosition | null;
  scalePercent: number;
  /** Final opacity retained after the current effect finishes. */
  opacity: 0 | 1;
  /** Transient effect event for the presentation reached by this advance. */
  effect: CharacterEffect | null;
  /** Changes on every non-null character action, including loop replays. */
  effectSequence: number;
};

export type RuntimeVariables = Record<string, LogicValue>;

export type RuntimeLoopFrame = {
  repeatNodeId: string;
  repeatNodeIndex: number;
  endNodeIndex: number;
  remainingIterations: number;
};

export type RuntimeErrorCode =
  | 'logicInvalidStructure'
  | 'logicComparisonType'
  | 'logicVariableType'
  | 'logicVariableOverflow'
  | 'logicStepLimit'
  | 'logicLoopState'
  | 'logicVariableBudget'
  | 'characterEffectInvalid'
  | 'imageScaleInvalid';

export type GameRuntime = {
  status:
    | 'playing'
    | 'playingVideo'
    | 'waitingCgLeadIn'
    | 'choosing'
    | 'finished'
    | 'runtimeError';
  sceneId: string;
  nextNodeIndex: number;
  backgroundAssetId: string | null;
  backgroundScalePercent: number;
  bgmAssetId: string | null;
  bgmSequence: number;
  dialogueSequence: number;
  /** Monotonic event id shared by every non-null character action. */
  characterEffectSequence: number;
  videoAssetId: string | null;
  videoSequence: number;
  cgAssetId: string | null;
  cgLeadInMs: number;
  cgSequence: number;
  characters: RuntimeCharacterState[];
  dialogue: DialogueNode | null;
  choices: ChoiceOption[];
  variables: RuntimeVariables;
  loopStack: RuntimeLoopFrame[];
  errorCode?: RuntimeErrorCode;
  errorMessage?: string;
};

type IfControl = {
  ifIndex: number;
  elseIndex: number | null;
  endIndex: number;
};

type RepeatControl = {
  repeatIndex: number;
  endIndex: number;
};

type CgControl = {
  displayIndex: number;
  endIndex: number;
};

export type SceneControlFlow = {
  ifByStart: ReadonlyMap<number, IfControl>;
  endByElse: ReadonlyMap<number, number>;
  repeatByStart: ReadonlyMap<number, RepeatControl>;
  repeatByEnd: ReadonlyMap<number, RepeatControl>;
  cgByStart: ReadonlyMap<number, CgControl>;
  cgByEnd: ReadonlyMap<number, CgControl>;
};

type OpenIf = {
  kind: 'if';
  id: string;
  index: number;
  elseIndex: number | null;
};

type OpenRepeat = {
  kind: 'repeat';
  id: string;
  index: number;
};

type OpenCg = {
  kind: 'cg';
  id: string;
  index: number;
};

type OpenControl = OpenIf | OpenRepeat | OpenCg;

const controlFlowCache = new WeakMap<readonly SceneNode[], SceneControlFlow | string>();
const variableBudgetCache = new WeakMap<ProjectDocument, {
  scenes: ProjectDocument['scenes'];
  error: string | null;
}>();

export function compileSceneControlFlow(
  nodes: readonly SceneNode[],
): SceneControlFlow | string {
  const ifByStart = new Map<number, IfControl>();
  const endByElse = new Map<number, number>();
  const repeatByStart = new Map<number, RepeatControl>();
  const repeatByEnd = new Map<number, RepeatControl>();
  const cgByStart = new Map<number, CgControl>();
  const cgByEnd = new Map<number, CgControl>();
  const stack: OpenControl[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    const open = stack.at(-1);
    if (
      open?.kind === 'cg' &&
      node.type !== 'dialogue' &&
      node.type !== 'cgEndDisplay'
    ) {
      return `CG 显示节点 ${open.id} 内只能放置对白节点`;
    }
    if (node.type === 'variableSet') {
      if (!isLogicVariableName(node.variableName) || !isLogicValue(node.value)) {
        return `变量赋值节点 ${node.id} 无效`;
      }
      continue;
    }
    if (node.type === 'variableChange') {
      if (!isLogicVariableName(node.variableName) || !Number.isFinite(node.amount)) {
        return `变量增减节点 ${node.id} 无效`;
      }
      continue;
    }
    if (node.type === 'logicIf') {
      if (!isLogicCondition(node.condition)) {
        return `条件节点 ${node.id} 无效`;
      }
      if (stack.length >= MAX_LOGIC_NESTING_DEPTH) {
        return `逻辑嵌套不能超过 ${MAX_LOGIC_NESTING_DEPTH} 层`;
      }
      stack.push({ kind: 'if', id: node.id, index, elseIndex: null });
      continue;
    }
    if (node.type === 'logicElse') {
      const open = stack.at(-1);
      if (
        open?.kind !== 'if' ||
        open.id !== node.ifNodeId ||
        open.elseIndex !== null
      ) {
        return `否则节点 ${node.id} 没有匹配的条件节点`;
      }
      open.elseIndex = index;
      continue;
    }
    if (node.type === 'logicEndIf') {
      const open = stack.at(-1);
      if (open?.kind !== 'if' || open.id !== node.ifNodeId) {
        return `条件结束节点 ${node.id} 没有匹配的条件节点`;
      }
      if (open.elseIndex === null) {
        return `条件节点 ${open.id} 缺少否则节点`;
      }
      stack.pop();
      ifByStart.set(open.index, {
        ifIndex: open.index,
        elseIndex: open.elseIndex,
        endIndex: index,
      });
      if (open.elseIndex !== null) {
        endByElse.set(open.elseIndex, index);
      }
      continue;
    }
    if (node.type === 'logicRepeat') {
      if (
        !Number.isSafeInteger(node.count) ||
        node.count < 1 ||
        node.count > MAX_REPEAT_COUNT
      ) {
        return `重复节点 ${node.id} 的次数必须是 1 到 ${MAX_REPEAT_COUNT} 的整数`;
      }
      if (stack.length >= MAX_LOGIC_NESTING_DEPTH) {
        return `逻辑嵌套不能超过 ${MAX_LOGIC_NESTING_DEPTH} 层`;
      }
      stack.push({ kind: 'repeat', id: node.id, index });
      continue;
    }
    if (node.type === 'logicEndRepeat') {
      const open = stack.at(-1);
      if (open?.kind !== 'repeat' || open.id !== node.repeatNodeId) {
        return `重复结束节点 ${node.id} 没有匹配的重复节点`;
      }
      stack.pop();
      const control = { repeatIndex: open.index, endIndex: index };
      repeatByStart.set(open.index, control);
      repeatByEnd.set(index, control);
      continue;
    }
    if (node.type === 'cgDisplay') {
      if (
        typeof node.assetId !== 'string' ||
        node.assetId.length === 0 ||
        node.assetId.length > 256 ||
        node.assetId.includes('\0') ||
        !Number.isSafeInteger(node.leadInMs) ||
        node.leadInMs < 0 ||
        node.leadInMs > MAX_CG_LEAD_IN_MS
      ) {
        return `CG 显示节点 ${node.id} 无效`;
      }
      stack.push({ kind: 'cg', id: node.id, index });
      continue;
    }
    if (node.type === 'cgEndDisplay') {
      const openCg = stack.at(-1);
      if (openCg?.kind !== 'cg' || openCg.id !== node.cgDisplayNodeId) {
        return `CG 结束节点 ${node.id} 没有匹配的 CG 显示节点`;
      }
      stack.pop();
      const control = { displayIndex: openCg.index, endIndex: index };
      cgByStart.set(openCg.index, control);
      cgByEnd.set(index, control);
    }
  }

  if (stack.length > 0) {
    const dangling = stack.at(-1)!;
    return dangling.kind === 'cg'
      ? `CG 显示节点 ${dangling.id} 缺少结束节点`
      : `逻辑节点 ${dangling.id} 缺少结束节点`;
  }
  return {
    ifByStart,
    endByElse,
    repeatByStart,
    repeatByEnd,
    cgByStart,
    cgByEnd,
  };
}

export function validateSceneControlFlow(
  nodes: readonly SceneNode[],
): string | null {
  const compiled = compileSceneControlFlow(nodes);
  return typeof compiled === 'string' ? compiled : null;
}

function cachedSceneControlFlow(nodes: readonly SceneNode[]): SceneControlFlow | string {
  const cached = controlFlowCache.get(nodes);
  if (cached !== undefined) {
    return cached;
  }
  const compiled = compileSceneControlFlow(nodes);
  controlFlowCache.set(nodes, compiled);
  return compiled;
}

function cachedVariableBudgetError(project: ProjectDocument): string | null {
  const cached = variableBudgetCache.get(project);
  if (cached?.scenes === project.scenes) {
    return cached.error;
  }
  const error = validateProjectLogicVariableBudget(project);
  variableBudgetCache.set(project, { scenes: project.scenes, error });
  return error;
}

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

function runtimeError(
  current: Omit<
    GameRuntime,
    'status' | 'dialogue' | 'choices' | 'videoAssetId' | 'errorCode' | 'errorMessage'
  >,
  errorMessage: string,
  errorCode?: RuntimeErrorCode,
): GameRuntime {
  return {
    ...current,
    status: 'runtimeError',
    videoAssetId: null,
    dialogue: null,
    choices: [],
    ...(errorCode === undefined ? {} : { errorCode }),
    errorMessage,
  };
}

const ENGLISH_LOGIC_ERRORS: Readonly<Record<RuntimeErrorCode, string>> = {
  logicInvalidStructure: 'The story control block structure is invalid.',
  logicComparisonType: 'Ordering comparisons can only be used with numbers.',
  logicVariableType: 'This variable is not numeric and cannot be changed.',
  logicVariableOverflow: 'A variable calculation exceeded the supported range.',
  logicStepLimit: 'Automatic execution was stopped to prevent the game from freezing.',
  logicLoopState: 'The saved loop state does not match the current story.',
  logicVariableBudget: 'This project uses too many story variables.',
  characterEffectInvalid: 'The character effect configuration is invalid.',
  imageScaleInvalid: 'The image scale configuration is invalid.',
};

export function getLocalizedRuntimeErrorMessage(
  runtime: Pick<GameRuntime, 'errorCode' | 'errorMessage'>,
  locale: 'zh-CN' | 'en-US',
  fallback: string,
): string {
  if (locale === 'zh-CN') {
    return runtime.errorMessage ?? fallback;
  }
  return runtime.errorCode === undefined
    ? fallback
    : ENGLISH_LOGIC_ERRORS[runtime.errorCode];
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

function resolveOperand(
  operand: LogicOperand,
  variables: RuntimeVariables,
): LogicValue {
  if (operand.kind === 'literal') {
    return operand.value;
  }
  // Blockly-style variables are created lazily. Their deterministic initial
  // value is numeric zero until the author explicitly assigns another value.
  return Object.hasOwn(variables, operand.name) ? variables[operand.name]! : 0;
}

function evaluateCondition(
  condition: LogicCondition,
  variables: RuntimeVariables,
): boolean | string {
  const left = resolveOperand(condition.left, variables);
  const right = resolveOperand(condition.right, variables);
  if (condition.operator === 'eq') {
    return typeof left === typeof right && left === right;
  }
  if (condition.operator === 'neq') {
    return typeof left !== typeof right || left !== right;
  }
  if (typeof left !== 'number' || typeof right !== 'number') {
    return '大小比较只能用于数值';
  }
  switch (condition.operator) {
    case 'gt': return left > right;
    case 'gte': return left >= right;
    case 'lt': return left < right;
    case 'lte': return left <= right;
  }
}

type ExecutionFingerprint = {
  sceneIds: Map<string, number>;
  variableNames: Map<string, number>;
  variableValues: Map<LogicValue, number>;
  variableStates: Map<string, number>;
};

function internFingerprintValue<T>(
  values: Map<T, number>,
  value: T,
): number {
  const existing = values.get(value);
  if (existing !== undefined) {
    return existing;
  }
  const token = values.size;
  values.set(value, token);
  return token;
}

function variableStateToken(
  variables: RuntimeVariables,
  fingerprint: ExecutionFingerprint,
): number {
  // Values can contain 4 KiB strings. Intern each primitive once, then retain
  // only small integer pairs for distinct variable states. This keeps the
  // cycle detector bounded by the fixed variable-count limit instead of
  // copying the complete payload into every visited-state entry.
  const compactState = Object.keys(variables)
    .sort()
    .map((name) => `${
      internFingerprintValue(fingerprint.variableNames, name)
    }:${
      internFingerprintValue(fingerprint.variableValues, variables[name]!)
    }`)
    .join(',');
  return internFingerprintValue(fingerprint.variableStates, compactState);
}

function executionSignature(
  sceneId: string,
  index: number,
  variables: RuntimeVariables,
  loopStack: readonly RuntimeLoopFrame[],
  fingerprint: ExecutionFingerprint,
): string {
  const sceneToken = internFingerprintValue(fingerprint.sceneIds, sceneId);
  const variablesToken = variableStateToken(variables, fingerprint);
  const loops = loopStack.map((frame) => [
    frame.repeatNodeIndex,
    frame.endNodeIndex,
    frame.remainingIterations,
  ].join(':')).join(',');
  return `${sceneToken}|${index}|${variablesToken}|${loops}`;
}

export function advanceGame(
  project: ProjectDocument,
  current: GameRuntime,
): GameRuntime {
  if (
    current.status === 'choosing' ||
    current.status === 'waitingCgLeadIn' ||
    current.status === 'finished' ||
    current.status === 'runtimeError'
  ) {
    return current;
  }

  const variableBudgetError = cachedVariableBudgetError(project);
  if (variableBudgetError !== null) {
    return runtimeError({
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
      characters: current.characters,
      variables: current.variables ?? {},
      loopStack: current.loopStack ?? [],
    }, variableBudgetError, 'logicVariableBudget');
  }

  const charactersByLayer = new Map(
    current.characters.map((character) => [
      character.layer,
      character.effect === null ? character : { ...character, effect: null },
    ]),
  );
  let backgroundAssetId = current.backgroundAssetId;
  let backgroundScalePercent = current.backgroundScalePercent;
  let bgmAssetId = current.bgmAssetId;
  let bgmSequence = current.bgmSequence;
  const dialogueSequence = current.dialogueSequence;
  let characterEffectSequence = current.characterEffectSequence;
  let videoSequence = current.videoSequence;
  let cgAssetId = current.cgAssetId;
  let cgLeadInMs = current.cgLeadInMs;
  let cgSequence = current.cgSequence;
  let sceneId = current.sceneId;
  let index = current.nextNodeIndex;
  let variables: RuntimeVariables = { ...(current.variables ?? {}) };
  let loopStack = [...(current.loopStack ?? [])];
  const visitedStates = new Set<string>();
  const executionFingerprint: ExecutionFingerprint = {
    sceneIds: new Map(),
    variableNames: new Map(),
    variableValues: new Map(),
    variableStates: new Map(),
  };
  let automaticSteps = 0;

  const error = (
    message: string,
    code?: RuntimeErrorCode,
  ): GameRuntime => runtimeError({
    sceneId,
    nextNodeIndex: index,
    backgroundAssetId,
    backgroundScalePercent,
    bgmAssetId,
    bgmSequence,
    dialogueSequence,
    characterEffectSequence,
    videoSequence,
    cgAssetId,
    cgLeadInMs,
    cgSequence,
    characters: orderedCharacters(charactersByLayer),
    variables,
    loopStack,
  }, message, code);

  for (;;) {
    automaticSteps += 1;
    if (automaticSteps > MAX_AUTOMATIC_STEPS_PER_ADVANCE) {
      return error(
        '自动执行步骤过多，已停止以避免程序卡死',
        'logicStepLimit',
      );
    }

    const scene = project.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return error('跳转的目标场景不存在');
    }
    if (
      !isImageScalePercent(scene.backgroundScalePercent) ||
      (
        scene.backgroundAssetId === null &&
        scene.backgroundScalePercent !== DEFAULT_IMAGE_SCALE_PERCENT
      )
    ) {
      return error(
        `场景 ${scene.id} 的初始背景缩放无效`,
        'imageScaleInvalid',
      );
    }
    const controlFlow = cachedSceneControlFlow(scene.nodes);
    if (typeof controlFlow === 'string') {
      return error(controlFlow, 'logicInvalidStructure');
    }
    if (index >= scene.nodes.length) {
      if (loopStack.length > 0) {
        return error('重复执行状态与当前场景不一致', 'logicLoopState');
      }
      return {
        status: 'finished',
        sceneId,
        nextNodeIndex: scene.nodes.length,
        backgroundAssetId,
        backgroundScalePercent,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        characterEffectSequence,
        videoAssetId: null,
        videoSequence,
        cgAssetId: null,
        cgLeadInMs: 0,
        cgSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: [],
        variables,
        loopStack,
      };
    }

    const signature = executionSignature(
      sceneId,
      index,
      variables,
      loopStack,
      executionFingerprint,
    );
    if (visitedStates.has(signature)) {
      return error('检测到没有对白或可选项可停留的场景跳转循环');
    }
    visitedStates.add(signature);

    const nodeIndex = index;
    const node = scene.nodes[nodeIndex]!;
    index += 1;
    if (node.type === 'background') {
      if (
        !isImageScalePercent(node.scalePercent) ||
        (node.assetId === null && node.scalePercent !== DEFAULT_IMAGE_SCALE_PERCENT)
      ) {
        return error(
          `背景节点 ${node.id} 的图片缩放无效`,
          'imageScaleInvalid',
        );
      }
      backgroundAssetId = node.assetId;
      backgroundScalePercent = node.assetId === null
        ? DEFAULT_IMAGE_SCALE_PERCENT
        : node.scalePercent;
      continue;
    }
    if (node.type === 'character') {
      if (
        !isImageScalePercent(node.scalePercent) ||
        (node.assetId === null && node.scalePercent !== DEFAULT_IMAGE_SCALE_PERCENT)
      ) {
        return error(
          `立绘节点 ${node.id} 的图片缩放无效`,
          'imageScaleInvalid',
        );
      }
      if (node.assetId === null) {
        if (node.effect !== null) {
          return error(
            `清除立绘节点 ${node.id} 不能包含人物特效`,
            'characterEffectInvalid',
          );
        }
        charactersByLayer.delete(node.layer);
      } else {
        if (node.effect !== null && !isCharacterEffect(node.effect)) {
          return error(
            `立绘节点 ${node.id} 的人物特效无效`,
            'characterEffectInvalid',
          );
        }
        if (characterEffectSequence >= Number.MAX_SAFE_INTEGER) {
          return error(
            '人物特效事件序号超出支持范围，已停止以避免动画状态冲突',
            'characterEffectInvalid',
          );
        }
        characterEffectSequence += 1;
        charactersByLayer.set(node.layer, {
          nodeId: node.id,
          assetId: node.assetId,
          slot: node.slot,
          layer: node.layer,
          position: node.position,
          scalePercent: node.scalePercent,
          opacity: node.effect?.type === 'fadeOut' ? 0 : 1,
          effect: node.effect,
          effectSequence: characterEffectSequence,
        });
      }
      continue;
    }
    if (node.type === 'bgm') {
      bgmAssetId = node.assetId;
      bgmSequence += 1;
      continue;
    }
    if (node.type === 'variableSet') {
      variables = { ...variables, [node.variableName]: node.value };
      continue;
    }
    if (node.type === 'variableChange') {
      const previous = Object.hasOwn(variables, node.variableName)
        ? variables[node.variableName]!
        : 0;
      if (typeof previous !== 'number') {
        return error(
          `变量“${node.variableName}”不是数值，无法增减`,
          'logicVariableType',
        );
      }
      const next = previous + node.amount;
      if (!Number.isFinite(next)) {
        return error(
          `变量“${node.variableName}”的计算结果超出范围`,
          'logicVariableOverflow',
        );
      }
      variables = { ...variables, [node.variableName]: next };
      continue;
    }
    if (node.type === 'logicIf') {
      const control = controlFlow.ifByStart.get(nodeIndex);
      if (!control) {
        return error(`条件节点 ${node.id} 缺少结束节点`, 'logicInvalidStructure');
      }
      const result = evaluateCondition(node.condition, variables);
      if (typeof result === 'string') {
        return error(result, 'logicComparisonType');
      }
      if (!result) {
        index = control.elseIndex === null
          ? control.endIndex + 1
          : control.elseIndex + 1;
      }
      continue;
    }
    if (node.type === 'logicElse') {
      const endIndex = controlFlow.endByElse.get(nodeIndex);
      if (endIndex === undefined) {
        return error(`否则节点 ${node.id} 缺少结束节点`, 'logicInvalidStructure');
      }
      index = endIndex + 1;
      continue;
    }
    if (node.type === 'logicEndIf') {
      continue;
    }
    if (node.type === 'logicRepeat') {
      const control = controlFlow.repeatByStart.get(nodeIndex);
      if (!control) {
        return error(`重复节点 ${node.id} 缺少结束节点`, 'logicInvalidStructure');
      }
      loopStack = [...loopStack, {
        repeatNodeId: node.id,
        repeatNodeIndex: nodeIndex,
        endNodeIndex: control.endIndex,
        remainingIterations: node.count,
      }];
      continue;
    }
    if (node.type === 'logicEndRepeat') {
      const frame = loopStack.at(-1);
      const control = controlFlow.repeatByEnd.get(nodeIndex);
      if (
        !frame ||
        !control ||
        frame.repeatNodeId !== node.repeatNodeId ||
        frame.repeatNodeIndex !== control.repeatIndex ||
        frame.endNodeIndex !== control.endIndex
      ) {
        return error('重复执行状态与当前节点不一致', 'logicLoopState');
      }
      if (frame.remainingIterations > 1) {
        loopStack = [
          ...loopStack.slice(0, -1),
          { ...frame, remainingIterations: frame.remainingIterations - 1 },
        ];
        index = frame.repeatNodeIndex + 1;
      } else {
        loopStack = loopStack.slice(0, -1);
      }
      continue;
    }
    if (node.type === 'cgDisplay') {
      if (!controlFlow.cgByStart.has(nodeIndex)) {
        return error(
          `CG 显示节点 ${node.id} 缺少结束节点`,
          'logicInvalidStructure',
        );
      }
      cgAssetId = node.assetId;
      cgLeadInMs = node.leadInMs;
      cgSequence += 1;
      return {
        status: 'waitingCgLeadIn',
        sceneId,
        nextNodeIndex: index,
        backgroundAssetId,
        backgroundScalePercent,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        characterEffectSequence,
        videoAssetId: null,
        videoSequence,
        cgAssetId,
        cgLeadInMs,
        cgSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: [],
        variables,
        loopStack,
      };
    }
    if (node.type === 'cgEndDisplay') {
      if (!controlFlow.cgByEnd.has(nodeIndex)) {
        return error(
          `CG 结束节点 ${node.id} 没有匹配的 CG 显示节点`,
          'logicInvalidStructure',
        );
      }
      cgAssetId = null;
      cgLeadInMs = 0;
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
        backgroundScalePercent,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        characterEffectSequence,
        videoAssetId: node.assetId,
        videoSequence,
        cgAssetId,
        cgLeadInMs,
        cgSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: [],
        variables,
        loopStack,
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
        backgroundScalePercent,
        bgmAssetId,
        bgmSequence,
        dialogueSequence,
        characterEffectSequence,
        videoAssetId: null,
        videoSequence,
        cgAssetId,
        cgLeadInMs,
        cgSequence,
        characters: orderedCharacters(charactersByLayer),
        dialogue: null,
        choices: node.options,
        variables,
        loopStack,
      };
    }
    if (node.type === 'sceneJump') {
      const target = project.scenes.find(
        (candidate) => candidate.id === node.targetSceneId,
      );
      if (!target) {
        return error('跳转的目标场景不存在');
      }
      sceneId = target.id;
      index = 0;
      backgroundAssetId = target.backgroundAssetId;
      backgroundScalePercent = target.backgroundScalePercent;
      charactersByLayer.clear();
      loopStack = [];
      cgAssetId = null;
      cgLeadInMs = 0;
      continue;
    }

    return {
      status: 'playing',
      sceneId,
      nextNodeIndex: index,
      backgroundAssetId,
      backgroundScalePercent,
      bgmAssetId,
      bgmSequence,
      dialogueSequence: dialogueSequence + 1,
      characterEffectSequence,
      videoAssetId: null,
      videoSequence,
      cgAssetId,
      cgLeadInMs,
      cgSequence,
      characters: orderedCharacters(charactersByLayer),
      dialogue: node,
      choices: [],
      variables,
      loopStack,
    };
  }
}

export function completeCgLeadIn(
  project: ProjectDocument,
  current: GameRuntime,
): GameRuntime {
  if (current.status !== 'waitingCgLeadIn') {
    return current;
  }
  const scene = project.scenes.find(
    (candidate) => candidate.id === current.sceneId,
  );
  const displayIndex = current.nextNodeIndex - 1;
  const node = scene?.nodes[displayIndex];
  const controlFlow = scene === undefined
    ? null
    : cachedSceneControlFlow(scene.nodes);
  if (
    node?.type !== 'cgDisplay' ||
    typeof controlFlow === 'string' ||
    controlFlow === null ||
    !controlFlow.cgByStart.has(displayIndex) ||
    current.cgAssetId !== node.assetId ||
    current.cgLeadInMs !== node.leadInMs ||
    !Number.isSafeInteger(current.cgSequence) ||
    current.cgSequence < 1
  ) {
    return runtimeError({
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
      characters: current.characters,
      variables: current.variables,
      loopStack: current.loopStack,
    }, 'CG 显示等待状态与当前场景不一致', 'logicInvalidStructure');
  }
  return advanceGame(project, {
    ...current,
    status: 'playing',
    cgLeadInMs: 0,
  });
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
    backgroundScalePercent: target.backgroundScalePercent,
    bgmAssetId: current.bgmAssetId,
    bgmSequence: current.bgmSequence,
    dialogueSequence: current.dialogueSequence,
    characterEffectSequence: current.characterEffectSequence,
    videoAssetId: null,
    videoSequence: current.videoSequence,
    cgAssetId: null,
    cgLeadInMs: 0,
    cgSequence: current.cgSequence,
    characters: [],
    dialogue: null,
    choices: [],
    variables: { ...current.variables },
    loopStack: [],
  });
}

export function startGameAtScene(
  project: ProjectDocument,
  sceneId: string,
): GameRuntime | null {
  const scene = project.scenes.find(
    (candidate) => candidate.id === sceneId,
  );
  if (!scene) {
    return null;
  }

  return advanceGame(project, {
    status: 'playing',
    sceneId: scene.id,
    nextNodeIndex: 0,
    backgroundAssetId: scene.backgroundAssetId,
    backgroundScalePercent: scene.backgroundScalePercent,
    bgmAssetId: null,
    bgmSequence: 0,
    dialogueSequence: 0,
    characterEffectSequence: 0,
    videoAssetId: null,
    videoSequence: 0,
    cgAssetId: null,
    cgLeadInMs: 0,
    cgSequence: 0,
    characters: [],
    dialogue: null,
    choices: [],
    variables: {},
    loopStack: [],
  });
}

// Formal game startup always honors the authored entry scene. Editor preview
// uses startGameAtScene instead so selecting another scene never rewrites or
// weakens the project's real entry-point contract.
export function startGame(project: ProjectDocument): GameRuntime | null {
  return startGameAtScene(project, project.entrySceneId);
}
