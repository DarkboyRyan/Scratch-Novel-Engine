/**
 * 主要作用：把可编辑剧情 DSL 严格解析为后端可原子提交的嵌套场景草稿。
 * 关键实现：封闭词法/语法、资源与场景引用消歧、既有作者身份复用；源码绝不作为脚本执行。
 */

import type {
  AssetDocument,
  CharacterEffect,
  LogicCondition,
  LogicOperand,
  LogicValue,
  ProjectDocument,
  SceneContentChoiceOptionDraft,
  SceneContentDialogueDraft,
  SceneContentDraft,
  SceneContentDraftNode,
  SceneDocument,
  SceneNode,
} from '../../../shared/projectTypes';
import {
  parseLogicStructure,
  type LogicStructureItem,
} from '../block-editor/logicStructure';
import type { CodeSourceRange } from './codeFormatter';
import {
  projectSceneToReadonlyCode,
  type ReadonlyCodeProjection,
} from './sceneCodeProjection';

export type {
  SceneContentChoiceOptionDraft,
  SceneContentDialogueDraft,
  SceneContentDraft,
  SceneContentDraftNode,
} from '../../../shared/projectTypes';

export type SceneCodeDiagnosticCode =
  | 'sourceTooLong'
  | 'invalidToken'
  | 'unexpectedToken'
  | 'invalidHeader'
  | 'invalidSceneName'
  | 'unknownStatement'
  | 'invalidArgument'
  | 'invalidValue'
  | 'invalidStructure'
  | 'missingReference'
  | 'ambiguousReference'
  | 'selfJump'
  | 'variableLimit';

export type EditableSceneCodeDiagnostic = {
  severity: 'error';
  code: SceneCodeDiagnosticCode;
  line: number;
  column: number;
  field?: string;
  reference?: string;
  message: string;
};

export type EditableSceneCodeParseInput = {
  source: string;
  scene: SceneDocument;
  project: Pick<ProjectDocument, 'scenes'>;
  assets: readonly AssetDocument[];
  previousProjection?: Pick<ReadonlyCodeProjection, 'source' | 'sourceRanges'>;
};

export type EditableSceneCodeParseResult =
  | {
      ok: true;
      draft: SceneContentDraft;
      canonicalSource: string;
      diagnostics: [];
      sourceRanges: CodeSourceRange[];
    }
  | {
      ok: false;
      diagnostics: EditableSceneCodeDiagnostic[];
    };

const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_LOGIC_STRING_BYTES = 4096;
const MAX_VARIABLE_NAME_BYTES = 64;
const MAX_VARIABLE_COUNT = 32;
const MAX_NESTING_DEPTH = 16;
const MAX_DRAFT_ENTITIES = 10_000;
const MAX_SCENE_NAME_BYTES = 4096;
const MAX_SPEAKER_CODE_UNITS = 4096;
const MAX_CHOICE_TEXT_CODE_UNITS = 64 * 1024;
const UTF8_ENCODER = new TextEncoder();

function trimAsciiWhitespace(value: string): string {
  return value.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/gu, '');
}

type TokenKind = 'identifier' | 'number' | 'string' | 'symbol' | 'operator' | 'eof';

type Token = {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
};

class ParseFailure extends Error {
  readonly diagnostic: EditableSceneCodeDiagnostic;

