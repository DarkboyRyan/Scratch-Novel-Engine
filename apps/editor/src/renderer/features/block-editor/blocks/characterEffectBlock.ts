/**
 * 文件主要作用：注册震动、跳跃、淡入淡出、滑入、呼吸和闪烁特效积木。
 * 包含实现：`CHARACTER_EFFECT_CONNECTION_TYPE`、`CHARACTER_EFFECT_BLOCK_TYPES`、`CharacterEffectBlockType`、`CHARACTER_EFFECT_FIELDS`、`CharacterEffectConnectionChecker`、`isCharacterEffectBlockType` 等 14 项。
 */

import * as Blockly from 'blockly';

import type {
  CharacterEffect,
  CharacterEffectDirection,
  CharacterEffectIntensity,
} from '../../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../../i18n/editorLocalization';

export const CHARACTER_EFFECT_CONNECTION_TYPE = 'VN_CHARACTER_EFFECT';

export const CHARACTER_EFFECT_BLOCK_TYPES = {
  shake: 'vn_character_effect_shake',
  jump: 'vn_character_effect_jump',
  fadeIn: 'vn_character_effect_fade_in',
  fadeOut: 'vn_character_effect_fade_out',
  slideIn: 'vn_character_effect_slide_in',
  breathe: 'vn_character_effect_breathe',
  flash: 'vn_character_effect_flash',
} as const;

export type CharacterEffectBlockType =
  typeof CHARACTER_EFFECT_BLOCK_TYPES[keyof typeof CHARACTER_EFFECT_BLOCK_TYPES];

export const CHARACTER_EFFECT_FIELDS = {
  durationSeconds: 'DURATION_SECONDS',
  intensity: 'INTENSITY',
  direction: 'DIRECTION',
} as const;

const LABEL_FIELDS = {
  name: 'VN_LABEL_EFFECT_NAME',
  intensity: 'VN_LABEL_EFFECT_INTENSITY',
  direction: 'VN_LABEL_EFFECT_DIRECTION',
  duration: 'VN_LABEL_EFFECT_DURATION',
  seconds: 'VN_LABEL_EFFECT_SECONDS',
} as const;

const OWNER_DATA_PREFIX = 'vn-character-effect-owner:';

const EFFECT_TYPE_BY_BLOCK = new Map<CharacterEffectBlockType, CharacterEffect['type']>(
  Object.entries(CHARACTER_EFFECT_BLOCK_TYPES).map(([type, blockType]) => [
    blockType,
    type as CharacterEffect['type'],
  ]),
);

const DEFAULT_DURATION_SECONDS: Record<CharacterEffect['type'], number> = {
  shake: 0.5,
  jump: 0.6,
  fadeIn: 0.5,
  fadeOut: 0.5,
  slideIn: 0.6,
  breathe: 1.2,
  flash: 0.45,
};

// 剧情上下连接使用较小的全局吸附半径，避免长链提前吸附；但人物
// 特效的胶囊形输出口在 Zelos 中需要落到右侧凹槽内部才算对齐。
// 单独放大这一类积木的半径，让视觉上已经重叠的特效可靠吸附，
// 同时不改变对白/逻辑积木的拖放手感。
const CHARACTER_EFFECT_SNAP_RADIUS = 48;

class CharacterEffectBlockDragStrategy extends Blockly.dragging.BlockDragStrategy {
  protected override getSearchRadius(): number {
    return Math.max(super.getSearchRadius(), CHARACTER_EFFECT_SNAP_RADIUS);
  }
}

function isCharacterEffectOutput(
  connection: Blockly.RenderedConnection,
): boolean {
  const block = connection.getSourceBlock();
  return isCharacterEffectBlockType(block.type) &&
    block.outputConnection === connection;
}

function isCharacterEffectInput(
  connection: Blockly.RenderedConnection,
): boolean {
  const block = connection.getSourceBlock();
  return block.type === 'vn_character' &&
    block.getInput('EFFECT')?.connection === connection;
}

/**
 * A value input normally replaces its current child when another value block is
 * dropped on it. That replacement emits the displaced effect's detach event
 * before the incoming effect's attach event, which can persist an unintended
 * clear while the backend-first mutation latch is active. Occupied portrait
 * effect inputs are therefore not drag targets; users remove the current effect
 * first, then attach the replacement explicitly.
 */
export class CharacterEffectConnectionChecker extends Blockly.ConnectionChecker {
  override doDragChecks(
    first: Blockly.RenderedConnection,
    second: Blockly.RenderedConnection,
    distance: number,
  ): boolean {
    const output = isCharacterEffectOutput(first)
      ? first
      : isCharacterEffectOutput(second)
        ? second
        : null;
    const input = isCharacterEffectInput(first)
      ? first
      : isCharacterEffectInput(second)
        ? second
        : null;
    if (
      output &&
      input?.isConnected() &&
      input.targetConnection !== output
    ) {
      return false;
    }
    return super.doDragChecks(first, second, distance);
  }
}

