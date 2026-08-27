/**
 * 文件主要作用：注册并投影标题界面根积木、背景和音乐积木。
 * 包含实现：`START_SCREEN_ROOT_BLOCK_TYPE`、`START_SCREEN_BACKGROUND_BLOCK_TYPE`、`START_SCREEN_MUSIC_BLOCK_TYPE`、`START_SCREEN_BLOCK_IDS`、`START_SCREEN_BLOCK_FIELDS`、`StartScreenAssetLabels` 等 13 项。
 */

import * as Blockly from 'blockly';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../i18n/editorLocalization';
import { limitAssetFieldDisplay } from '../block-editor/blocks/assetNameField';

export const START_SCREEN_ROOT_BLOCK_TYPE = 'vn_start_screen';
export const START_SCREEN_BACKGROUND_BLOCK_TYPE =
  'vn_start_screen_background';
export const START_SCREEN_MUSIC_BLOCK_TYPE = 'vn_start_screen_music';

export const START_SCREEN_BLOCK_IDS = {
  root: 'vn-editor-start-screen-root',
  background: 'vn-editor-start-screen-background',
  music: 'vn-editor-start-screen-music',
} as const;

export const START_SCREEN_BLOCK_FIELDS = {
  title: 'TITLE',
  backgroundAssetId: 'BACKGROUND_ASSET_ID',
  musicAssetId: 'MUSIC_ASSET_ID',
} as const;

const START_SCREEN_LABEL_FIELDS = {
  title: 'VN_LABEL_START_SCREEN_TITLE',
  contents: 'VN_LABEL_START_SCREEN_CONTENTS',
  background: 'VN_LABEL_START_SCREEN_BACKGROUND',
  music: 'VN_LABEL_START_SCREEN_MUSIC',
} as const;
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

type StartScreenDocument = ProjectDocument['startScreen'];

export type StartScreenAssetLabels = {
  background: string;
  music: string;
};

export type StartScreenAssetOption = [label: string, value: string];

function assetLabel(
  assets: AssetDocument[],
  assetId: string | null,
  expectedType: AssetDocument['type'],
  emptyLabel: string,
  missingLabel: string,
): string {
  if (assetId === null) {
    return emptyLabel;
  }

  return (
    assets.find(
      (asset) => asset.id === assetId && asset.type === expectedType,
    )?.displayName ?? `${missingLabel}（${assetId}）`
  );
}

export function resolveStartScreenAssetLabels(
  startScreen: StartScreenDocument,
  assets: AssetDocument[],
  labels: EditorLabels = currentLabels,
): StartScreenAssetLabels {
  return {
    background: assetLabel(
      assets,
      startScreen.backgroundAssetId,
      'image',
      `${labels.common.none} ${labels.startScreen.backgroundImage}`,
      labels.common.missingImage,
    ),
    music: assetLabel(
      assets,
      startScreen.musicAssetId,
      'audio',
      `${labels.common.none} ${labels.startScreen.backgroundMusic}`,
      labels.common.missingAudio,
    ),
  };
}

function assetOptions(
  assets: AssetDocument[],
  selectedAssetId: string | null,
  expectedType: AssetDocument['type'],
  missingLabel: string,
  labels: EditorLabels,
): StartScreenAssetOption[] {
  const options: StartScreenAssetOption[] = [
    [labels.common.none, ''],
    ...assets
      .filter((asset) => asset.type === expectedType)
      .map((asset): StartScreenAssetOption => [
        asset.displayName,
        asset.id,
      ]),
  ];
  if (
    selectedAssetId !== null &&
    !options.some(([, value]) => value === selectedAssetId)
  ) {
    options.push([
      `${missingLabel}（${selectedAssetId}）`,
      selectedAssetId,
    ]);
  }
  return options;
}

export function createStartScreenBackgroundOptions(
  startScreen: StartScreenDocument,
  assets: AssetDocument[],
  labels: EditorLabels = currentLabels,
): StartScreenAssetOption[] {
  return assetOptions(
    assets,
    startScreen.backgroundAssetId,
    'image',
    labels.common.missingImage,
    labels,
  );
}

