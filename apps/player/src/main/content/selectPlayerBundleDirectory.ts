import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from 'electron';
import type { PlayerLanguage } from '../../shared/playerProtocol';

type NativeOpenDialog = {
  showOpenDialog(
    window: BrowserWindow,
    options: OpenDialogOptions,
  ): Promise<OpenDialogReturnValue>;
};

const BUNDLE_DIALOG_LABELS: Readonly<
  Record<PlayerLanguage, Pick<OpenDialogOptions, 'title' | 'buttonLabel' | 'message'>>
> = {
  'zh-CN': {
    title: '打开 VN Engine 游戏',
    buttonLabel: '打开游戏',
    message: '请选择名称以 .vngame 结尾的游戏目录包',
  },
  'en-US': {
    title: 'Open VN Engine Game',
    buttonLabel: 'Open Game',
    message: 'Select a game directory whose name ends with .vngame',
  },
};

export async function selectPlayerBundleDirectory(
  owner: BrowserWindow,
  nativeDialog: NativeOpenDialog,
  language: PlayerLanguage,
): Promise<string | null> {
  const labels = BUNDLE_DIALOG_LABELS[language];
  const result = await nativeDialog.showOpenDialog(owner, {
    ...labels,
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length !== 1) {
    return null;
  }
  return result.filePaths[0] ?? null;
}
