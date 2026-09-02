/**
 * 主要作用：把当前 C++ 权威场景纯投影为稳定、可读、不可修改的剧情 DSL。
 * 关键实现：`projectSceneToReadonlyCode`；复用现有逻辑结构解析，不回写或克隆权威数据。
 */

import type {
  AssetDocument,
  CharacterEffect,
  LogicCondition,
  LogicOperand,
  LogicValue,
  ProjectDocument,
  SceneDocument,
  SceneNode,
} from '../../../shared/projectTypes';
import {
  parseLogicStructure,
  type LogicStructureItem,
} from '../block-editor/logicStructure';
import {
  ReadonlyCodeFormatter,
  quoteCodeString,
  type CodeSourceRange,
} from './codeFormatter';

export type CodeProjectionDiagnostic = {
  severity: 'warning' | 'error';
  code: 'missingAsset' | 'assetTypeMismatch' | 'missingScene' | 'invalidStructure';
  message: string;
  sourceId?: string;
  referenceId?: string;
};

export type ReadonlyCodeProjection = {
  source: string;
  sourceRanges: CodeSourceRange[];
  diagnostics: CodeProjectionDiagnostic[];
};

export type ReadonlyCodeProjectionInput = {
  scene: SceneDocument;
  project: Pick<ProjectDocument, 'scenes'>;
  assets: readonly AssetDocument[];
};

type ProjectionContext = {
  formatter: ReadonlyCodeFormatter;
  assetsById: ReadonlyMap<string, AssetDocument>;
  scenesById: ReadonlyMap<string, SceneDocument>;
  diagnostics: CodeProjectionDiagnostic[];
};

const OPERATORS: Record<LogicCondition['operator'], string> = {
  eq: '==',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const LOGICAL_ASSET_DIRECTORIES: Record<AssetDocument['type'], string> = {
  image: 'images',
  audio: 'audio',
  video: 'videos',
};
const UTF8_ENCODER = new TextEncoder();

function formatValue(value: LogicValue): string {
  return typeof value === 'string' ? quoteCodeString(value) : String(value);
}

function formatVariable(name: string): string {
  return /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)
    ? `$${name}`
    : `$[${quoteCodeString(name)}]`;
}

function formatOperand(operand: LogicOperand): string {
  return operand.kind === 'variable'
    ? formatVariable(operand.name)
    : formatValue(operand.value);
}

function formatCondition(condition: LogicCondition): string {
  return `${formatOperand(condition.left)} ${OPERATORS[condition.operator]} ${formatOperand(condition.right)}`;
}

function formatEffect(effect: CharacterEffect): string {
  const duration = `${effect.durationMs}ms`;
  switch (effect.type) {
    case 'fadeIn':
    case 'fadeOut':
      return `${effect.type}(${duration})`;
    case 'slideIn':
      return `${effect.type}(${duration}, ${effect.intensity}, ${effect.direction})`;
    case 'shake':
    case 'jump':
    case 'breathe':
    case 'flash':
      return `${effect.type}(${duration}, ${effect.intensity})`;
  }
}

function escapeLogicalAssetName(displayName: string): string {
  const characters = Array.from(displayName);
  if (characters.length === 0) {
    return '%EMPTY';
  }
  const escaped = characters.map((character, index) => {
    const isInternalSpace = character === ' ' &&
      index > 0 &&
      index < characters.length - 1;
    if (/^[\p{L}\p{N}_.-]$/u.test(character) || isInternalSpace) {
      return character;
    }
    return Array.from(
      UTF8_ENCODER.encode(character),
      (byte) => `%${byte.toString(16).padStart(2, '0').toUpperCase()}`,
    ).join('');
  }).join('');
  return escaped.replace(/^\.+/, (leadingDots) =>
    leadingDots.replaceAll('.', '%2E')
  );
}

function logicalAssetPath(asset: AssetDocument): string {
  return `assets/${LOGICAL_ASSET_DIRECTORIES[asset.type]}/${escapeLogicalAssetName(asset.displayName)}`;
}

function missingLogicalAssetPath(type: AssetDocument['type']): string {
  return `assets/${LOGICAL_ASSET_DIRECTORIES[type]}/%MISSING`;
}

