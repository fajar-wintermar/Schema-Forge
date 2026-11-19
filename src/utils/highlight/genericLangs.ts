import { HighlightToken, pushToken } from './types';

export interface GenericLangConfig {
  keywords: Set<string>;
  types: Set<string>;
  hashComment?: boolean;
  slashComment?: boolean;
  blockComment?: boolean;
  backtickString?: boolean;
  tripleString?: boolean;
  cssMode?: boolean;
}

export const LANG_CONFIGS: Record<string, GenericLangConfig> = {
  ts: {
    slashComment: true,
    blockComment: true,
    backtickString: true,
    keywords: new Set([
      'import', 'export', 'from', 'default', 'as', 'const', 'let', 'var',
      'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
      'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new',
      'async', 'await', 'class', 'extends', 'implements', 'interface', 'type',
      'enum', 'namespace', 'declare', 'readonly', 'private', 'protected',
      'public', 'static', 'typeof', 'keyof', 'in', 'of', 'instanceof', 'void',
      'satisfies', 'yield',
    ]),
    types: new Set([
      'string', 'number', 'boolean', 'unknown', 'any', 'never', 'object',
      'bigint', 'symbol', 'undefined', 'Promise', 'Record', 'Array', 'Map',
      'Set', 'Partial', 'Required', 'Omit', 'Pick', 'Readonly', 'Date',
    ]),
  },
  js: {
    slashComment: true,
    blockComment: true,
    backtickString: true,
    keywords: new Set([
      'import', 'export', 'from', 'default', 'as', 'const', 'let', 'var',
      'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
      'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new',
      'async', 'await', 'class', 'extends', 'static', 'typeof', 'in', 'of',
      'instanceof', 'void', 'yield', 'delete',
    ]),
    types: new Set(['Promise', 'Array', 'Map', 'Set', 'Object', 'Date', 'JSON', 'Math']),
  },
  csharp: {
    slashComment: true,
    blockComment: true,
    tripleString: true,
    keywords: new Set([
      'using', 'namespace', 'public', 'private', 'protected', 'internal',
      'static', 'readonly', 'const', 'sealed', 'abstract', 'virtual',
      'override', 'partial', 'class', 'struct', 'record', 'interface', 'enum',
      'var', 'new', 'return', 'if', 'else', 'switch', 'case', 'default',
      'for', 'foreach', 'in', 'while', 'do', 'break', 'continue', 'try',
      'catch', 'finally', 'throw', 'async', 'await', 'get', 'set', 'init',
      'required', 'where', 'select', 'from', 'is', 'not', 'and', 'or', 'as',
      'nameof', 'typeof', 'void', 'out', 'ref',
    ]),
    types: new Set([
      'string', 'int', 'long', 'short', 'byte', 'bool', 'decimal', 'double',
      'float', 'char', 'object', 'Guid', 'DateTime', 'DateTimeOffset',
      'DateOnly', 'TimeOnly', 'TimeSpan', 'Task', 'List', 'Dictionary',
      'IEnumerable', 'IQueryable', 'DbSet', 'DbContext', 'ICollection',
    ]),
  },
  python: {
    hashComment: true,
    tripleString: true,
    keywords: new Set([
      'import', 'from', 'as', 'def', 'class', 'return', 'yield', 'if', 'elif',
      'else', 'for', 'in', 'while', 'break', 'continue', 'pass', 'try',
      'except', 'finally', 'raise', 'with', 'async', 'await', 'lambda', 'and',
      'or', 'not', 'is', 'global', 'nonlocal', 'assert', 'del', 'match', 'case',
    ]),
    types: new Set([
      'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'bytes',
      'Any', 'Optional', 'Union', 'List', 'Dict', 'Sequence', 'UUID', 'datetime',
    ]),
  },
  go: {
    slashComment: true,
    blockComment: true,
    backtickString: true,
    keywords: new Set([
      'package', 'import', 'func', 'return', 'var', 'const', 'type', 'struct',
      'interface', 'map', 'chan', 'if', 'else', 'for', 'range', 'switch',
      'case', 'default', 'break', 'continue', 'go', 'defer', 'select', 'fallthrough',
    ]),
    types: new Set([
      'string', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint64',
      'float32', 'float64', 'bool', 'byte', 'rune', 'error', 'any', 'context',
    ]),
  },
  prisma: {
    slashComment: true,
    blockComment: true,
    keywords: new Set([
      'datasource', 'generator', 'model', 'enum', 'type', 'view', 'provider',
      'url', 'relationMode', 'previewFeatures',
    ]),
    types: new Set([
      'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime',
      'Json', 'Bytes', 'Unsupported',
    ]),
  },
  graphql: {
    hashComment: true,
    tripleString: true,
    keywords: new Set([
      'type', 'input', 'enum', 'interface', 'union', 'scalar', 'schema',
      'query', 'mutation', 'subscription', 'fragment', 'on', 'implements',
      'extend', 'directive', 'repeatable',
    ]),
    types: new Set(['ID', 'String', 'Int', 'Float', 'Boolean', 'DateTime', 'JSON']),
  },
  css: {
    blockComment: true,
    slashComment: true,
    cssMode: true,
    keywords: new Set([
      '@media', '@import', '@keyframes', '@layer', '@apply', '@theme', 'from', 'to',
      'important',
    ]),
    types: new Set(['px', 'rem', 'em', 'vh', 'vw', 'fr', 'deg', 'ms', 's']),
  },
};

