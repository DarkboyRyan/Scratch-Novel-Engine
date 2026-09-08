/**
 * 文件主要作用：为原生 textarea 提供确定性的代码缩进编辑。
 * 包含实现：Tab/Shift+Tab 多行缩进与 Enter 自动对齐。
 */

export const CODE_INDENT = '  ';

export type CodeTextareaEdit = {
  source: string;
  selectionStart: number;
  selectionEnd: number;
};

type CodeTextareaEditInput = {
  source: string;
  selectionStart: number;
  selectionEnd: number;
  key: string;
  shiftKey: boolean;
};

type SourceEdit = {
  start: number;
  deleteCount: number;
  insert: string;
};

function lineStartAt(source: string, offset: number): number {
  return source.lastIndexOf('\n', Math.max(0, offset) - 1) + 1;
}

function selectedLineStarts(
  source: string,
  selectionStart: number,
  selectionEnd: number,
): number[] {
  const first = lineStartAt(source, selectionStart);
  const effectiveEnd =
    selectionEnd > selectionStart && source[selectionEnd - 1] === '\n'
      ? selectionEnd - 1
      : selectionEnd;
  const starts = [first];
  let cursor = source.indexOf('\n', first);
  while (cursor !== -1 && cursor + 1 <= effectiveEnd) {
    starts.push(cursor + 1);
    cursor = source.indexOf('\n', cursor + 1);
  }
  return starts;
}

function applySourceEdits(source: string, edits: SourceEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, edit) =>
        current.slice(0, edit.start) +
        edit.insert +
        current.slice(edit.start + edit.deleteCount),
      source,
    );
}

function indentationRemovalAt(source: string, start: number): number {
  if (source[start] === '\t') {
    return 1;
  }
  let count = 0;
  while (count < CODE_INDENT.length && source[start + count] === ' ') {
    count += 1;
  }
  return count;
}

function indentSelection(
  source: string,
  selectionStart: number,
  selectionEnd: number,
): CodeTextareaEdit {
  if (selectionStart === selectionEnd) {
    return {
      source:
        source.slice(0, selectionStart) +
        CODE_INDENT +
        source.slice(selectionEnd),
      selectionStart: selectionStart + CODE_INDENT.length,
      selectionEnd: selectionEnd + CODE_INDENT.length,
    };
  }

  const starts = selectedLineStarts(source, selectionStart, selectionEnd);
  const edits = starts.map((start) => ({
    start,
    deleteCount: 0,
    insert: CODE_INDENT,
  }));
  const insertedBeforeOrAtStart = edits.reduce(
    (total, edit) => total + (edit.start <= selectionStart ? CODE_INDENT.length : 0),
    0,
  );
  const insertedBeforeEnd = edits.reduce(
    (total, edit) => total + (edit.start < selectionEnd ? CODE_INDENT.length : 0),
    0,
  );
  return {
    source: applySourceEdits(source, edits),
    selectionStart: selectionStart + insertedBeforeOrAtStart,
    selectionEnd: selectionEnd + insertedBeforeEnd,
  };
}

function outdentSelection(
  source: string,
  selectionStart: number,
  selectionEnd: number,
): CodeTextareaEdit {
  const starts = selectedLineStarts(source, selectionStart, selectionEnd);
  const edits = starts
    .map((start) => ({
      start,
      deleteCount: indentationRemovalAt(source, start),
      insert: '',
    }))
    .filter((edit) => edit.deleteCount > 0);
  const adjustedOffset = (offset: number): number => {
    let adjusted = offset;
    for (const edit of edits) {
      if (offset <= edit.start) {
        continue;
      }
      adjusted -= Math.min(edit.deleteCount, offset - edit.start);
    }
    return adjusted;
  };
  return {
    source: applySourceEdits(source, edits),
    selectionStart: adjustedOffset(selectionStart),
    selectionEnd: adjustedOffset(selectionEnd),
  };
}

function preferredLineBreak(source: string): '\n' | '\r\n' {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function insertAlignedLine(
  source: string,
  selectionStart: number,
  selectionEnd: number,
): CodeTextareaEdit {
  const lineStart = lineStartAt(source, selectionStart);
  const beforeCaret = source.slice(lineStart, selectionStart);
  const indentation = beforeCaret.match(/^[\t ]*/)?.[0] ?? '';
  const opener = beforeCaret.trimEnd().at(-1);
  const expectedCloser = opener === '{'
    ? '}'
    : opener === '('
      ? ')'
      : opener === '['
        ? ']'
        : null;
  const opensBlock = expectedCloser !== null;
  const currentLineEnd = source.indexOf('\n', selectionEnd);
  const afterSelectionOnLine = source.slice(
    selectionEnd,
    currentLineEnd === -1 ? source.length : currentLineEnd,
  );
  const closesBlock = expectedCloser !== null &&
    afterSelectionOnLine.trimStart().startsWith(expectedCloser);
  const lineBreak = preferredLineBreak(source);

  if (opensBlock && closesBlock) {
    const innerIndentation = indentation + CODE_INDENT;
    const insertion =
      lineBreak + innerIndentation + lineBreak + indentation;
    return {
      source:
        source.slice(0, selectionStart) +
        insertion +
        source.slice(selectionEnd),
      selectionStart:
        selectionStart + lineBreak.length + innerIndentation.length,
      selectionEnd:
        selectionStart + lineBreak.length + innerIndentation.length,
    };
  }

  const nextIndentation = opensBlock
    ? indentation + CODE_INDENT
    : indentation;
  const insertion = lineBreak + nextIndentation;
  const caret = selectionStart + insertion.length;
  return {
    source:
      source.slice(0, selectionStart) +
      insertion +
      source.slice(selectionEnd),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

export function getCodeTextareaEdit({
  source,
  selectionStart,
  selectionEnd,
  key,
  shiftKey,
}: CodeTextareaEditInput): CodeTextareaEdit | null {
  if (key === 'Tab') {
    return shiftKey
      ? outdentSelection(source, selectionStart, selectionEnd)
      : indentSelection(source, selectionStart, selectionEnd);
  }
  if (key === 'Enter') {
    return insertAlignedLine(source, selectionStart, selectionEnd);
  }
  return null;
}