function assetReference(
  assetId: string,
  expectedType: AssetDocument['type'],
  sourceId: string | undefined,
  context: ProjectionContext,
): string {
  const asset = context.assetsById.get(assetId);
  if (!asset) {
    context.diagnostics.push({
      severity: 'warning',
      code: 'missingAsset',
      message: `Asset ${assetId} is not available in the resource library.`,
      sourceId,
      referenceId: assetId,
    });
    return `${expectedType}(${quoteCodeString(
      missingLogicalAssetPath(expectedType),
    )})`;
  }
  if (asset.type !== expectedType) {
    context.diagnostics.push({
      severity: 'warning',
      code: 'assetTypeMismatch',
      message: `Asset ${assetId} is ${asset.type}, but this command expects ${expectedType}.`,
      sourceId,
      referenceId: assetId,
    });
  }
  return `${expectedType}(${quoteCodeString(logicalAssetPath(asset))})`;
}

function sceneReference(
  sceneId: string,
  sourceId: string,
  context: ProjectionContext,
): string {
  const scene = context.scenesById.get(sceneId);
  if (!scene) {
    context.diagnostics.push({
      severity: 'warning',
      code: 'missingScene',
      message: `Scene ${sceneId} is not available in this project.`,
      sourceId,
      referenceId: sceneId,
    });
    return `scene(${quoteCodeString('<missing scene>')})`;
  }
  return `scene(${quoteCodeString(scene.name)})`;
}

function formatDialogue(
  node: Extract<SceneNode, { type: 'dialogue' }>,
  context: ProjectionContext,
): string {
  const arguments_ = [quoteCodeString(node.text)];
  if (node.speaker.length > 0) {
    arguments_.push(`speaker: ${quoteCodeString(node.speaker)}`);
  }
  if (node.voiceAssetId !== null) {
    arguments_.push(`voice: ${assetReference(
      node.voiceAssetId,
      'audio',
      node.id,
      context,
    )}`);
  }
  return `say(${arguments_.join(', ')})`;
}

function formatCharacter(
  node: Extract<SceneNode, { type: 'character' }>,
  context: ProjectionContext,
): string {
  if (node.mode === 'clear') {
    return `clear(layer: ${node.layer})`;
  }

  const subject = node.assetId === null
    ? 'pending'
    : assetReference(node.assetId, 'image', node.id, context);
  const position = node.position === null
    ? node.slot
    : `position(${node.position.x}, ${node.position.y})`;
  const arguments_ = [
    subject,
    `at: ${position}`,
  ];
  if (node.position !== null) {
    arguments_.push(`slot: ${node.slot}`);
  }
  arguments_.push(`layer: ${node.layer}`, `scale: ${node.scalePercent}`);
  if (node.effect !== null) {
    arguments_.push(`effect: ${formatEffect(node.effect)}`);
  }
  return `show(${arguments_.join(', ')})`;
}

function formatLeafNode(node: SceneNode, context: ProjectionContext): string {
  switch (node.type) {
    case 'dialogue':
      return formatDialogue(node, context);
    case 'background':
      return node.assetId === null
        ? 'background(none)'
        : `background(${assetReference(node.assetId, 'image', node.id, context)}, scale: ${node.scalePercent})`;
    case 'character':
      return formatCharacter(node, context);
    case 'sceneJump':
      return `jump(${sceneReference(node.targetSceneId, node.id, context)})`;
    case 'bgm':
      return node.assetId === null
        ? 'bgm(stop)'
        : `bgm(${assetReference(node.assetId, 'audio', node.id, context)})`;
    case 'video':
      return node.assetId === null
        ? 'play(video(pending))'
        : `play(${assetReference(node.assetId, 'video', node.id, context)})`;
    case 'choice':
    case 'logicIf':
    case 'logicRepeat':
    case 'logicElse':
    case 'logicEndIf':
    case 'logicEndRepeat':
    case 'cgDisplay':
    case 'cgEndDisplay':
      throw new Error(`Node ${node.id} must be formatted through its structure.`);
    case 'variableSet':
      return `set(${formatVariable(node.variableName)}, value: ${formatValue(node.value)})`;
    case 'variableChange':
      return `change(${formatVariable(node.variableName)}, amount: ${node.amount})`;
    case 'storyExtension':
      return 'pagebreak()';
  }
}