let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

function intensityOptions(labels: EditorLabels): Blockly.MenuOption[] {
  return [
    [labels.blockly.effectSubtle, 'subtle'],
    [labels.blockly.effectNormal, 'normal'],
    [labels.blockly.effectStrong, 'strong'],
  ];
}

function directionOptions(labels: EditorLabels): Blockly.MenuOption[] {
  return [
    [labels.blockly.effectFromLeft, 'left'],
    [labels.blockly.effectFromRight, 'right'],
    [labels.blockly.effectFromTop, 'up'],
    [labels.blockly.effectFromBottom, 'down'],
  ];
}

function effectName(
  type: CharacterEffect['type'],
  labels: EditorLabels,
): string {
  switch (type) {
    case 'shake':
      return labels.blockly.effectShake;
    case 'jump':
      return labels.blockly.effectJump;
    case 'fadeIn':
      return labels.blockly.effectFadeIn;
    case 'fadeOut':
      return labels.blockly.effectFadeOut;
    case 'slideIn':
      return labels.blockly.effectSlideIn;
    case 'breathe':
      return labels.blockly.effectBreathe;
    case 'flash':
      return labels.blockly.effectFlash;
  }
}

function effectTooltip(
  type: CharacterEffect['type'],
  labels: EditorLabels,
): string {
  switch (type) {
    case 'shake':
      return labels.blockly.effectShakeTooltip;
    case 'jump':
      return labels.blockly.effectJumpTooltip;
    case 'fadeIn':
      return labels.blockly.effectFadeInTooltip;
    case 'fadeOut':
      return labels.blockly.effectFadeOutTooltip;
    case 'slideIn':
      return labels.blockly.effectSlideInTooltip;
    case 'breathe':
      return labels.blockly.effectBreatheTooltip;
    case 'flash':
      return labels.blockly.effectFlashTooltip;
  }
}

function hasIntensity(
  type: CharacterEffect['type'],
): type is 'shake' | 'jump' | 'slideIn' | 'breathe' | 'flash' {
  return type !== 'fadeIn' && type !== 'fadeOut';
}

export function isCharacterEffectBlockType(
  type: string,
): type is CharacterEffectBlockType {
  return EFFECT_TYPE_BY_BLOCK.has(type as CharacterEffectBlockType);
}

export function characterEffectBlockType(
  effect: CharacterEffect,
): CharacterEffectBlockType {
  return CHARACTER_EFFECT_BLOCK_TYPES[effect.type];
}

export function readCharacterEffectBlock(
  block: Blockly.Block,
): CharacterEffect | null {
  const type = EFFECT_TYPE_BY_BLOCK.get(block.type as CharacterEffectBlockType);
  if (!type) {
    return null;
  }
  const seconds = Number(
    block.getFieldValue(CHARACTER_EFFECT_FIELDS.durationSeconds),
  );
  const durationMs = Math.round(seconds * 1000);
  if (
    !Number.isFinite(seconds) ||
    !Number.isSafeInteger(durationMs) ||
    durationMs < 100 ||
    durationMs > 10_000
  ) {
    return null;
  }

  if (type === 'fadeIn' || type === 'fadeOut') {
    return { type, durationMs };
  }

  const intensity = String(
    block.getFieldValue(CHARACTER_EFFECT_FIELDS.intensity),
  ) as CharacterEffectIntensity;
  if (
    intensity !== 'subtle' &&
    intensity !== 'normal' &&
    intensity !== 'strong'
  ) {
    return null;
  }
  if (type !== 'slideIn') {
    return { type, durationMs, intensity };
  }

  const direction = String(
    block.getFieldValue(CHARACTER_EFFECT_FIELDS.direction),
  ) as CharacterEffectDirection;
  return direction === 'left' ||
    direction === 'right' ||
    direction === 'up' ||
    direction === 'down'
    ? { type, durationMs, intensity, direction }
    : null;
}

export function setCharacterEffectBlock(
  block: Blockly.Block,
  effect: CharacterEffect,
): void {
  block.setFieldValue(
    String(effect.durationMs / 1000),
    CHARACTER_EFFECT_FIELDS.durationSeconds,
  );
  if ('intensity' in effect) {
    block.setFieldValue(
      effect.intensity,
      CHARACTER_EFFECT_FIELDS.intensity,
    );
  }
  if (effect.type === 'slideIn') {
    block.setFieldValue(
      effect.direction,
      CHARACTER_EFFECT_FIELDS.direction,
    );
  }
}

export function setCharacterEffectOwner(
  block: Blockly.Block,
  characterNodeId: string,
): void {
  block.data = `${OWNER_DATA_PREFIX}${characterNodeId}`;
}

