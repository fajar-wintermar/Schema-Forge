import { StreamLanguage, StringStream } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import {
  BUILTIN_TYPES,
  SETTING_KEYWORDS,
  TOP_KEYWORDS,
} from '../dbmlLanguage';

interface DbmlStreamState {
  inBlockComment: boolean;
  inTripleQuote: boolean;
  quoteChar: "'" | '"' | '`' | null;
  braceDepth: number;
  bracketDepth: number;
  blockKind:
    | 'table'
    | 'tablepartial'
    | 'enum'
    | 'tablegroup'
    | 'project'
    | 'indexes'
    | 'checks'
    | null;
  lineWordIndex: number;
}

const DBML_TOKEN_TABLE = {
  comment: tags.comment,
  string: tags.string,
  backtickExpr: tags.special(tags.string),
  hexColor: tags.color,
  partialRef: tags.atom,
  keyword: tags.keyword,
  className: tags.className,
  typeName: tags.typeName,
  propertyName: tags.propertyName,
  number: tags.number,
  bool: tags.bool,
  operator: tags.operator,
  punctuation: tags.punctuation,
  variableName: tags.variableName,
};

export function createDbmlStreamLanguage(enumNames: string[]) {
  const enumNameSet = new Set(
    enumNames.flatMap((n) => [n, n.toLowerCase()])
  );

  return StreamLanguage.define<DbmlStreamState>({
    name: 'dbml',
    tokenTable: DBML_TOKEN_TABLE,
    startState: () => ({
      inBlockComment: false,
      inTripleQuote: false,
      quoteChar: null,
      braceDepth: 0,
      bracketDepth: 0,
      blockKind: null,
      lineWordIndex: 0,
    }),
    blankLine: (state) => {
      state.lineWordIndex = 0;
    },
    token: (stream: StringStream, state: DbmlStreamState) => {
      if (stream.sol()) {
        state.lineWordIndex = 0;
      }

      if (state.inBlockComment) {
        if (stream.skipTo('*/')) {
          stream.pos += 2;
          state.inBlockComment = false;
        } else {
          stream.skipToEnd();
        }
        return 'comment';
      }

      if (state.inTripleQuote) {
        while (!stream.eol()) {
          if (stream.match("'''")) {
            state.inTripleQuote = false;
            state.lineWordIndex++;
            return 'string';
          }
          if (stream.peek() === '\\') {
            stream.next();
          }
          stream.next();
        }
        return 'string';
      }

      if (state.quoteChar) {
        const q = state.quoteChar;
        const tokType = q === '`' ? 'backtickExpr' : 'string';
        while (!stream.eol()) {
          const ch = stream.next();
          if (ch === '\\') {
            stream.next();
          } else if (ch === q) {
            state.quoteChar = null;
            state.lineWordIndex++;
            return tokType;
          }
        }
        // Single-line quotes normally close on line; keep state safe
        state.quoteChar = null;
        return tokType;
      }

      if (stream.eatSpace()) {
        return null;
      }

      if (stream.match('//')) {
        stream.skipToEnd();
        return 'comment';
      }

      if (stream.match('/*')) {
        state.inBlockComment = true;
        if (stream.skipTo('*/')) {
          stream.pos += 2;
          state.inBlockComment = false;
        } else {
          stream.skipToEnd();
        }
        return 'comment';
      }

      if (stream.match("'''")) {
        state.inTripleQuote = true;
        while (!stream.eol()) {
          if (stream.match("'''")) {
            state.inTripleQuote = false;
            state.lineWordIndex++;
            return 'string';
          }
          if (stream.peek() === '\\') {
            stream.next();
          }
          stream.next();
        }
        return 'string';
      }

      const nextCh = stream.peek();
      if (nextCh === "'" || nextCh === '"' || nextCh === '`') {
        const q = stream.next() as "'" | '"' | '`';
        const tokType = q === '`' ? 'backtickExpr' : 'string';
        while (!stream.eol()) {
          const ch = stream.next();
          if (ch === '\\') {
            stream.next();
          } else if (ch === q) {
            state.lineWordIndex++;
            return tokType;
          }
        }
        return tokType;
      }

      if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) {
        state.lineWordIndex++;
        return 'hexColor';
      }

      if (stream.match(/^~[a-zA-Z0-9_.]*/)) {
        state.lineWordIndex++;
        return 'partialRef';
      }

      if (stream.match('<>')) {
        return 'operator';
      }

      if (nextCh && '{}[]():,.<>-'.includes(nextCh)) {
        const ch = stream.next()!;
        if (ch === '[') state.bracketDepth++;
        else if (ch === ']') state.bracketDepth = Math.max(0, state.bracketDepth - 1);
        else if (ch === '{') state.braceDepth++;
        else if (ch === '}') {
          state.braceDepth = Math.max(0, state.braceDepth - 1);
          if (state.braceDepth === 0) state.blockKind = null;
        }
        const isRelOp = '<>-'.includes(ch) && state.bracketDepth === 0;
        return isRelOp ? 'operator' : 'punctuation';
      }

      if (stream.match(/^[0-9]+(?:\.[0-9]+)?/)) {
        state.lineWordIndex++;
        return 'number';
      }

      if (stream.match(/^[^\s{}\[\]():,.<>'"`\-~]+/)) {
        const word = stream.current();
        const lower = word.toLowerCase();
        const wordIdx = state.lineWordIndex;
        state.lineWordIndex++;

        if (TOP_KEYWORDS.has(lower) && state.bracketDepth === 0 && wordIdx === 0) {
          if (
            lower === 'table' ||
            lower === 'tablepartial' ||
            lower === 'enum' ||
            lower === 'tablegroup' ||
            lower === 'project' ||
            lower === 'indexes' ||
            lower === 'checks'
          ) {
            state.blockKind = lower;
          }
          return 'keyword';
        }

        if (lower === 'as' && state.braceDepth === 0) {
          return 'keyword';
        }

        if (state.bracketDepth > 0 && SETTING_KEYWORDS.has(lower)) {
          return 'propertyName';
        }

        if (
          (lower === 'true' || lower === 'false' || lower === 'null') &&
          state.bracketDepth > 0
        ) {
          return 'bool';
        }

        if (
          (state.blockKind === 'table' || state.blockKind === 'tablepartial') &&
          state.braceDepth === 1 &&
          state.bracketDepth === 0 &&
          wordIdx === 1 &&
          (BUILTIN_TYPES.has(lower) ||
            enumNameSet.has(lower) ||
            enumNameSet.has(word))
        ) {
          return 'typeName';
        }

        if (
          (state.blockKind === 'table' || state.blockKind === 'tablepartial') &&
          state.braceDepth === 1 &&
          state.bracketDepth === 0 &&
          wordIdx === 1
        ) {
          return 'typeName';
        }

        if (
          state.braceDepth === 0 &&
          wordIdx === 1 &&
          (state.blockKind === 'table' ||
            state.blockKind === 'tablepartial' ||
            state.blockKind === 'enum' ||
            state.blockKind === 'project' ||
            state.blockKind === 'tablegroup')
        ) {
          return 'className';
        }

        return 'variableName';
      }

      stream.next();
      return null;
    },
    languageData: {
      commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
      closeBrackets: { brackets: ['(', '[', '{', "'", '"', '`'] },
    },
  });
}