function formatChoice(
  node: Extract<SceneNode, { type: 'choice' }>,
  context: ProjectionContext,
): void {
  context.formatter.block('choice', () => {
    for (const option of node.options) {
      context.formatter.mark(option.id, 'choiceOption', () => {
        context.formatter.line(
          `option(${quoteCodeString(option.text)}, target: ${sceneReference(
            option.targetSceneId,
            option.id,
            context,
          )})`,
        );
      });
    }
  });
}

function formatItems(
  items: readonly LogicStructureItem[],
  context: ProjectionContext,
): void {
  for (const item of items) {
    context.formatter.mark(item.node.id, 'sceneNode', () => {
      if (item.kind === 'node') {
        if (item.node.type === 'choice') {
          formatChoice(item.node, context);
        } else {
          context.formatter.line(formatLeafNode(item.node, context));
        }
        return;
      }

      if (item.kind === 'if') {
        context.formatter.line(`if (${formatCondition(item.node.condition)}) {`);
        context.formatter.indented(() => formatItems(item.thenItems, context));
        context.formatter.line('} else {');
        context.formatter.indented(() => formatItems(item.elseItems, context));
        context.formatter.line('}');
        return;
      }

      if (item.kind === 'repeat') {
        context.formatter.block(`repeat(${item.node.count})`, () => {
          formatItems(item.bodyItems, context);
        });
        return;
      }

      const reference = assetReference(
        item.node.assetId,
        'image',
        item.node.id,
        context,
      );
      context.formatter.block(
        `cg(${reference}, lead: ${item.node.leadInMs}ms)`,
        () => formatItems(item.bodyItems, context),
      );
    });
  }
}

function projectStructuredScene(
  input: ReadonlyCodeProjectionInput,
  context: ProjectionContext,
  items: readonly LogicStructureItem[],
): void {
  const { scene } = input;
  context.formatter.line('story 1');
  context.formatter.line();
  context.formatter.line(`scene(${quoteCodeString(scene.name)}) {`);
  context.formatter.indented(() => {
    if (scene.backgroundAssetId === null) {
      context.formatter.line('background(none, initial: true)');
    } else {
      context.formatter.line(
        `background(${assetReference(
          scene.backgroundAssetId,
          'image',
          undefined,
          context,
        )}, scale: ${scene.backgroundScalePercent}, initial: true)`,
      );
    }
    if (scene.nodes.length > 0) {
      context.formatter.line();
      formatItems(items, context);
    }
  });
  context.formatter.line('}');
}

function projectInvalidStructureFallback(
  input: ReadonlyCodeProjectionInput,
  context: ProjectionContext,
): void {
  const { scene } = input;
  context.formatter.line('story 1');
  context.formatter.line();
  context.formatter.line(`scene(${quoteCodeString(scene.name)}) {`);
  context.formatter.indented(() => {
    if (scene.backgroundAssetId === null) {
      context.formatter.line('background(none, initial: true)');
    } else {
      context.formatter.line(
        `background(${assetReference(
          scene.backgroundAssetId,
          'image',
          undefined,
          context,
        )}, scale: ${scene.backgroundScalePercent}, initial: true)`,
      );
    }
    context.formatter.line();
    context.formatter.line(
      '// Timeline unavailable: invalid scene structure.',
    );
  });
  context.formatter.line('}');
}

export function projectSceneToReadonlyCode(
  input: ReadonlyCodeProjectionInput,
): ReadonlyCodeProjection {
  const diagnostics: CodeProjectionDiagnostic[] = [];
  const context: ProjectionContext = {
    formatter: new ReadonlyCodeFormatter(),
    assetsById: new Map(input.assets.map((asset) => [asset.id, asset])),
    scenesById: new Map(input.project.scenes.map((scene) => [scene.id, scene])),
    diagnostics,
  };

  let items: LogicStructureItem[];
  try {
    items = parseLogicStructure(input.scene);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push({
      severity: 'error',
      code: 'invalidStructure',
      message,
    });
    projectInvalidStructureFallback(input, context);
    return {
      ...context.formatter.finish(),
      diagnostics,
    };
  }
  projectStructuredScene(input, context, items);

  return {
    ...context.formatter.finish(),
    diagnostics,
  };
}
