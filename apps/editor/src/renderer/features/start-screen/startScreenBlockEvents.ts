import * as Blockly from 'blockly';

import type { ProjectDocument } from '../../../shared/projectTypes';
import {
  START_SCREEN_BACKGROUND_BLOCK_TYPE,
  START_SCREEN_BLOCK_FIELDS,
  START_SCREEN_BLOCK_IDS,
  START_SCREEN_MUSIC_BLOCK_TYPE,
  START_SCREEN_ROOT_BLOCK_TYPE,
} from './startScreenBlocks';

type StartScreenDocument = ProjectDocument['startScreen'];

export function getStartScreenFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.Workspace,
): StartScreenDocument | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }
  const change = event as Blockly.Events.BlockChange;
  const isTitleChange =
    change.blockId === START_SCREEN_BLOCK_IDS.root &&
    change.name === START_SCREEN_BLOCK_FIELDS.title;
  const isBackgroundChange =
    change.blockId === START_SCREEN_BLOCK_IDS.background &&
    change.name === START_SCREEN_BLOCK_FIELDS.backgroundAssetId;
  const isMusicChange =
    change.blockId === START_SCREEN_BLOCK_IDS.music &&
    change.name === START_SCREEN_BLOCK_FIELDS.musicAssetId;
  if (
    change.element !== 'field' ||
    (!isTitleChange && !isBackgroundChange && !isMusicChange)
  ) {
    return null;
  }

  const root = workspace.getBlockById(START_SCREEN_BLOCK_IDS.root);
  const background = workspace.getBlockById(
    START_SCREEN_BLOCK_IDS.background,
  );
  const music = workspace.getBlockById(START_SCREEN_BLOCK_IDS.music);
  if (
    root?.type !== START_SCREEN_ROOT_BLOCK_TYPE ||
    background?.type !== START_SCREEN_BACKGROUND_BLOCK_TYPE ||
    music?.type !== START_SCREEN_MUSIC_BLOCK_TYPE
  ) {
    return null;
  }

  const backgroundAssetId = String(
    background.getFieldValue(
      START_SCREEN_BLOCK_FIELDS.backgroundAssetId,
    ) ?? '',
  );
  const musicAssetId = String(
    music.getFieldValue(START_SCREEN_BLOCK_FIELDS.musicAssetId) ?? '',
  );
  return {
    title: String(
      root.getFieldValue(START_SCREEN_BLOCK_FIELDS.title) ?? '',
    ),
    backgroundAssetId: backgroundAssetId || null,
    musicAssetId: musicAssetId || null,
  };
}