export function createStartScreenMusicOptions(
  startScreen: StartScreenDocument,
  assets: AssetDocument[],
  labels: EditorLabels = currentLabels,
): StartScreenAssetOption[] {
  return assetOptions(
    assets,
    startScreen.musicAssetId,
    'audio',
    labels.common.missingAudio,
    labels,
  );
}

function registerRootBlock(): void {
  if (Blockly.Blocks[START_SCREEN_ROOT_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[START_SCREEN_ROOT_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput()
        .appendField(currentLabels.blockly.startScreenTitle, START_SCREEN_LABEL_FIELDS.title)
        .appendField(
          new Blockly.FieldTextInput(currentLabels.blockly.startScreenDefaultTitle),
          START_SCREEN_BLOCK_FIELDS.title,
        );
      this.appendStatementInput('CONTENTS').appendField(currentLabels.blockly.startScreenContents, START_SCREEN_LABEL_FIELDS.contents);
      this.setColour(260);
      this.setTooltip(currentLabels.blockly.startScreenTooltip);
      this.setHelpUrl('');
    },
  };
}

function registerBackgroundBlock(): void {
  if (Blockly.Blocks[START_SCREEN_BACKGROUND_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[START_SCREEN_BACKGROUND_BLOCK_TYPE] = {
    init(): void {
      const assetField = new Blockly.FieldDropdown([
        [currentLabels.common.none, ''],
      ]);
      limitAssetFieldDisplay(assetField);
      this.appendDummyInput()
        .appendField(currentLabels.blockly.startScreenBackground, START_SCREEN_LABEL_FIELDS.background)
        .appendField(
          assetField,
          START_SCREEN_BLOCK_FIELDS.backgroundAssetId,
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(210);
      this.setTooltip(currentLabels.blockly.startScreenBackgroundTooltip);
      this.setHelpUrl('');
    },
  };
}

function registerMusicBlock(): void {
  if (Blockly.Blocks[START_SCREEN_MUSIC_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[START_SCREEN_MUSIC_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput()
        .appendField(currentLabels.blockly.startScreenMusic, START_SCREEN_LABEL_FIELDS.music)
        .appendField(
          new Blockly.FieldDropdown([[currentLabels.common.none, '']]),
          START_SCREEN_BLOCK_FIELDS.musicAssetId,
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip(currentLabels.blockly.startScreenMusicTooltip);
      this.setHelpUrl('');
    },
  };
}

export function registerStartScreenBlocks(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  registerRootBlock();
  registerBackgroundBlock();
  registerMusicBlock();
}

export function applyStartScreenBlocksLocalization(
  workspace: Blockly.Workspace,
  startScreen: StartScreenDocument,
  assets: AssetDocument[],
  labels: EditorLabels,
): void {
  registerStartScreenBlocks(labels);
  const root = workspace.getBlockById(START_SCREEN_BLOCK_IDS.root);
  const background = workspace.getBlockById(START_SCREEN_BLOCK_IDS.background);
  const music = workspace.getBlockById(START_SCREEN_BLOCK_IDS.music);
  Blockly.Events.disable();
  try {
    root?.setFieldValue(labels.blockly.startScreenTitle, START_SCREEN_LABEL_FIELDS.title);
    root?.setFieldValue(labels.blockly.startScreenContents, START_SCREEN_LABEL_FIELDS.contents);
    root?.setTooltip(labels.blockly.startScreenTooltip);

    background?.setFieldValue(labels.blockly.startScreenBackground, START_SCREEN_LABEL_FIELDS.background);
    background?.setTooltip(labels.blockly.startScreenBackgroundTooltip);
    if (background) {
      configureDropdown(
        background,
        START_SCREEN_BLOCK_FIELDS.backgroundAssetId,
        createStartScreenBackgroundOptions(startScreen, assets, labels),
        startScreen.backgroundAssetId,
      );
    }

    music?.setFieldValue(labels.blockly.startScreenMusic, START_SCREEN_LABEL_FIELDS.music);
    music?.setTooltip(labels.blockly.startScreenMusicTooltip);
    if (music) {
      configureDropdown(
        music,
        START_SCREEN_BLOCK_FIELDS.musicAssetId,
        createStartScreenMusicOptions(startScreen, assets, labels),
        startScreen.musicAssetId,
      );
    }

    for (const block of [root, background, music]) {
      if (block instanceof Blockly.BlockSvg) {
        block.render();
      }
    }
    if (workspace instanceof Blockly.WorkspaceSvg) {
      Blockly.renderManagement.triggerQueuedRenders(workspace);
    }
  } finally {
    Blockly.Events.enable();
  }
}

function lockManagedBlock(
  block: Blockly.Block,
  editable: boolean,
): void {
  block.setMovable(false);
  block.setDeletable(false);
  block.setEditable(editable);
  block.contextMenu = false;
}

function configureDropdown(
  block: Blockly.Block,
  fieldName: string,
  options: StartScreenAssetOption[],
  value: string | null,
): void {
  const field = block.getField(fieldName);
  if (!(field instanceof Blockly.FieldDropdown)) {
    throw new Error(`start screen field ${fieldName} is not a dropdown`);
  }
  field.setOptions(options);
  block.setFieldValue(value ?? '', fieldName);
}

function initializeBlock(block: Blockly.Block): void {
  if (block instanceof Blockly.BlockSvg) {
    block.initSvg();
    block.render();
  }
}

export function renderStartScreenBlocks(
  workspace: Blockly.Workspace,
  startScreen: StartScreenDocument,
  assets: AssetDocument[],
  resourceFieldsEditable = true,
  labels: EditorLabels = currentLabels,
): void {
  registerStartScreenBlocks(labels);

  Blockly.Events.disable();
  try {
    workspace.clear();

    const root = workspace.newBlock(
      START_SCREEN_ROOT_BLOCK_TYPE,
      START_SCREEN_BLOCK_IDS.root,
    );
    const background = workspace.newBlock(
      START_SCREEN_BACKGROUND_BLOCK_TYPE,
      START_SCREEN_BLOCK_IDS.background,
    );
    const music = workspace.newBlock(
      START_SCREEN_MUSIC_BLOCK_TYPE,
      START_SCREEN_BLOCK_IDS.music,
    );

    root.setFieldValue(
      startScreen.title,
      START_SCREEN_BLOCK_FIELDS.title,
    );

    configureDropdown(
      background,
      START_SCREEN_BLOCK_FIELDS.backgroundAssetId,
      createStartScreenBackgroundOptions(startScreen, assets, labels),
      startScreen.backgroundAssetId,
    );
    configureDropdown(
      music,
      START_SCREEN_BLOCK_FIELDS.musicAssetId,
      createStartScreenMusicOptions(startScreen, assets, labels),
      startScreen.musicAssetId,
    );

    for (const block of [root, background, music]) {
      lockManagedBlock(block, resourceFieldsEditable);
    }
    for (const block of [root, background, music]) {
      initializeBlock(block);
    }

    const contentsConnection = root.getInput('CONTENTS')?.connection;
    if (
      !contentsConnection ||
      !background.previousConnection ||
      !background.nextConnection ||
      !music.previousConnection
    ) {
      throw new Error('start screen block connection contract is incomplete');
    }
    background.nextConnection.connect(music.previousConnection);
    contentsConnection.connect(background.previousConnection);

    if (workspace instanceof Blockly.WorkspaceSvg) {
      Blockly.renderManagement.triggerQueuedRenders(workspace);
    }

    if (root instanceof Blockly.BlockSvg) {
      root.moveBy(64, 48);
    }
  } finally {
    Blockly.Events.enable();
  }
}
