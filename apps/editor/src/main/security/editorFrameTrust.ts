export type TrustedEditorLocations = ReadonlyMap<number, string>;

export function isSameEditorLocation(
  actualLocation: string,
  expectedLocation: string,
): boolean {
  try {
    const actual = new URL(actualLocation);
    const expected = new URL(expectedLocation);

    // search/hash 属于同一份编辑器文档；协议、主机和文件路径则不可改变。
    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actual.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

export function isTrustedEditorFrame(
  event: Electron.IpcMainInvokeEvent,
  trustedLocations: TrustedEditorLocations,
): boolean {
  const expectedLocation = trustedLocations.get(event.sender.id);

  return (
    expectedLocation !== undefined &&
    event.senderFrame === event.sender.mainFrame &&
    isSameEditorLocation(event.senderFrame.url, expectedLocation)
  );
}
