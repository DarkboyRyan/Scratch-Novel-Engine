import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from 'electron';

type NativeOpenDialog = {
  showOpenDialog(
    window: BrowserWindow,
    options: OpenDialogOptions,
  ): Promise<OpenDialogReturnValue>;
};

export async function selectPlayerBundleDirectory(
  owner: BrowserWindow,
  nativeDialog: NativeOpenDialog,
): Promise<string | null> {
  const result = await nativeDialog.showOpenDialog(owner, {
    title: '打开 VN Engine 游戏',
    buttonLabel: '打开游戏',
    message: '请选择名称以 .vngame 结尾的游戏目录包',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length !== 1) {
    return null;
  }
  return result.filePaths[0] ?? null;
}
