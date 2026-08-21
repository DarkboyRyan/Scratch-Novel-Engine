import * as Blockly from 'blockly';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../../shared/projectTypes';

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
): StartScreenAssetLabels {
  return {
    background: assetLabel(
      assets,
      startScreen.backgroundAssetId,
      'image',
      '未选择背景图片',
      '缺失图片',
    ),
    music: assetLabel(
      assets,
      startScreen.musicAssetId,
      'audio',
      '未选择背景音乐',
      '缺失音频',
    ),
  };
}

function assetOptions(
  assets: AssetDocument[],
  selectedAssetId: string | null,
  expectedType: AssetDocument['type'],
  missingLabel: string,
): StartScreenAssetOption[] {
  const options: StartScreenAssetOption[] = [
    ['无', ''],
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
): StartScreenAssetOption[] {
  return assetOptions(
    assets,
    startScreen.backgroundAssetId,
    'image',
    '缺失图片',
  );
}

export function createStartScreenMusicOptions(
  startScreen: StartScreenDocument,
  assets: AssetDocument[],
): StartScreenAssetOption[] {
  return assetOptions(
    assets,
    startScreen.musicAssetId,
    'audio',
    '缺失音频',
  );
}

function registerRootBlock(): void {
  if (Blockly.Blocks[START_SCREEN_ROOT_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[START_SCREEN_ROOT_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput()
        .appendField('主界面游戏名')
        .appendField(
          new Blockly.FieldTextInput('未命名游戏'),
          START_SCREEN_BLOCK_FIELDS.title,
        );
      this.appendStatementInput('CONTENTS').appendField('界面内容');
      this.setColour(260);
      this.setTooltip('设置游戏主界面显示的名称');
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
      this.appendDummyInput()
        .appendField('背景图片')
        .appendField(
          new Blockly.FieldDropdown([['无', '']]),
          START_SCREEN_BLOCK_FIELDS.backgroundAssetId,
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(210);
      this.setTooltip('选择图片资源，或将图片资源拖到此积木');
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
        .appendField('背景音乐')
        .appendField(
          new Blockly.FieldDropdown([['无', '']]),
          START_SCREEN_BLOCK_FIELDS.musicAssetId,
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip('选择音频资源，或将音频资源拖到此积木');
      this.setHelpUrl('');
    },
  };
}

export function registerStartScreenBlocks(): void {
  registerRootBlock();
  registerBackgroundBlock();
  registerMusicBlock();
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
): void {
  registerStartScreenBlocks();

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
      createStartScreenBackgroundOptions(startScreen, assets),
      startScreen.backgroundAssetId,
    );
    configureDropdown(
      music,
      START_SCREEN_BLOCK_FIELDS.musicAssetId,
      createStartScreenMusicOptions(startScreen, assets),
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
