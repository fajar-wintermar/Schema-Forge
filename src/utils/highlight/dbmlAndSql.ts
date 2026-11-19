import { HighlightToken, HighlightTokenType, pushToken } from './types';

const DBML_TOP_KEYWORDS = new Set([
  'project',
  'table',
  'tablepartial',
  'tablegroup',
  'enum',
  'ref',
  'note',
  'indexes',
  'checks',
  'as',
]);

const DBML_SETTING_KEYWORDS = new Set([
  'pk',
  'primary',
  'key',
  'increment',
  'not',
  'null',
  'unique',
  'default',
  'note',
  'ref',
  'delete',
  'update',
  'cascade',
  'restrict',
  'set',
  'no',
  'action',
  'type',
  'name',
  'color',
  'headercolor',
  'btree',
  'hash',
  'check',
  'database_type',
]);

const DBML_TYPES = new Set([
  'int', 'integer', 'bigint', 'smallint', 'tinyint', 'serial', 'bigserial',
  'float', 'double', 'decimal', 'numeric', 'real', 'boolean', 'bool',
  'varchar', 'nvarchar', 'char', 'nchar', 'text', 'citext', 'uuid', 'date',
  'datetime', 'datetime2', 'timestamp', 'timestamptz', 'time', 'interval',
  'json', 'jsonb', 'xml', 'bytea', 'blob', 'binary', 'varbinary', 'inet',
  'cidr', 'macaddr', 'point', 'geometry', 'geography', 'vector', 'tsvector',
]);

