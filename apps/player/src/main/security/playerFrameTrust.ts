/**
 * 主要作用：核验 IPC 发送帧是否属于登记窗口和预期页面。
 * 关键函数与实现：`TrustedPlayerLocations`、`isSamePlayerLocation`、`isTrustedPlayerFrame`；基于 Electron Main 与 Node.js 安全文件/协议边界实现。
 */
export type TrustedPlayerLocations = ReadonlyMap<number, string>;

export function isSamePlayerLocation(
  actualLocation: string,
  expectedLocation: string,
): boolean {
  try {
    const actual = new URL(actualLocation);
    const expected = new URL(expectedLocation);
    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actual.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

export function isTrustedPlayerFrame(
  event: Electron.IpcMainInvokeEvent,
  trustedLocations: TrustedPlayerLocations,
): boolean {
  const expectedLocation = trustedLocations.get(event.sender.id);
  return (
    expectedLocation !== undefined &&
    event.senderFrame === event.sender.mainFrame &&
    isSamePlayerLocation(event.senderFrame.url, expectedLocation)
  );
}