export function getCharacterEffectOwner(
  block: Blockly.Block,
): string | null {
  return block.data?.startsWith(OWNER_DATA_PREFIX)
    ? block.data.slice(OWNER_DATA_PREFIX.length)
    : null;
}

export function formatCharacterEffect(
  effect: CharacterEffect,
  labels: EditorLabels,
): string {
  const duration = effect.durationMs / 1000;
  const seconds = labels.locale === 'en-US'
    ? `${duration} ${labels.blockly.seconds}`
    : `${duration}${labels.blockly.seconds}`;
  if (!('intensity' in effect)) {
    return `${effectName(effect.type, labels)} · ${seconds}`;
  }
  const intensity = effect.intensity === 'subtle'
    ? labels.blockly.effectSubtle
    : effect.intensity === 'strong'
      ? labels.blockly.effectStrong
      : labels.blockly.effectNormal;
  if (effect.type !== 'slideIn') {
    return `${effectName(effect.type, labels)} · ${intensity} · ${seconds}`;
  }
  const direction = effect.direction === 'left'
    ? labels.blockly.effectFromLeft
    : effect.direction === 'right'
      ? labels.blockly.effectFromRight
      : effect.direction === 'up'
        ? labels.blockly.effectFromTop
        : labels.blockly.effectFromBottom;
  return `${effectName(effect.type, labels)} · ${direction} · ${intensity} · ${seconds}`;
}

export function applyCharacterEffectBlockLocalization(
  block: Blockly.Block,
  labels: EditorLabels,
): void {
  currentLabels = labels;
  const type = EFFECT_TYPE_BY_BLOCK.get(block.type as CharacterEffectBlockType);
  if (!type) {
    return;
  }
  block.setFieldValue(effectName(type, labels), LABEL_FIELDS.name);
  block.setFieldValue(labels.blockly.effectDuration, LABEL_FIELDS.duration);
  block.setFieldValue(labels.blockly.seconds, LABEL_FIELDS.seconds);
  if (hasIntensity(type)) {
    block.setFieldValue(labels.blockly.effectIntensity, LABEL_FIELDS.intensity);
    const field = block.getField(CHARACTER_EFFECT_FIELDS.intensity);
    if (field instanceof Blockly.FieldDropdown) {
      const value = String(field.getValue());
      field.setOptions(() => intensityOptions(labels));
      field.setValue(value);
    }
  }
  if (type === 'slideIn') {
    block.setFieldValue(labels.blockly.effectDirection, LABEL_FIELDS.direction);
    const field = block.getField(CHARACTER_EFFECT_FIELDS.direction);
    if (field instanceof Blockly.FieldDropdown) {
      const value = String(field.getValue());
      field.setOptions(() => directionOptions(labels));
      field.setValue(value);
    }
  }
  block.setTooltip(effectTooltip(type, labels));
}

function registerEffectBlock(
  type: CharacterEffect['type'],
  blockType: CharacterEffectBlockType,
): void {
  if (Blockly.Blocks[blockType]) {
    return;
  }
  Blockly.Blocks[blockType] = {
    init(): void {
      const firstRow = this.appendDummyInput()
        .appendField(effectName(type, currentLabels), LABEL_FIELDS.name);
      if (hasIntensity(type)) {
        firstRow
          .appendField(currentLabels.blockly.effectIntensity, LABEL_FIELDS.intensity)
          .appendField(
            new Blockly.FieldDropdown(() => intensityOptions(currentLabels)),
            CHARACTER_EFFECT_FIELDS.intensity,
          );
      }
      if (type === 'slideIn') {
        firstRow
          .appendField(currentLabels.blockly.effectDirection, LABEL_FIELDS.direction)
          .appendField(
            new Blockly.FieldDropdown(() => directionOptions(currentLabels)),
            CHARACTER_EFFECT_FIELDS.direction,
          );
      }
      this.appendDummyInput()
        .appendField(currentLabels.blockly.effectDuration, LABEL_FIELDS.duration)
        .appendField(
          new Blockly.FieldNumber(
            DEFAULT_DURATION_SECONDS[type],
            0.1,
            10,
            0.05,
          ),
          CHARACTER_EFFECT_FIELDS.durationSeconds,
        )
        .appendField(currentLabels.blockly.seconds, LABEL_FIELDS.seconds);
      this.setOutput(true, CHARACTER_EFFECT_CONNECTION_TYPE);
      if (this instanceof Blockly.BlockSvg) {
        this.setDragStrategy(new CharacterEffectBlockDragStrategy(this));
      }
      this.setColour(20);
      this.setTooltip(effectTooltip(type, currentLabels));
      this.setHelpUrl('');
    },
  };
}

export function registerCharacterEffectBlocks(
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;
  for (const [type, blockType] of Object.entries(
    CHARACTER_EFFECT_BLOCK_TYPES,
  ) as [CharacterEffect['type'], CharacterEffectBlockType][]) {
    registerEffectBlock(type, blockType);
  }
}