export function highlightDbml(rawLines: string[]): HighlightToken[][] {
  let inBlockComment = false;
  let inTripleQuote = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let blockKind: string | null = null;

  return rawLines.map((line) => {
    const tokens: HighlightToken[] = [];
    let i = 0;
    const len = line.length;
    let lineWordIdx = 0;

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

      if (inTripleQuote) {
        const endIdx = line.indexOf("'''", i);
        if (endIdx === -1) {
          pushToken(tokens, 'string', line.slice(i));
          break;
        }
        pushToken(tokens, 'string', line.slice(i, endIdx + 3));
        i = endIdx + 3;
        inTripleQuote = false;
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

      if (ch === '/' && line[i + 1] === '/') {
        pushToken(tokens, 'comment', line.slice(i));
        break;
      }

      if (ch === '/' && line[i + 1] === '*') {
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

      if (line.startsWith("'''", i)) {
        const endIdx = line.indexOf("'''", i + 3);
        if (endIdx === -1) {
          pushToken(tokens, 'string', line.slice(i));
          inTripleQuote = true;
          break;
        }
        pushToken(tokens, 'string', line.slice(i, endIdx + 3));
        i = endIdx + 3;
        lineWordIdx++;
        continue;
      }

      if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        let j = i + 1;
        while (j < len && line[j] !== quote) {
          if (line[j] === '\\' && j + 1 < len) j += 2;
          else j++;
        }
        if (j < len) j++;
        pushToken(tokens, quote === '`' ? 'identifier' : 'string', line.slice(i, j));
        i = j;
        lineWordIdx++;
        continue;
      }

      if (ch === '#' && /^#[0-9a-fA-F]{3,8}\b/.test(line.slice(i))) {
        const m = line.slice(i).match(/^#[0-9a-fA-F]{3,8}/)!;
        pushToken(tokens, 'decorator', m[0]);
        i += m[0].length;
        lineWordIdx++;
        continue;
      }

      if (ch === '<' && line[i + 1] === '>') {
        pushToken(tokens, 'operator', '<>');
        i += 2;
        continue;
      }

      if ('{}[]():,.<>-'.includes(ch)) {
        if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (ch === '{') braceDepth++;
        else if (ch === '}') {
          braceDepth = Math.max(0, braceDepth - 1);
          if (braceDepth === 0) blockKind = null;
        }
        const isRelOp = '<>-'.includes(ch) && bracketDepth === 0;
        pushToken(tokens, isRelOp ? 'operator' : 'punctuation', ch);
        i++;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        let j = i + 1;
        while (j < len && /[0-9.]/.test(line[j])) j++;
        pushToken(tokens, 'number', line.slice(i, j));
        i = j;
        lineWordIdx++;
        continue;
      }

      let j = i;
      while (
        j < len &&
        !/[\s{}\[\]():,.<>'"`\-]/.test(line[j]) &&
        !(line[j] === '/' && (line[j + 1] === '/' || line[j + 1] === '*'))
      ) {
        j++;
      }
      if (j === i) {
        pushToken(tokens, 'plain', ch);
        i++;
        continue;
      }

      const word = line.slice(i, j);
      const lower = word.toLowerCase();
      let tokType: HighlightTokenType = 'plain';

      if (DBML_TOP_KEYWORDS.has(lower) && bracketDepth === 0 && lineWordIdx === 0) {
        tokType = 'keyword';
        if (
          lower === 'table' ||
          lower === 'tablepartial' ||
          lower === 'enum' ||
          lower === 'tablegroup' ||
          lower === 'project' ||
          lower === 'indexes'
        ) {
          blockKind = lower;
        }
      } else if (lower === 'as' && braceDepth === 0) {
        tokType = 'keyword';
      } else if (bracketDepth > 0 && DBML_SETTING_KEYWORDS.has(lower)) {
        tokType = 'property';
      } else if (
        (lower === 'true' || lower === 'false' || lower === 'null') &&
        bracketDepth > 0
      ) {
        tokType = 'boolean';
      } else if (
        blockKind === 'table' &&
        braceDepth === 1 &&
        bracketDepth === 0 &&
        lineWordIdx === 1
      ) {
        tokType = DBML_TYPES.has(lower) ? 'type' : 'type';
      } else if (
        braceDepth === 0 &&
        lineWordIdx === 1 &&
        (blockKind === 'table' ||
          blockKind === 'tablepartial' ||
          blockKind === 'enum' ||
          blockKind === 'project' ||
          blockKind === 'tablegroup')
      ) {
        tokType = 'identifier';
      } else if (blockKind === 'project' && braceDepth === 1 && lineWordIdx === 0) {
        tokType = 'property';
      }

      pushToken(tokens, tokType, word);
      i = j;
      lineWordIdx++;
    }

    return tokens;
  });
}

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'join', 'inner', 'left', 'right', 'full', 'outer',
  'cross', 'on', 'as', 'and', 'or', 'not', 'in', 'is', 'exists', 'between',
  'like', 'ilike', 'similar', 'to', 'group', 'by', 'having', 'order', 'asc',
  'desc', 'nulls', 'first', 'last', 'limit', 'offset', 'fetch', 'next', 'rows',
  'only', 'union', 'intersect', 'except', 'all', 'distinct', 'insert', 'into',
  'values', 'update', 'set', 'delete', 'merge', 'create', 'replace', 'alter',
  'drop', 'truncate', 'table', 'index', 'unique', 'primary', 'key', 'foreign',
  'references', 'constraint', 'default', 'check', 'cascade', 'restrict', 'if',
  'begin', 'commit', 'rollback', 'transaction', 'explain', 'analyze', 'with',
  'recursive', 'returning', 'conflict', 'do', 'nothing', 'case', 'when', 'then',
  'else', 'end', 'cast', 'over', 'partition', 'trigger', 'function', 'procedure',
  'view', 'materialized', 'schema', 'extension', 'grant', 'revoke', 'comment',
  'using', 'concurrently', 'generated', 'always', 'identity', 'enable', 'disable',
  'vacuum', 'reindex', 'declare', 'returns', 'language', 'volatile', 'stable',
  'immutable', 'for', 'each', 'row', 'before', 'after', 'instead', 'of',
]);

const SQL_TYPES = new Set([
  'int', 'integer', 'int2', 'int4', 'int8', 'bigint', 'smallint', 'tinyint',
  'serial', 'smallserial', 'bigserial', 'numeric', 'decimal', 'real', 'double',
  'precision', 'float', 'float4', 'float8', 'boolean', 'bool', 'varchar',
  'nvarchar', 'character', 'varying', 'char', 'nchar', 'text', 'citext', 'uuid',
  'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval', 'json',
  'jsonb', 'xml', 'bytea', 'blob', 'inet', 'cidr', 'macaddr', 'vector',
  'tsvector', 'tsquery', 'oid', 'void', 'record',
]);

