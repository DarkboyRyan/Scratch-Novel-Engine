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
