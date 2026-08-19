export type PlayerByteRange = {
  start: number;
  end: number;
};

function parseDecimal(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

export function parsePlayerByteRange(
  header: string,
  fileSize: number,
): PlayerByteRange | null {
  const match = header.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (match === null || (match[1] === '' && match[2] === '')) {
    return null;
  }
  if (match[1] === '') {
    const suffixLength = parseDecimal(match[2]);
    if (suffixLength === null || suffixLength === 0) {
      return null;
    }
    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
    };
  }

  const start = parseDecimal(match[1]);
  const requestedEnd = match[2] === ''
    ? fileSize - 1
    : parseDecimal(match[2]);
  if (
    start === null ||
    requestedEnd === null ||
    start >= fileSize ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, fileSize - 1) };
}