export function highlightSql(rawLines: string[]): HighlightToken[][] {
  let inBlockComment = false;
  let dollarTag: string | null = null;

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

      if (dollarTag !== null) {
        const endIdx = line.indexOf(dollarTag, i);
        if (endIdx === -1) {
          pushToken(tokens, 'string', line.slice(i));
          break;
        }
        pushToken(tokens, 'string', line.slice(i, endIdx + dollarTag.length));
        i = endIdx + dollarTag.length;
        dollarTag = null;
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

      if ((ch === '-' && line[i + 1] === '-') || ch === '#') {
        pushToken(tokens, 'comment', line.slice(i));
        break;
      }

      if (ch === '/' && line[i + 1] === '*') {
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

      if (ch === '$') {
        const numParam = line.slice(i).match(/^\$[0-9]+\b/);
        if (numParam) {
          pushToken(tokens, 'variable', numParam[0]);
          i += numParam[0].length;
          continue;
        }
        const tagMatch = line.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
        if (tagMatch) {
          const tag = tagMatch[0];
          const closeIdx = line.indexOf(tag, i + tag.length);
          if (closeIdx === -1) {
            pushToken(tokens, 'string', line.slice(i));
            dollarTag = tag;
            break;
          }
          pushToken(tokens, 'string', line.slice(i, closeIdx + tag.length));
          i = closeIdx + tag.length;
          continue;
        }
      }

      if (ch === "'") {
        let j = i + 1;
        while (j < len) {
          if (line[j] === "'" && line[j + 1] === "'") {
            j += 2;
          } else if (line[j] === '\\' && j + 1 < len) {
            j += 2;
          } else if (line[j] === "'") {
            j++;
            break;
          } else {
            j++;
          }
        }
        pushToken(tokens, 'string', line.slice(i, j));
        i = j;
        continue;
      }

      if (ch === '"' || ch === '`') {
        const quote = ch;
        let j = i + 1;
        while (j < len && line[j] !== quote) j++;
        if (j < len) j++;
        pushToken(tokens, 'identifier', line.slice(i, j));
        i = j;
        continue;
      }

      if ((ch === ':' || ch === '@') && /[A-Za-z_]/.test(line[i + 1] || '')) {
        const m = line.slice(i).match(/^[:@][A-Za-z_][A-Za-z0-9_]*/)!;
        pushToken(tokens, 'variable', m[0]);
        i += m[0].length;
        continue;
      }

      const twoOrThree = line.slice(i, i + 3);
      if (twoOrThree === '->>' || twoOrThree === '#>>') {
        pushToken(tokens, 'operator', twoOrThree);
        i += 3;
        continue;
      }
      const two = line.slice(i, i + 2);
      if (
        two === '::' ||
        two === '->' ||
        two === '#>' ||
        two === '||' ||
        two === '!=' ||
        two === '<>' ||
        two === '<=' ||
        two === '>='
      ) {
        pushToken(tokens, 'operator', two);
        i += 2;
        continue;
      }

      if ('=<>+-*/%~^'.includes(ch)) {
        pushToken(tokens, 'operator', ch);
        i++;
        continue;
      }

      if ('(),.;[]{}'.includes(ch)) {
        pushToken(tokens, 'punctuation', ch);
        i++;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        const m = line.slice(i).match(/^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
        if (m) {
          pushToken(tokens, 'number', m[0]);
          i += m[0].length;
          continue;
        }
      }

      if (/[A-Za-z_]/.test(ch)) {
        const m = line.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)!;
        const word = m[0];
        const lower = word.toLowerCase();
        const nextChar = line[i + word.length];
        if (lower === 'true' || lower === 'false' || lower === 'null') {
          pushToken(tokens, 'boolean', word);
        } else if (SQL_KEYWORDS.has(lower)) {
          pushToken(tokens, 'keyword', word);
        } else if (SQL_TYPES.has(lower)) {
          pushToken(tokens, 'type', word);
        } else if (nextChar === '(') {
          pushToken(tokens, 'identifier', word);
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