  constructor(diagnostic: EditableSceneCodeDiagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

function diagnostic(
  code: SceneCodeDiagnosticCode,
  token: Pick<Token, 'line' | 'column'>,
  message: string,
  details: { field?: string; reference?: string } = {},
): EditableSceneCodeDiagnostic {
  return {
    severity: 'error',
    code,
    line: token.line,
    column: token.column,
    ...details,
    message,
  };
}

function fail(
  code: SceneCodeDiagnosticCode,
  token: Pick<Token, 'line' | 'column'>,
  message: string,
  details: { field?: string; reference?: string } = {},
): never {
  throw new ParseFailure(diagnostic(code, token, message, details));
}

function isIdentifierStart(character: string): boolean {
  return /^[\p{L}_]$/u.test(character);
}

function isIdentifierPart(character: string): boolean {
  return /^[\p{L}\p{N}_-]$/u.test(character);
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

class Lexer {
  private readonly source: string;
  private offset = 0;
  private line = 1;
  private column = 1;

  constructor(source: string) {
    this.source = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.offset < this.source.length) {
      this.skipWhitespace();
      if (this.offset >= this.source.length) break;
      tokens.push(this.readToken());
    }
    tokens.push({ kind: 'eof', value: '', line: this.line, column: this.column });
    return tokens;
  }

  private skipWhitespace(): void {
    while (this.offset < this.source.length) {
      const character = this.source[this.offset] ?? '';
      if (!/\s/u.test(character)) return;
      this.advance(character);
    }
  }

  private readToken(): Token {
    const line = this.line;
    const column = this.column;
    const character = this.source[this.offset] ?? '';
    const two = this.source.slice(this.offset, this.offset + 2);
    if (['==', '!=', '>=', '<='].includes(two)) {
      this.advance(two[0] ?? '');
      this.advance(two[1] ?? '');
      return { kind: 'operator', value: two, line, column };
    }
    if (character === '>' || character === '<') {
      this.advance(character);
      return { kind: 'operator', value: character, line, column };
    }
    if ('(){}[],:$'.includes(character)) {
      this.advance(character);
      return { kind: 'symbol', value: character, line, column };
    }
    if (character === '"') return this.readString(line, column);

    const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(
      this.source.slice(this.offset),
    )?.[0];
    if (numeric !== undefined && numeric.length > 0) {
      for (const part of numeric) this.advance(part);
      return { kind: 'number', value: numeric, line, column };
    }

    if (isIdentifierStart(character)) {
      let value = '';
      while (this.offset < this.source.length) {
        const current = String.fromCodePoint(
          this.source.codePointAt(this.offset) ?? 0,
        );
        if (!isIdentifierPart(current)) break;
        value += current;
        this.advance(current);
      }
      return { kind: 'identifier', value, line, column };
    }
    fail('invalidToken', { line, column }, `Unsupported token ${JSON.stringify(character)}.`);
  }

  private readString(line: number, column: number): Token {
    const start = this.offset;
    this.advance('"');
    let escaped = false;
    while (this.offset < this.source.length) {
      const character = this.source[this.offset] ?? '';
      if (character === '\n') {
        fail('invalidToken', { line, column }, 'String literals cannot contain a raw line break.');
      }
      this.advance(character);
      if (!escaped && character === '"') {
        const raw = this.source.slice(start, this.offset);
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          fail('invalidToken', { line, column }, 'Invalid JSON string literal.');
        }
        if (typeof value !== 'string' || value.includes('\0') || !isWellFormedUnicode(value)) {
          fail('invalidValue', { line, column }, 'String literal contains unsupported characters.');
        }
        return { kind: 'string', value, line, column };
      }
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
    }
    fail('invalidToken', { line, column }, 'Unterminated string literal.');
  }

  private advance(character: string): void {
    this.offset += character.length;
    if (character === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
  }
}

type SourceMeta = { startLine: number; endLine: number; startColumn: number };
type AssetReference = {
  expectedType: AssetDocument['type'];
  path: string;
  token: Token;
};
type SceneReference = { name: string; token: Token };

type ParsedChoiceOption = {
  text: string;
  target: SceneReference;
  meta: SourceMeta;
};

type ParsedNode =
  | { type: 'dialogue'; speaker: string; text: string; voice: AssetReference | null; meta: SourceMeta }
  | { type: 'background'; asset: AssetReference | null; scalePercent: number; meta: SourceMeta }
  | { type: 'character'; mode: 'show' | 'clear'; asset: AssetReference | null; slot: 'left' | 'center' | 'right'; layer: number; position: { x: number; y: number } | null; effect: CharacterEffect | null; scalePercent: number; meta: SourceMeta }
  | { type: 'sceneJump'; target: SceneReference; meta: SourceMeta }
  | { type: 'bgm'; asset: AssetReference | null; meta: SourceMeta }
  | { type: 'video'; asset: AssetReference | null; meta: SourceMeta }
  | { type: 'choice'; options: ParsedChoiceOption[]; meta: SourceMeta }
  | { type: 'variableSet'; variableName: string; value: LogicValue; meta: SourceMeta }
  | { type: 'variableChange'; variableName: string; amount: number; meta: SourceMeta }
  | { type: 'if'; condition: LogicCondition; thenNodes: ParsedNode[]; elseNodes: ParsedNode[]; meta: SourceMeta }
  | { type: 'repeat'; count: number; bodyNodes: ParsedNode[]; meta: SourceMeta }
  | { type: 'cg'; asset: AssetReference; leadInMs: number; bodyNodes: Extract<ParsedNode, { type: 'dialogue' }>[]; meta: SourceMeta }
  | { type: 'storyExtension'; meta: SourceMeta };

type ParsedProgram = {
  name: string;
  initialBackground: { asset: AssetReference | null; scalePercent: number };
  nodes: ParsedNode[];
};

class StoryParser {
  private index = 0;
  private lastToken: Token;

  constructor(private readonly tokens: readonly Token[]) {
    this.lastToken = tokens[0] ?? { kind: 'eof', value: '', line: 1, column: 1 };
  }

  parse(): ParsedProgram {
    const story = this.expectIdentifier('story', 'invalidHeader');
    const version = this.expectInteger('invalidHeader', 'story version');
    if (version !== 1) {
      fail('invalidHeader', story, 'Only story version 1 is supported.');
    }
    this.expectIdentifier('scene', 'invalidHeader');
    this.expectSymbol('(', 'invalidHeader');
    const nameToken = this.expect('string', 'invalidHeader', 'Expected a scene name string.');
    const name = nameToken.value;
    if (
      name.length === 0 ||
      trimAsciiWhitespace(name) !== name ||
      UTF8_ENCODER.encode(name).byteLength > MAX_SCENE_NAME_BYTES
    ) {
      fail('invalidSceneName', nameToken, 'Scene name must be non-empty without surrounding whitespace.');
    }
    this.expectSymbol(')', 'invalidHeader');
    this.expectSymbol('{', 'invalidHeader');
    const initialBackground = this.parseInitialBackground();
    const nodes = this.parseNodeList('}', 0);
    this.expectSymbol('}', 'invalidStructure');
    this.expect('eof', 'unexpectedToken', 'Only one scene is allowed in the Code editor.');
    return { name, initialBackground, nodes };
  }

  private parseInitialBackground(): ParsedProgram['initialBackground'] {
    const start = this.expectIdentifier('background', 'invalidStructure');
    this.expectSymbol('(', 'invalidArgument');
    let asset: AssetReference | null;
    let scalePercent = 100;
    if (this.takeIdentifier('none')) {
      asset = null;
    } else {
      asset = this.parseAssetReference('image');
      this.expectSymbol(',', 'invalidArgument');
      this.expectNamed('scale');
      scalePercent = this.expectBoundedInteger(10, 300, 'scale');
    }
    this.expectSymbol(',', 'invalidArgument');
    this.expectNamed('initial');
    this.expectIdentifier('true', 'invalidArgument');
    this.expectSymbol(')', 'invalidArgument');
    if (asset === null && scalePercent !== 100) {
      fail('invalidValue', start, 'An empty initial background must use scale 100.', { field: 'scale' });
    }
    return { asset, scalePercent };
  }

  private parseNodeList(closing: '}', depth: number): ParsedNode[] {
    if (depth > MAX_NESTING_DEPTH) {
      fail('invalidStructure', this.current(), `Nesting cannot exceed ${MAX_NESTING_DEPTH} levels.`);
    }
    const nodes: ParsedNode[] = [];
    while (!this.isSymbol(closing) && this.current().kind !== 'eof') {
      nodes.push(this.parseNode(depth));
    }
    if (this.current().kind === 'eof') {
      fail('invalidStructure', this.current(), `Expected ${closing} before end of source.`);
    }
    return nodes;
  }

  private parseNode(depth: number): ParsedNode {
    const token = this.current();
    if (token.kind !== 'identifier') {
      fail('unknownStatement', token, 'Expected a supported story statement.');
    }
    switch (token.value) {
      case 'say': return this.parseDialogue();
      case 'background': return this.parseBackground();
      case 'show': return this.parseShow();
      case 'clear': return this.parseClear();
      case 'jump': return this.parseJump();
      case 'bgm': return this.parseBgm();
      case 'play': return this.parseVideo();
      case 'choice': return this.parseChoice();
      case 'set': return this.parseVariableSet();
      case 'change': return this.parseVariableChange();
      case 'if': return this.parseIf(depth);
      case 'repeat': return this.parseRepeat(depth);
      case 'cg': return this.parseCg(depth);
      case 'pagebreak':
        if (depth !== 0) {
          fail('invalidStructure', token, 'pagebreak() cannot be nested inside a control block.');
        }
        return this.parsePagebreak();
      default:
        fail('unknownStatement', token, `Unknown story statement ${token.value}.`);
    }
  }

  private beginCall(name: string): Token {
    const start = this.expectIdentifier(name, 'unknownStatement');
    this.expectSymbol('(', 'invalidArgument');
    return start;
  }

  private finishMeta(start: Token): SourceMeta {
    return {
      startLine: start.line,
      endLine: this.lastToken.line,
      startColumn: start.column,
    };
  }

  private parseDialogue(): Extract<ParsedNode, { type: 'dialogue' }> {
    const start = this.beginCall('say');
    const text = this.expectString('text');
    let speaker = '';
    let voice: AssetReference | null = null;
    const seen = new Set<string>();
    while (this.takeSymbol(',')) {
      const field = this.expect('identifier', 'invalidArgument', 'Expected a named say() argument.');
      this.expectSymbol(':', 'invalidArgument');
      if (seen.has(field.value)) {
        fail('invalidArgument', field, `Duplicate say() argument ${field.value}.`, { field: field.value });
      }
      seen.add(field.value);
      if (field.value === 'speaker') speaker = this.expectString('speaker');
      else if (field.value === 'voice') voice = this.parseAssetReference('audio');
      else fail('invalidArgument', field, `Unknown say() argument ${field.value}.`, { field: field.value });
    }
    this.expectSymbol(')', 'invalidArgument');
    if (speaker.length > MAX_SPEAKER_CODE_UNITS) {
      fail('invalidValue', start, `speaker cannot exceed ${MAX_SPEAKER_CODE_UNITS} characters.`, { field: 'speaker' });
    }
    return { type: 'dialogue', speaker, text, voice, meta: this.finishMeta(start) };
  }

  private parseBackground(): Extract<ParsedNode, { type: 'background' }> {
    const start = this.beginCall('background');
    if (this.takeIdentifier('none')) {
      this.expectSymbol(')', 'invalidArgument');
      return { type: 'background', asset: null, scalePercent: 100, meta: this.finishMeta(start) };
    }
    const asset = this.parseAssetReference('image');
    this.expectSymbol(',', 'invalidArgument');
    this.expectNamed('scale');
    const scalePercent = this.expectBoundedInteger(10, 300, 'scale');
    this.expectSymbol(')', 'invalidArgument');
    return { type: 'background', asset, scalePercent, meta: this.finishMeta(start) };
  }

  private parseShow(): Extract<ParsedNode, { type: 'character' }> {
    const start = this.beginCall('show');
    const asset = this.takeIdentifier('pending') ? null : this.parseAssetReference('image');
    this.expectSymbol(',', 'invalidArgument');
    this.expectNamed('at');
    let position: { x: number; y: number } | null = null;
    let slot: 'left' | 'center' | 'right';
    if (this.takeIdentifier('position')) {
      this.expectSymbol('(', 'invalidArgument');
      const x = this.expectBoundedNumber(0, 100, 'x');
      this.expectSymbol(',', 'invalidArgument');
      const y = this.expectBoundedNumber(0, 100, 'y');
      this.expectSymbol(')', 'invalidArgument');
      position = { x, y };
      this.expectSymbol(',', 'invalidArgument');
      this.expectNamed('slot');
      slot = this.expectEnum(['left', 'center', 'right'] as const, 'slot');
    } else {
      slot = this.expectEnum(['left', 'center', 'right'] as const, 'at');
    }
    this.expectSymbol(',', 'invalidArgument');
    this.expectNamed('layer');
    const layer = this.expectBoundedInteger(1, 10, 'layer');
    this.expectSymbol(',', 'invalidArgument');
    this.expectNamed('scale');
    const scalePercent = this.expectBoundedInteger(10, 300, 'scale');
    let effect: CharacterEffect | null = null;
    if (this.takeSymbol(',')) {
      this.expectNamed('effect');
      effect = this.parseEffect();
    }
    this.expectSymbol(')', 'invalidArgument');
    if (asset === null && effect !== null) {
      fail('invalidValue', start, 'A pending character cannot have an effect.', { field: 'effect' });
    }
    return { type: 'character', mode: 'show', asset, slot, layer, position, effect, scalePercent, meta: this.finishMeta(start) };
  }

  private parseClear(): Extract<ParsedNode, { type: 'character' }> {
    const start = this.beginCall('clear');
    this.expectNamed('layer');
    const layer = this.expectBoundedInteger(1, 10, 'layer');
    this.expectSymbol(')', 'invalidArgument');
    return { type: 'character', mode: 'clear', asset: null, slot: 'center', layer, position: null, effect: null, scalePercent: 100, meta: this.finishMeta(start) };
  }

  private parseJump(): Extract<ParsedNode, { type: 'sceneJump' }> {
    const start = this.beginCall('jump');
    const target = this.parseSceneReference();
    this.expectSymbol(')', 'invalidArgument');
    return { type: 'sceneJump', target, meta: this.finishMeta(start) };
  }

  private parseBgm(): Extract<ParsedNode, { type: 'bgm' }> {
    const start = this.beginCall('bgm');
    const asset = this.takeIdentifier('stop') ? null : this.parseAssetReference('audio');
    this.expectSymbol(')', 'invalidArgument');
    return { type: 'bgm', asset, meta: this.finishMeta(start) };
  }

  private parseVideo(): Extract<ParsedNode, { type: 'video' }> {
    const start = this.beginCall('play');
    this.expectIdentifier('video', 'invalidArgument');
    this.expectSymbol('(', 'invalidArgument');
    const asset = this.takeIdentifier('pending')
      ? null
      : this.assetReferenceFromString('video', this.expect('string', 'invalidArgument', 'Expected a video asset path.'));
    this.expectSymbol(')', 'invalidArgument');
    this.expectSymbol(')', 'invalidArgument');
    return { type: 'video', asset, meta: this.finishMeta(start) };
  }

  private parseChoice(): Extract<ParsedNode, { type: 'choice' }> {
    const start = this.expectIdentifier('choice', 'unknownStatement');
    this.expectSymbol('{', 'invalidStructure');
    const options: ParsedChoiceOption[] = [];
    while (!this.isSymbol('}') && this.current().kind !== 'eof') {
      const optionStart = this.beginCall('option');
      const text = this.expectString('text');
      if (
        text.length === 0 ||
        trimAsciiWhitespace(text) !== text ||
        text.length > MAX_CHOICE_TEXT_CODE_UNITS
      ) {
        fail('invalidValue', optionStart, 'Choice text must be non-empty without surrounding whitespace.', { field: 'text' });
      }
      this.expectSymbol(',', 'invalidArgument');
      this.expectNamed('target');
      const target = this.parseSceneReference();
      this.expectSymbol(')', 'invalidArgument');
      options.push({ text, target, meta: this.finishMeta(optionStart) });
    }
    this.expectSymbol('}', 'invalidStructure');
    return { type: 'choice', options, meta: this.finishMeta(start) };
  }

  private parseVariableSet(): Extract<ParsedNode, { type: 'variableSet' }> {
    const start = this.beginCall('set');
    const variableName = this.parseVariable();
    this.expectSymbol(',', 'invalidArgument');
    this.expectNamed('value');
    const value = this.parseLogicValue();
    this.expectSymbol(')', 'invalidArgument');
    return { type: 'variableSet', variableName, value, meta: this.finishMeta(start) };
  }

  private parseVariableChange(): Extract<ParsedNode, { type: 'variableChange' }> {
    const start = this.beginCall('change');
    const variableName = this.parseVariable();
    this.expectSymbol(',', 'invalidArgument');
    this.expectNamed('amount');
    const amount = this.expectFiniteNumber('amount');
    this.expectSymbol(')', 'invalidArgument');
    return { type: 'variableChange', variableName, amount, meta: this.finishMeta(start) };
  }

  private parseIf(depth: number): Extract<ParsedNode, { type: 'if' }> {
    const start = this.beginCall('if');
    const left = this.parseLogicOperand();
    const operatorToken = this.expect('operator', 'invalidArgument', 'Expected a comparison operator.');
    const operators = { '==': 'eq', '!=': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' } as const;
    const operator = operators[operatorToken.value as keyof typeof operators];
    if (operator === undefined) fail('invalidValue', operatorToken, 'Unsupported comparison operator.', { field: 'condition' });
    const right = this.parseLogicOperand();
    this.expectSymbol(')', 'invalidArgument');
    this.expectSymbol('{', 'invalidStructure');
    const thenNodes = this.parseNodeList('}', depth + 1);
    this.expectSymbol('}', 'invalidStructure');
    this.expectIdentifier('else', 'invalidStructure');
    this.expectSymbol('{', 'invalidStructure');
    const elseNodes = this.parseNodeList('}', depth + 1);
    this.expectSymbol('}', 'invalidStructure');
    return { type: 'if', condition: { left, operator, right }, thenNodes, elseNodes, meta: this.finishMeta(start) };
  }

  private parseRepeat(depth: number): Extract<ParsedNode, { type: 'repeat' }> {
    const start = this.beginCall('repeat');
    const count = this.expectBoundedInteger(1, 1000, 'count');
    this.expectSymbol(')', 'invalidArgument');
    this.expectSymbol('{', 'invalidStructure');
    const bodyNodes = this.parseNodeList('}', depth + 1);
    this.expectSymbol('}', 'invalidStructure');
    return { type: 'repeat', count, bodyNodes, meta: this.finishMeta(start) };
  }

  private parseCg(depth: number): Extract<ParsedNode, { type: 'cg' }> {
    const start = this.beginCall('cg');
    const asset = this.parseAssetReference('image');
    this.expectSymbol(',', 'invalidArgument');
    this.expectNamed('lead');
    const leadInMs = this.expectBoundedInteger(0, 60000, 'lead');
    this.expectIdentifier('ms', 'invalidArgument');
    this.expectSymbol(')', 'invalidArgument');
    this.expectSymbol('{', 'invalidStructure');
    const bodyNodes: Extract<ParsedNode, { type: 'dialogue' }>[] = [];
    while (!this.isSymbol('}') && this.current().kind !== 'eof') {
      if (!(this.current().kind === 'identifier' && this.current().value === 'say')) {
        fail('invalidStructure', this.current(), 'A cg block may contain only say() statements.');
      }
      bodyNodes.push(this.parseDialogue());
    }
    this.expectSymbol('}', 'invalidStructure');
    if (depth + 1 > MAX_NESTING_DEPTH) {
      fail('invalidStructure', start, `Nesting cannot exceed ${MAX_NESTING_DEPTH} levels.`);
    }
    return { type: 'cg', asset, leadInMs, bodyNodes, meta: this.finishMeta(start) };
  }

  private parsePagebreak(): Extract<ParsedNode, { type: 'storyExtension' }> {
    const start = this.beginCall('pagebreak');
    this.expectSymbol(')', 'invalidArgument');
    return { type: 'storyExtension', meta: this.finishMeta(start) };
  }

  private parseEffect(): CharacterEffect {
    const typeToken = this.expect('identifier', 'invalidArgument', 'Expected a character effect.');
    this.expectSymbol('(', 'invalidArgument');
    const durationMs = this.expectBoundedInteger(100, 10000, 'duration');
    this.expectIdentifier('ms', 'invalidArgument');
    if (typeToken.value === 'fadeIn' || typeToken.value === 'fadeOut') {
      this.expectSymbol(')', 'invalidArgument');
      return { type: typeToken.value, durationMs };
    }
    this.expectSymbol(',', 'invalidArgument');
    const intensity = this.expectEnum(['subtle', 'normal', 'strong'] as const, 'intensity');
    if (typeToken.value === 'slideIn') {
      this.expectSymbol(',', 'invalidArgument');
      const direction = this.expectEnum(['left', 'right', 'up', 'down'] as const, 'direction');
      this.expectSymbol(')', 'invalidArgument');
      return { type: 'slideIn', durationMs, intensity, direction };
    }
    if (!(['shake', 'jump', 'breathe', 'flash'] as const).includes(typeToken.value as 'shake')) {
      fail('invalidValue', typeToken, `Unsupported character effect ${typeToken.value}.`, { field: 'effect' });
    }
    this.expectSymbol(')', 'invalidArgument');
    return { type: typeToken.value as 'shake' | 'jump' | 'breathe' | 'flash', durationMs, intensity };
  }

  private parseAssetReference(expectedType: AssetDocument['type']): AssetReference {
    this.expectIdentifier(expectedType, 'invalidArgument');
    this.expectSymbol('(', 'invalidArgument');
    const path = this.expect('string', 'invalidArgument', 'Expected an asset path string.');
    this.expectSymbol(')', 'invalidArgument');
    return this.assetReferenceFromString(expectedType, path);
  }

  private assetReferenceFromString(expectedType: AssetDocument['type'], token: Token): AssetReference {
    return { expectedType, path: token.value, token };
  }

  private parseSceneReference(): SceneReference {
    this.expectIdentifier('scene', 'invalidArgument');
    this.expectSymbol('(', 'invalidArgument');
    const token = this.expect('string', 'invalidArgument', 'Expected a scene name string.');
    this.expectSymbol(')', 'invalidArgument');
    return { name: token.value, token };
  }

  private parseVariable(): string {
    const dollar = this.expectSymbol('$', 'invalidArgument');
    let name: string;
    if (this.takeSymbol('[')) {
      name = this.expectString('variable');
      this.expectSymbol(']', 'invalidArgument');
    } else {
      name = this.expect('identifier', 'invalidArgument', 'Expected a variable name.').value;
    }
    if (
      name.length === 0 ||
      trimAsciiWhitespace(name) !== name ||
      name.includes('\0') ||
      UTF8_ENCODER.encode(name).byteLength > MAX_VARIABLE_NAME_BYTES
    ) {
      fail('invalidValue', dollar, 'Variable name is invalid or too long.', { field: 'variable' });
    }
    return name;
  }

  private parseLogicOperand(): LogicOperand {
    return this.isSymbol('$')
      ? { kind: 'variable', name: this.parseVariable() }
      : { kind: 'literal', value: this.parseLogicValue() };
  }

  private parseLogicValue(): LogicValue {
    const token = this.current();
    if (token.kind === 'string') {
      this.consume();
      if (UTF8_ENCODER.encode(token.value).byteLength > MAX_LOGIC_STRING_BYTES) {
        fail('invalidValue', token, 'Logic string is too long.', { field: 'value' });
      }
      return token.value;
    }
    if (token.kind === 'number') return this.expectFiniteNumber('value');
    if (this.takeIdentifier('true')) return true;
    if (this.takeIdentifier('false')) return false;
    fail('invalidValue', token, 'Logic values must be strings, finite numbers, or booleans.', { field: 'value' });
  }

  private expectString(field: string): string {
    return this.expect('string', 'invalidArgument', `Expected a string for ${field}.`).value;
  }

  private expectNamed(name: string): void {
    const token = this.expect('identifier', 'invalidArgument', `Expected named argument ${name}.`);
    if (token.value !== name) {
      fail('invalidArgument', token, `Expected named argument ${name}, received ${token.value}.`, { field: token.value });
    }
    this.expectSymbol(':', 'invalidArgument');
  }

  private expectEnum<const Value extends string>(values: readonly Value[], field: string): Value {
    const token = this.expect('identifier', 'invalidValue', `Expected ${field}.`);
    if (!values.includes(token.value as Value)) {
      fail('invalidValue', token, `${field} must be one of ${values.join(', ')}.`, { field });
    }
    return token.value as Value;
  }

  private expectFiniteNumber(field: string): number {
    const token = this.expect('number', 'invalidValue', `Expected a number for ${field}.`);
    const value = Number(token.value);
    if (!Number.isFinite(value)) fail('invalidValue', token, `${field} must be finite.`, { field });
    return value;
  }

  private expectInteger(code: SceneCodeDiagnosticCode, field: string): number {
    const token = this.expect('number', code, `Expected an integer for ${field}.`);
    const value = Number(token.value);
    if (!Number.isSafeInteger(value)) fail(code, token, `${field} must be an integer.`, { field });
    return value;
  }

  private expectBoundedInteger(minimum: number, maximum: number, field: string): number {
    const token = this.current();
    const value = this.expectInteger('invalidValue', field);
    if (value < minimum || value > maximum) {
      fail('invalidValue', token, `${field} must be between ${minimum} and ${maximum}.`, { field });
    }
    return value;
  }

  private expectBoundedNumber(minimum: number, maximum: number, field: string): number {
    const token = this.current();
    const value = this.expectFiniteNumber(field);
    if (value < minimum || value > maximum) {
      fail('invalidValue', token, `${field} must be between ${minimum} and ${maximum}.`, { field });
    }
    return value;
  }

  private expectIdentifier(value: string, code: SceneCodeDiagnosticCode): Token {
    const token = this.expect('identifier', code, `Expected ${value}.`);
    if (token.value !== value) fail(code, token, `Expected ${value}, received ${token.value}.`);
    return token;
  }

  private expectSymbol(value: string, code: SceneCodeDiagnosticCode): Token {
    const token = this.expect('symbol', code, `Expected ${value}.`);
    if (token.value !== value) fail(code, token, `Expected ${value}, received ${token.value || 'end of source'}.`);
    return token;
  }

  private expect(kind: TokenKind, code: SceneCodeDiagnosticCode, message: string): Token {
    const token = this.current();
    if (token.kind !== kind) fail(code, token, message);
    return this.consume();
  }

  private takeIdentifier(value: string): boolean {
    if (this.current().kind === 'identifier' && this.current().value === value) {
      this.consume();
      return true;
    }
    return false;
  }

  private takeSymbol(value: string): boolean {
    if (this.isSymbol(value)) {
      this.consume();
      return true;
    }
    return false;
  }

  private isSymbol(value: string): boolean {
    return this.current().kind === 'symbol' && this.current().value === value;
  }

  private current(): Token {
    return this.tokens[this.index] ?? this.tokens.at(-1) ?? { kind: 'eof', value: '', line: 1, column: 1 };
  }

  private consume(): Token {
    const token = this.current();
    this.lastToken = token;
    if (token.kind !== 'eof') this.index += 1;
    return token;
  }
}

type IdentityKind = ParsedNode['type'] | 'choiceOption';
type OldIdentity = {
  id: string;
  kind: IdentityKind;
  path: string;
  value: SceneNode | Extract<SceneNode, { type: 'choice' }>['options'][number];
};
type ParsedIdentity = {
  kind: IdentityKind;
  path: string;
  meta: SourceMeta;
  value: ParsedNode | ParsedChoiceOption;
};

function parsedKindFromOldNode(node: SceneNode): IdentityKind | null {
  if (node.type === 'logicIf') return 'if';
  if (node.type === 'logicRepeat') return 'repeat';
  if (node.type === 'cgDisplay') return 'cg';
  if (
    node.type === 'logicElse' ||
    node.type === 'logicEndIf' ||
    node.type === 'logicEndRepeat' ||
    node.type === 'cgEndDisplay'
  ) return null;
  return node.type;
}

function collectOldIdentities(
  items: readonly LogicStructureItem[],
  prefix = 'root',
  target: OldIdentity[] = [],
): OldIdentity[] {
  items.forEach((item, index) => {
    const path = `${prefix}.${index}`;
    const kind = item.kind === 'node'
      ? parsedKindFromOldNode(item.node)
      : item.kind;
    if (kind !== null) {
      target.push({ id: item.node.id, kind, path, value: item.node });
    }
    if (item.kind === 'node') {
      if (item.node.type === 'choice') {
        item.node.options.forEach((option, optionIndex) => target.push({
          id: option.id,
          kind: 'choiceOption',
          path: `${path}.option.${optionIndex}`,
          value: option,
        }));
      }
    } else if (item.kind === 'if') {
      collectOldIdentities(item.thenItems, `${path}.then`, target);
      collectOldIdentities(item.elseItems, `${path}.else`, target);
    } else {
      collectOldIdentities(item.bodyItems, `${path}.body`, target);
    }
  });
  return target;
}

function collectParsedIdentities(
  nodes: readonly ParsedNode[],
  prefix = 'root',
  target: ParsedIdentity[] = [],
): ParsedIdentity[] {
  nodes.forEach((node, index) => {
    const path = `${prefix}.${index}`;
    target.push({ kind: node.type, path, meta: node.meta, value: node });
    if (node.type === 'choice') {
      node.options.forEach((option, optionIndex) => target.push({
        kind: 'choiceOption',
        path: `${path}.option.${optionIndex}`,
        meta: option.meta,
        value: option,
      }));
    } else if (node.type === 'if') {
      collectParsedIdentities(node.thenNodes, `${path}.then`, target);
      collectParsedIdentities(node.elseNodes, `${path}.else`, target);
    } else if (node.type === 'repeat' || node.type === 'cg') {
      collectParsedIdentities(node.bodyNodes, `${path}.body`, target);
    }
  });
  return target;
}

function buildUnchangedLineMap(oldSource: string, newSource: string): Map<number, number> {
  const oldLines = oldSource.replaceAll('\r\n', '\n').split('\n');
  const newLines = newSource.replaceAll('\r\n', '\n').split('\n');
  const result = new Map<number, number>();
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    result.set(prefix + 1, prefix + 1);
    prefix += 1;
  }
  let oldSuffix = oldLines.length - 1;
  let newSuffix = newLines.length - 1;
  while (oldSuffix >= prefix && newSuffix >= prefix && oldLines[oldSuffix] === newLines[newSuffix]) {
    result.set(newSuffix + 1, oldSuffix + 1);
    oldSuffix -= 1;
    newSuffix -= 1;
  }
  const oldUnique = new Map<string, number>();
  const oldDuplicate = new Set<string>();
  for (let index = prefix; index <= oldSuffix; index += 1) {
    const line = oldLines[index] ?? '';
    if (oldUnique.has(line)) oldDuplicate.add(line);
    else oldUnique.set(line, index + 1);
  }
  const newCounts = new Map<string, number>();
  for (let index = prefix; index <= newSuffix; index += 1) {
    const line = newLines[index] ?? '';
    newCounts.set(line, (newCounts.get(line) ?? 0) + 1);
  }
  for (let index = prefix; index <= newSuffix; index += 1) {
    const line = newLines[index] ?? '';
    const oldLine = oldUnique.get(line);
    if (oldLine !== undefined && !oldDuplicate.has(line) && newCounts.get(line) === 1) {
      result.set(index + 1, oldLine);
    }
  }
  return result;
}

function deepestRangeAtLine(ranges: readonly CodeSourceRange[], line: number): CodeSourceRange | null {
  let result: CodeSourceRange | null = null;
  for (const range of ranges) {
    if (line < range.startLine || line > range.endLine) continue;
    if (result === null || range.endLine - range.startLine < result.endLine - result.startLine) result = range;
  }
  return result;
}

function assignOrigins(
  parsed: readonly ParsedIdentity[],
  old: readonly OldIdentity[],
  source: string,
  previousProjection: EditableSceneCodeParseInput['previousProjection'],
): Map<ParsedNode | ParsedChoiceOption, string> {
  const assigned = new Map<ParsedNode | ParsedChoiceOption, string>();
  const used = new Set<string>();
  const oldById = new Map(old.map((item) => [item.id, item]));
  const claim = (item: ParsedIdentity, candidate: OldIdentity | undefined): boolean => {
    if (candidate === undefined || candidate.kind !== item.kind || used.has(candidate.id)) return false;
    assigned.set(item.value, candidate.id);
    used.add(candidate.id);
    return true;
  };

  if (previousProjection !== undefined) {
    const lineMap = buildUnchangedLineMap(previousProjection.source, source);
    for (const item of parsed) {
      const oldLine = lineMap.get(item.meta.startLine);
      if (oldLine === undefined) continue;
      const range = deepestRangeAtLine(previousProjection.sourceRanges, oldLine);
      if (range !== null) claim(item, oldById.get(range.id));
    }
  }
  const oldByPath = new Map(old.map((item) => [`${item.kind}:${item.path}`, item]));
  for (const item of parsed) {
    if (!assigned.has(item.value)) claim(item, oldByPath.get(`${item.kind}:${item.path}`));
  }
  return assigned;
}

const LOGICAL_ASSET_DIRECTORIES: Record<AssetDocument['type'], string> = {
  image: 'images',
  audio: 'audio',
  video: 'videos',
};

function escapeLogicalAssetName(displayName: string): string {
  const characters = Array.from(displayName);
  if (characters.length === 0) return '%EMPTY';
  const escaped = characters.map((character, index) => {
    const internalSpace = character === ' ' && index > 0 && index < characters.length - 1;
    if (/^[\p{L}\p{N}_.-]$/u.test(character) || internalSpace) return character;
    return Array.from(UTF8_ENCODER.encode(character), (byte) => `%${byte.toString(16).padStart(2, '0').toUpperCase()}`).join('');
  }).join('');
  return escaped.replace(/^\.+/u, (dots) => dots.replaceAll('.', '%2E'));
}

function logicalAssetPath(asset: AssetDocument): string {
  return `assets/${LOGICAL_ASSET_DIRECTORIES[asset.type]}/${escapeLogicalAssetName(asset.displayName)}`;
}

type FinalizeContext = {
  input: EditableSceneCodeParseInput;
  draftSceneName: string;
  origins: ReadonlyMap<ParsedNode | ParsedChoiceOption, string>;
  oldById: ReadonlyMap<string, OldIdentity>;
};

function originObject(value: ParsedNode | ParsedChoiceOption, context: FinalizeContext): { originId?: string } {
  const originId = context.origins.get(value);
  return originId === undefined ? {} : { originId };
}

function oldNodeFor(value: ParsedNode, context: FinalizeContext): SceneNode | null {
  const id = context.origins.get(value);
  const old = id === undefined ? undefined : context.oldById.get(id)?.value;
  return old !== undefined && 'type' in old ? old as SceneNode : null;
}

function oldOptionFor(value: ParsedChoiceOption, context: FinalizeContext): SceneContentChoiceOptionDraft | null {
  const id = context.origins.get(value);
  const old = id === undefined ? undefined : context.oldById.get(id)?.value;
  return old !== undefined && !('type' in old) ? old : null;
}

function resolveAsset(reference: AssetReference, oldAssetId: string | null | undefined, context: FinalizeContext): string {
  const candidates = context.input.assets.filter((asset) =>
    asset.type === reference.expectedType && logicalAssetPath(asset) === reference.path
  );
  if (candidates.length === 0) {
    fail('missingReference', reference.token, `Asset ${reference.path} does not exist.`, { field: 'asset', reference: reference.path });
  }
  if (candidates.length === 1) return candidates[0]!.id;
  const oldCandidate = oldAssetId === null || oldAssetId === undefined
    ? undefined
    : candidates.find((candidate) => candidate.id === oldAssetId);
  if (oldCandidate !== undefined) return oldCandidate.id;
  fail('ambiguousReference', reference.token, `Asset path ${reference.path} matches more than one asset.`, { field: 'asset', reference: reference.path });
}

function resolveScene(reference: SceneReference, oldSceneId: string | undefined, context: FinalizeContext): string {
  const candidates = context.input.project.scenes.filter((scene) =>
    scene.name === reference.name ||
    (scene.id === context.input.scene.id && context.draftSceneName === reference.name)
  );
  if (candidates.length === 0) {
    fail('missingReference', reference.token, `Scene ${reference.name} does not exist.`, { field: 'target', reference: reference.name });
  }
  if (candidates.length === 1) return candidates[0]!.id;
  const oldCandidate = oldSceneId === undefined ? undefined : candidates.find((scene) => scene.id === oldSceneId);
  if (oldCandidate !== undefined) return oldCandidate.id;
  fail('ambiguousReference', reference.token, `Scene name ${reference.name} matches more than one scene.`, { field: 'target', reference: reference.name });
}

function finalizeNode(node: ParsedNode, context: FinalizeContext): SceneContentDraftNode {
  const origin = originObject(node, context);
  const old = oldNodeFor(node, context);
  switch (node.type) {
    case 'dialogue':
      return {
        ...origin,
        type: 'dialogue',
        speaker: node.speaker,
        text: node.text,
        voiceAssetId: node.voice === null ? null : resolveAsset(
          node.voice,
          old?.type === 'dialogue' ? old.voiceAssetId : undefined,
          context,
        ),
      };
    case 'background':
      return {
        ...origin,
        type: 'background',
        assetId: node.asset === null ? null : resolveAsset(
          node.asset,
          old?.type === 'background' ? old.assetId : undefined,
          context,
        ),
        scalePercent: node.scalePercent,
      };
    case 'character': {
      const assetId = node.asset === null ? null : resolveAsset(
        node.asset,
        old?.type === 'character' ? old.assetId : undefined,
        context,
      );
      return {
        ...origin,
        type: 'character',
        mode: node.mode,
        assetId,
        slot: node.mode === 'clear' && old?.type === 'character' ? old.slot : node.slot,
        layer: node.layer,
        position: node.position,
        effect: node.effect,
        scalePercent: node.scalePercent,
      };
    }
    case 'sceneJump': {
      const targetSceneId = resolveScene(
        node.target,
        old?.type === 'sceneJump' ? old.targetSceneId : undefined,
        context,
      );
      if (targetSceneId === context.input.scene.id) {
        fail('selfJump', node.target.token, 'A scene jump cannot target its containing scene.', { field: 'target', reference: node.target.name });
      }
      return { ...origin, type: 'sceneJump', targetSceneId };
    }
    case 'bgm':
      return {
        ...origin,
        type: 'bgm',
        assetId: node.asset === null ? null : resolveAsset(
          node.asset,
          old?.type === 'bgm' ? old.assetId : undefined,
          context,
        ),
      };
    case 'video':
      return {
        ...origin,
        type: 'video',
        assetId: node.asset === null ? null : resolveAsset(
          node.asset,
          old?.type === 'video' ? old.assetId : undefined,
          context,
        ),
      };
    case 'choice':
      return {
        ...origin,
        type: 'choice',
        options: node.options.map((option): SceneContentChoiceOptionDraft => {
          const previous = oldOptionFor(option, context);
          return {
            ...originObject(option, context),
            text: option.text,
            targetSceneId: resolveScene(option.target, previous?.targetSceneId, context),
          };
        }),
      };
    case 'variableSet':
      return { ...origin, type: 'variableSet', variableName: node.variableName, value: node.value };
    case 'variableChange':
      return { ...origin, type: 'variableChange', variableName: node.variableName, amount: node.amount };
    case 'if':
      return {
        ...origin,
        type: 'if',
        condition: node.condition,
        thenNodes: node.thenNodes.map((child) => finalizeNode(child, context)),
        elseNodes: node.elseNodes.map((child) => finalizeNode(child, context)),
      };
    case 'repeat':
      return { ...origin, type: 'repeat', count: node.count, bodyNodes: node.bodyNodes.map((child) => finalizeNode(child, context)) };
    case 'cg':
      return {
        ...origin,
        type: 'cg',
        assetId: resolveAsset(node.asset, old?.type === 'cgDisplay' ? old.assetId : undefined, context),
        leadInMs: node.leadInMs,
        bodyNodes: node.bodyNodes.map((child) => finalizeNode(child, context) as SceneContentDialogueDraft),
      };
    case 'storyExtension':
      return { ...origin, type: 'storyExtension' };
  }
}

type ExistingMarkers = {
  if?: { elseId: string; endId: string };
  repeat?: { endId: string };
  cg?: { endId: string };
};

function collectExistingMarkers(
  items: readonly LogicStructureItem[],
  target = new Map<string, ExistingMarkers>(),
): Map<string, ExistingMarkers> {
  for (const item of items) {
    if (item.kind === 'if') {
      target.set(item.node.id, { if: { elseId: item.elseNode.id, endId: item.endNode.id } });
      collectExistingMarkers(item.thenItems, target);
      collectExistingMarkers(item.elseItems, target);
    } else if (item.kind === 'repeat') {
      target.set(item.node.id, { repeat: { endId: item.endNode.id } });
      collectExistingMarkers(item.bodyItems, target);
    } else if (item.kind === 'cg') {
      target.set(item.node.id, { cg: { endId: item.endNode.id } });
    }
  }
  return target;
}

function materializeDraftScene(
  draft: SceneContentDraft,
  original: SceneDocument,
  oldItems: readonly LogicStructureItem[],
): SceneDocument {
  const used = new Set<string>([
    original.id,
    ...original.nodes.flatMap((node) =>
      node.type === 'choice'
        ? [node.id, ...node.options.map((option) => option.id)]
        : [node.id]
    ),
  ]);
  let counter = 0;
  const createId = (label: string): string => {
    for (;;) {
      counter += 1;
      const candidate = `__code_draft_${label}_${counter}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  };
  const idFor = (originId: string | undefined, label: string): string => {
    if (originId !== undefined) return originId;
    return createId(label);
  };
  const markers = collectExistingMarkers(oldItems);

  const flatten = (nodes: readonly SceneContentDraftNode[]): SceneNode[] =>
    nodes.flatMap((node): SceneNode[] => {
      const id = idFor(node.originId, node.type);
      switch (node.type) {
        case 'dialogue':
          return [{ id, type: 'dialogue', speaker: node.speaker, text: node.text, voiceAssetId: node.voiceAssetId }];
        case 'background':
          return [{ id, type: 'background', assetId: node.assetId, scalePercent: node.scalePercent }];
        case 'character':
          return [{ id, type: 'character', mode: node.mode, assetId: node.assetId, slot: node.slot, layer: node.layer, position: node.position, effect: node.effect, scalePercent: node.scalePercent } as SceneNode];
        case 'sceneJump':
          return [{ id, type: 'sceneJump', targetSceneId: node.targetSceneId }];
        case 'bgm':
          return [{ id, type: 'bgm', assetId: node.assetId }];
        case 'video':
          return [{ id, type: 'video', assetId: node.assetId }];
        case 'choice':
          return [{
            id,
            type: 'choice',
            options: node.options.map((option) => ({
              id: idFor(option.originId, 'option'),
              text: option.text,
              targetSceneId: option.targetSceneId,
            })),
          }];
        case 'variableSet':
          return [{ id, type: 'variableSet', variableName: node.variableName, value: node.value }];
        case 'variableChange':
          return [{ id, type: 'variableChange', variableName: node.variableName, amount: node.amount }];
        case 'if': {
          const existing = node.originId === undefined ? undefined : markers.get(node.originId)?.if;
          return [
            { id, type: 'logicIf', condition: node.condition },
            ...flatten(node.thenNodes),
            { id: existing?.elseId ?? createId('else'), type: 'logicElse', ifNodeId: id },
            ...flatten(node.elseNodes),
            { id: existing?.endId ?? createId('endif'), type: 'logicEndIf', ifNodeId: id },
          ];
        }
        case 'repeat': {
          const existing = node.originId === undefined ? undefined : markers.get(node.originId)?.repeat;
          return [
            { id, type: 'logicRepeat', count: node.count },
            ...flatten(node.bodyNodes),
            { id: existing?.endId ?? createId('endrepeat'), type: 'logicEndRepeat', repeatNodeId: id },
          ];
        }
        case 'cg': {
          const existing = node.originId === undefined ? undefined : markers.get(node.originId)?.cg;
          return [
            { id, type: 'cgDisplay', assetId: node.assetId, leadInMs: node.leadInMs },
            ...flatten(node.bodyNodes),
            { id: existing?.endId ?? createId('endcg'), type: 'cgEndDisplay', cgDisplayNodeId: id },
          ];
        }
        case 'storyExtension':
          return [{ id, type: 'storyExtension' }];
      }
    });

  return {
    ...original,
    name: draft.name,
    backgroundAssetId: draft.initialBackground.assetId,
    backgroundScalePercent: draft.initialBackground.scalePercent,
    nodes: flatten(draft.nodes),
  };
}

function collectDraftVariableNames(nodes: readonly SceneContentDraftNode[], names: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'variableSet' || node.type === 'variableChange') names.add(node.variableName);
    else if (node.type === 'if') {
      for (const operand of [node.condition.left, node.condition.right]) {
        if (operand.kind === 'variable') names.add(operand.name);
      }
      collectDraftVariableNames(node.thenNodes, names);
      collectDraftVariableNames(node.elseNodes, names);
    } else if (node.type === 'repeat') collectDraftVariableNames(node.bodyNodes, names);
    else if (node.type === 'cg') collectDraftVariableNames(node.bodyNodes, names);
  }
}

function collectSceneVariableNames(scene: SceneDocument, names: Set<string>): void {
  for (const node of scene.nodes) {
    if (node.type === 'variableSet' || node.type === 'variableChange') names.add(node.variableName);
    else if (node.type === 'logicIf') {
      for (const operand of [node.condition.left, node.condition.right]) {
        if (operand.kind === 'variable') names.add(operand.name);
      }
    }
  }
}

function validateVariableBudget(draft: SceneContentDraft, input: EditableSceneCodeParseInput): void {
  const names = new Set<string>();
  for (const scene of input.project.scenes) {
    if (scene.id !== input.scene.id) collectSceneVariableNames(scene, names);
  }
  collectDraftVariableNames(draft.nodes, names);
  if (names.size > MAX_VARIABLE_COUNT) {
    fail('variableLimit', { line: 1, column: 1 }, `A project may use at most ${MAX_VARIABLE_COUNT} variables.`, { field: 'variable' });
  }
}

function parsedSourceRanges(
  items: readonly ParsedIdentity[],
  origins: ReadonlyMap<ParsedNode | ParsedChoiceOption, string>,
): CodeSourceRange[] {
  return items.flatMap((item): CodeSourceRange[] => {
    const id = origins.get(item.value);
    if (id === undefined) return [];
    return [{
      id,
      kind: item.kind === 'choiceOption' ? 'choiceOption' : 'sceneNode',
      startLine: item.meta.startLine,
      endLine: item.meta.endLine,
    }];
  }).sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
}

export function parseEditableSceneCode(
  input: EditableSceneCodeParseInput,
): EditableSceneCodeParseResult {
  if (UTF8_ENCODER.encode(input.source).byteLength > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      diagnostics: [diagnostic('sourceTooLong', { line: 1, column: 1 }, `Story source cannot exceed ${MAX_SOURCE_BYTES} UTF-8 bytes.`)],
    };
  }

  try {
    const tokens = new Lexer(input.source).tokenize();
    const parsed = new StoryParser(tokens).parse();
    let oldItems: LogicStructureItem[];
    try {
      oldItems = parseLogicStructure(input.scene);
    } catch {
      fail('invalidStructure', { line: 1, column: 1 }, 'The current scene structure is invalid and cannot preserve author identities.');
    }
    const oldIdentities = collectOldIdentities(oldItems);
    const parsedIdentities = collectParsedIdentities(parsed.nodes);
    if (parsedIdentities.length > MAX_DRAFT_ENTITIES) {
      const overflow = parsedIdentities[MAX_DRAFT_ENTITIES];
      fail(
        'invalidStructure',
        {
          line: overflow?.meta.startLine ?? 1,
          column: overflow?.meta.startColumn ?? 1,
        },
        `A scene draft may contain at most ${MAX_DRAFT_ENTITIES} nodes and choice options.`,
        { field: 'nodes' },
      );
    }
    const origins = assignOrigins(
      parsedIdentities,
      oldIdentities,
      input.source,
      input.previousProjection,
    );
    const context: FinalizeContext = {
      input,
      draftSceneName: parsed.name,
      origins,
      oldById: new Map(oldIdentities.map((identity) => [identity.id, identity])),
    };
    const initialBackground = {
      assetId: parsed.initialBackground.asset === null
        ? null
        : resolveAsset(parsed.initialBackground.asset, input.scene.backgroundAssetId, context),
      scalePercent: parsed.initialBackground.scalePercent,
    };
    const draft: SceneContentDraft = {
      name: parsed.name,
      initialBackground,
      nodes: parsed.nodes.map((node) => finalizeNode(node, context)),
    };
    validateVariableBudget(draft, input);
    const materialized = materializeDraftScene(draft, input.scene, oldItems);
    const projection = projectSceneToReadonlyCode({
      scene: materialized,
      project: {
        scenes: input.project.scenes.map((scene) =>
          scene.id === input.scene.id ? materialized : scene
        ),
      },
      assets: input.assets,
    });
    if (projection.diagnostics.some((item) => item.severity === 'error')) {
      fail('invalidStructure', { line: 1, column: 1 }, 'The parsed scene could not be formatted canonically.');
    }
    return {
      ok: true,
      draft,
      canonicalSource: projection.source,
      diagnostics: [],
      sourceRanges: parsedSourceRanges(parsedIdentities, origins),
    };
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { ok: false, diagnostics: [error.diagnostic] };
    }
    return {
      ok: false,
      diagnostics: [diagnostic('invalidStructure', { line: 1, column: 1 }, 'Unable to parse this story source.')],
    };
  }
}
