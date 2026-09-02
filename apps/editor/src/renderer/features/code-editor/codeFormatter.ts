/**
 * 主要作用：为只读 Code 视图生成稳定缩进，并记录作者对象对应的源码行范围。
 * 关键实现：`ReadonlyCodeFormatter`、`quoteCodeString`；仅构造投影文本，不修改工程数据。
 */

export type CodeSourceRangeKind = 'sceneNode' | 'choiceOption';

export type CodeSourceRange = {
  id: string;
  kind: CodeSourceRangeKind;
  /** One-based, inclusive line number. */
  startLine: number;
  /** One-based, inclusive line number. */
  endLine: number;
};

export type FormattedReadonlyCode = {
  source: string;
  sourceRanges: CodeSourceRange[];
};

/** Resolves overlapping control-flow ranges to the deepest authored item. */
export function findDeepestCodeSourceRange(
  ranges: readonly CodeSourceRange[],
  line: number,
): CodeSourceRange | null {
  if (!Number.isSafeInteger(line) || line < 1) {
    return null;
  }
  let deepest: CodeSourceRange | null = null;
  for (const range of ranges) {
    if (line < range.startLine || line > range.endLine) {
      continue;
    }
    const rangeSpan = range.endLine - range.startLine;
    const deepestSpan = deepest === null
      ? Number.POSITIVE_INFINITY
      : deepest.endLine - deepest.startLine;
    if (
      rangeSpan < deepestSpan ||
      (rangeSpan === deepestSpan &&
        range.startLine > (deepest?.startLine ?? -1))
    ) {
      deepest = range;
    }
  }
  return deepest;
}

export function quoteCodeString(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export class ReadonlyCodeFormatter {
  private readonly lines: string[] = [];
  private readonly ranges: CodeSourceRange[] = [];
  private depth = 0;

  line(text = ''): void {
    this.lines.push(text.length === 0 ? '' : `${'  '.repeat(this.depth)}${text}`);
  }

  indented(writeBody: () => void): void {
    this.depth += 1;
    try {
      writeBody();
    } finally {
      this.depth -= 1;
    }
  }

  block(header: string, writeBody: () => void): void {
    this.line(`${header} {`);
    this.indented(writeBody);
    this.line('}');
  }

  mark(
    id: string,
    kind: CodeSourceRangeKind,
    writeSource: () => void,
  ): void {
    const startLine = this.lines.length + 1;
    writeSource();
    const endLine = Math.max(startLine, this.lines.length);
    this.ranges.push({ id, kind, startLine, endLine });
  }

  finish(): FormattedReadonlyCode {
    return {
      source: `${this.lines.join('\n')}\n`,
      sourceRanges: [...this.ranges].sort((left, right) =>
        left.startLine - right.startLine || left.endLine - right.endLine
      ),
    };
  }
}