export function highlightGeneric(
  rawLines: string[],
  config: GenericLangConfig
): HighlightToken[][] {
  let inBlockComment = false;
  let inTripleDelim: '"""' | "'''" | null = null;
  let inBacktick = false;

  return rawLines.map((line) => {
    const tokens: HighlightToken[] = [];
    let i = 0;
    const len = line.length;

    while (i < len) {
      if (inBlockComment) {
        const endIdx = line.indexOf('*/', i);
        if (endIdx === -1) {
          pushToken(tokens, 'comment', line.slice(i));
          break;
        }
        pushToken(tokens, 'comment', line.slice(i, endIdx + 2));
        i = endIdx + 2;
        inBlockComment = false;
        continue;
      }

      if (inTripleDelim) {
        const endIdx = line.indexOf(inTripleDelim, i);
        if (endIdx === -1) {
          pushToken(tokens, 'string', line.slice(i));
          break;
        }
        pushToken(tokens, 'string', line.slice(i, endIdx + 3));
        i = endIdx + 3;
        inTripleDelim = null;
        continue;
      }

      if (inBacktick) {
        const endIdx = line.indexOf('`', i);
        if (endIdx === -1) {
          pushToken(tokens, 'string', line.slice(i));
          break;
        }
        pushToken(tokens, 'string', line.slice(i, endIdx + 1));
        i = endIdx + 1;
        inBacktick = false;
        continue;
      }

      const ch = line[i];

      if (ch === ' ' || ch === '\t' || ch === '\r') {
        let j = i + 1;
        while (j < len && (line[j] === ' ' || line[j] === '\t' || line[j] === '\r')) j++;
        pushToken(tokens, 'plain', line.slice(i, j));
        i = j;
        continue;
      }

      if (config.slashComment && ch === '/' && line[i + 1] === '/') {
        pushToken(tokens, 'comment', line.slice(i));
        break;
      }

      if (config.hashComment && ch === '#') {
        pushToken(tokens, 'comment', line.slice(i));
        break;
      }

      if (config.blockComment && ch === '/' && line[i + 1] === '*') {
        const endIdx = line.indexOf('*/', i + 2);
        if (endIdx === -1) {
          pushToken(tokens, 'comment', line.slice(i));
          inBlockComment = true;
          break;
        }
        pushToken(tokens, 'comment', line.slice(i, endIdx + 2));
        i = endIdx + 2;
        continue;
      }

      if (config.tripleString && (line.startsWith('"""', i) || line.startsWith("'''", i))) {
        const delim = line.slice(i, i + 3) as '"""' | "'''";
        const endIdx = line.indexOf(delim, i + 3);
        if (endIdx === -1) {
          pushToken(tokens, 'string', line.slice(i));
          inTripleDelim = delim;
          break;
        }
        pushToken(tokens, 'string', line.slice(i, endIdx + 3));
        i = endIdx + 3;
        continue;
      }

      if (config.backtickString && ch === '`') {
        let j = i + 1;
        while (j < len && line[j] !== '`') {
          if (line[j] === '\\' && j + 1 < len) j += 2;
          else j++;
        }
        if (j >= len) {
          pushToken(tokens, 'string', line.slice(i));
          inBacktick = true;
          break;
        }
        pushToken(tokens, 'string', line.slice(i, j + 1));
        i = j + 1;
        continue;
      }

      if (ch === '"' || ch === "'") {
        const quote = ch;
        let j = i + 1;
        while (j < len && line[j] !== quote) {
          if (line[j] === '\\' && j + 1 < len) j += 2;
          else j++;
        }
        if (j < len) j++;
        pushToken(tokens, 'string', line.slice(i, j));
        i = j;
        continue;
      }

      if (config.cssMode && ch === '#' && /^#[0-9a-fA-F]{3,8}\b/.test(line.slice(i))) {
        const hm = line.slice(i).match(/^#[0-9a-fA-F]{3,8}/)!;
        pushToken(tokens, 'decorator', hm[0]);
        i += hm[0].length;
        continue;
      }

      if (ch === '@' && /[A-Za-z_]/.test(line[i + 1] || '')) {
        const dm = line.slice(i).match(/^@[A-Za-z_][A-Za-z0-9_.]*/)!;
        pushToken(tokens, 'decorator', dm[0]);
        i += dm[0].length;
        continue;
      }

      if (ch === '[' && /^\s*\[[A-Za-z_][A-Za-z0-9_.]*/.test(line.slice(0, i + 20))) {
        const am = line.slice(i).match(/^\[[A-Za-z_][A-Za-z0-9_.]*(?:\([^)]*\))?\]/);
        if (am) {
          pushToken(tokens, 'decorator', am[0]);
          i += am[0].length;
          continue;
        }
      }

      const numMatch = line.slice(i).match(/^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?:px|rem|em|vh|vw|%|ms|s)?/);
      if (numMatch && (i === 0 || !/[A-Za-z_$]/.test(line[i - 1]))) {
        pushToken(tokens, 'number', numMatch[0]);
        i += numMatch[0].length;
        continue;
      }

      if (line.startsWith('=>', i) || line.startsWith('===', i) || line.startsWith('!==', i) || line.startsWith('??', i) || line.startsWith('?.', i)) {
        const op = line.startsWith('===', i) || line.startsWith('!==', i) ? line.slice(i, i + 3) : line.slice(i, i + 2);
        pushToken(tokens, 'operator', op);
        i += op.length;
        continue;
      }

      if ('+-*/%=<>!&|^~?:'.includes(ch)) {
        pushToken(tokens, 'operator', ch);
        i++;
        continue;
      }

      if ('{}[]().,;'.includes(ch)) {
        pushToken(tokens, 'punctuation', ch);
        i++;
        continue;
      }

      if (/[A-Za-z_$]/.test(ch)) {
        const idPattern = config.cssMode
          ? /^[A-Za-z_$-][A-Za-z0-9_$-]*/
          : /^[A-Za-z_$][A-Za-z0-9_$]*/;
        const wm = line.slice(i).match(idPattern)!;
        const word = wm[0];
        const prevNonWs = line.slice(0, i).trimEnd();
        const prevChar = prevNonWs[prevNonWs.length - 1] || '';
        const nextChar = line[i + word.length] || '';

        if (word === 'true' || word === 'false' || word === 'null' || word === 'None' || word === 'nil' || word === 'True' || word === 'False') {
          pushToken(tokens, 'boolean', word);
        } else if (config.keywords.has(word)) {
          pushToken(tokens, 'keyword', word);
        } else if (config.types.has(word)) {
          pushToken(tokens, 'type', word);
        } else if (config.cssMode && line.slice(i + word.length).trimStart().startsWith(':')) {
          pushToken(tokens, 'property', word);
        } else if (nextChar === '(') {
          pushToken(tokens, 'identifier', word);
        } else if (prevChar === '.' || line.slice(i + word.length).trimStart().startsWith(':')) {
          pushToken(tokens, 'property', word);
        } else if (/^[A-Z][A-Za-z0-9_]*$/.test(word)) {
          pushToken(tokens, 'type', word);
        } else {
          pushToken(tokens, 'plain', word);
        }
        i += word.length;
        continue;
      }

      pushToken(tokens, 'plain', ch);
      i++;
    }

    return tokens;
  });
}
