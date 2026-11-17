export type HighlightTokenType =
  | 'plain'
  | 'comment'
  | 'keyword'
  | 'type'
  | 'string'
  | 'number'
  | 'boolean'
  | 'property'
  | 'identifier'
  | 'operator'
  | 'punctuation'
  | 'variable'
  | 'decorator'
  | 'added'
  | 'removed'
  | 'meta';

export interface HighlightToken {
  type: HighlightTokenType;
  text: string;
}

export interface HighlightResult {
  language: string;
  autoDetected: boolean;
  lines: HighlightToken[][];
}

export const TOKEN_CLASS_MAP: Record<HighlightTokenType, string> = {
  plain: 'text-slate-100',
  comment: 'text-slate-500 italic',
  keyword: 'text-violet-400 font-medium',
  type: 'text-emerald-300',
  string: 'text-amber-300',
  number: 'text-orange-300',
  boolean: 'text-orange-300 font-medium',
  property: 'text-sky-300',
  identifier: 'text-cyan-300',
  operator: 'text-sky-400',
  punctuation: 'text-slate-400',
  variable: 'text-teal-300',
  decorator: 'text-pink-400',
  added: 'text-emerald-300',
  removed: 'text-rose-300',
  meta: 'text-cyan-400 font-semibold',
};

const LANGUAGE_ALIASES: Record<string, string> = {
  dbml: 'dbml',
  sql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  pgsql: 'sql',
  plpgsql: 'sql',
  mysql: 'sql',
  sqlite: 'sql',
  tsql: 'sql',
  mssql: 'sql',
  ddl: 'sql',
  dml: 'sql',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  ts: 'ts',
  tsx: 'ts',
  typescript: 'ts',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'js',
  javascript: 'js',
  mjs: 'js',
  cjs: 'js',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  terminal: 'bash',
  fish: 'bash',
  curl: 'bash',
  http: 'bash',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'toml',
  env: 'toml',
  dotenv: 'toml',
  cs: 'csharp',
  csharp: 'csharp',
  'c#': 'csharp',
  dotnet: 'csharp',
  py: 'python',
  python: 'python',
  go: 'go',
  golang: 'go',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  xhtml: 'xml',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  diff: 'diff',
  patch: 'diff',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
  plaintext: 'text',
};

export function normalizeCodeLanguage(raw?: string): string {
  if (!raw) return '';
  const cleaned = raw.trim().toLowerCase().replace(/^language-/, '');
  return LANGUAGE_ALIASES[cleaned] || cleaned;
}

export function detectCodeLanguage(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return 'text';

  const lines = trimmed.split('\n').slice(0, 25);

  if (
    lines.some((l) => /^@@\s+-\d+/.test(l)) ||
    (lines.some((l) => /^\+\+\+\s/.test(l)) && lines.some((l) => /^---\s/.test(l)))
  ) {
    return 'diff';
  }

  if (
    (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
    /"[^"\n]+"\s*:/.test(trimmed) &&
    !/\b(Table|Project|Enum|function|const|class|SELECT)\b/.test(trimmed)
  ) {
    return 'json';
  }

  if (
    /^(?:Table|TablePartial|TableGroup|Enum|Project)\s+(?:[A-Za-z_"][A-Za-z0-9_."]*)\s*\{/m.test(
      trimmed
    ) ||
    /^Ref(?:\s+[A-Za-z0-9_]+)?\s*:\s*[^\n]+[<>\-]/m.test(trimmed) ||
    /\[(?:[^\]]*\b(?:pk|increment|not null)\b[^\]]*)\]/i.test(trimmed)
  ) {
    return 'dbml';
  }

  if (
    /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA|TRIGGER|FUNCTION)|ALTER\s+TABLE|DROP\s+TABLE|EXPLAIN\s+ANALYZE|WITH\s+[A-Za-z0-9_]+\s+AS\s*\()\b/i.test(
      trimmed
    )
  ) {
    return 'sql';
  }

  if (
    trimmed.startsWith('#!') ||
    /^(?:\$\s+)?(?:curl|git|npm|npx|pnpm|yarn|docker|psql|dotnet|chmod|mkdir|export|set\s+-e|echo|cat)\b/m.test(
      trimmed
    )
  ) {
    return 'bash';
  }

  if (
    /^<[A-Za-z!?][\w:-]*(?:\s|>|$)/.test(trimmed) &&
    /<\/[A-Za-z][\w:-]*>|\/\s*>$/.test(trimmed)
  ) {
    return 'xml';
  }

  if (
    /\b(?:namespace\s+[A-Za-z0-9_.]+|public\s+(?:class|record|interface|enum)|using\s+System|DbSet<|\[Key\]|\[Required\])/.test(
      trimmed
    )
  ) {
    return 'csharp';
  }

  if (
    /\b(?:import\s+.*?\s+from\s+|export\s+(?:default\s+|const\s+|function\s+|interface\s+|type\s+)|interface\s+[A-Z]\w*|const\s+\w+\s*=|async\s+function\s+\w+|=>)/.test(
      trimmed
    )
  ) {
    return /\b(?:interface|type\s+\w+\s*=|:\s*(?:string|number|boolean|Record|Array)<|as\s+const)\b/.test(
      trimmed
    )
      ? 'ts'
      : 'js';
  }

  if (/^(?:def\s+\w+\(|from\s+\w+\s+import|class\s+\w+\(|if\s+__name__\s*==)/m.test(trimmed)) {
    return 'python';
  }

  if (/^(?:package\s+\w+|func\s+\w+\(|type\s+\w+\s+struct\s*\{)/m.test(trimmed)) {
    return 'go';
  }

  const yamlLines = lines.filter((l) =>
    /^\s*(?:-\s+)?[A-Za-z0-9_.-]+:\s*(?:.+)?$/.test(l)
  );
  if (
    yamlLines.length >= 2 &&
    !trimmed.includes('{') &&
    !trimmed.includes(';')
  ) {
    return 'yaml';
  }

  return 'text';
}

function pushToken(
  tokens: HighlightToken[],
  type: HighlightTokenType,
  text: string
) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    tokens.push({ type, text });
  }
}

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
  'int',
  'integer',
  'bigint',
  'smallint',
  'tinyint',
  'serial',
  'bigserial',
  'float',
  'double',
  'decimal',
  'numeric',
  'real',
  'boolean',
  'bool',
  'varchar',
  'nvarchar',
  'char',
  'nchar',
  'text',
  'citext',
  'uuid',
  'date',
  'datetime',
  'datetime2',
  'timestamp',
  'timestamptz',
  'time',
  'interval',
  'json',
  'jsonb',
  'xml',
  'bytea',
  'blob',
  'binary',
  'varbinary',
  'inet',
  'cidr',
  'macaddr',
  'point',
  'geometry',
  'geography',
  'vector',
  'tsvector',
]);

function highlightDbml(rawLines: string[]): HighlightToken[][] {
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

function highlightSql(rawLines: string[]): HighlightToken[][] {
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

      // PostgreSQL dollar-quoted string ($tag$...$tag$ or $$...$$)
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

      // Single-quoted SQL string (with '' escape)
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

      // Quoted identifiers ("col" or `col`)
      if (ch === '"' || ch === '`') {
        const quote = ch;
        let j = i + 1;
        while (j < len && line[j] !== quote) j++;
        if (j < len) j++;
        pushToken(tokens, 'identifier', line.slice(i, j));
        i = j;
        continue;
      }

      // :param or @param
      if ((ch === ':' || ch === '@') && /[A-Za-z_]/.test(line[i + 1] || '')) {
        const m = line.slice(i).match(/^[:@][A-Za-z_][A-Za-z0-9_]*/)!;
        pushToken(tokens, 'variable', m[0]);
        i += m[0].length;
        continue;
      }

      // Multi-char SQL operators
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

function highlightJson(rawLines: string[]): HighlightToken[][] {
  let inBlockComment = false;

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

      if (ch === '"') {
        let j = i + 1;
        while (j < len && line[j] !== '"') {
          if (line[j] === '\\' && j + 1 < len) j += 2;
          else j++;
        }
        if (j < len) j++;
        const afterStr = line.slice(j).trimStart();
        const isKey = afterStr.startsWith(':');
        pushToken(tokens, isKey ? 'property' : 'string', line.slice(i, j));
        i = j;
        continue;
      }

      if ('{}[],:'.includes(ch)) {
        pushToken(tokens, 'punctuation', ch);
        i++;
        continue;
      }

      const numMatch = line.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (numMatch) {
        pushToken(tokens, 'number', numMatch[0]);
        i += numMatch[0].length;
        continue;
      }

      const boolMatch = line.slice(i).match(/^(?:true|false|null)\b/);
      if (boolMatch) {
        pushToken(tokens, 'boolean', boolMatch[0]);
        i += boolMatch[0].length;
        continue;
      }

      pushToken(tokens, 'plain', ch);
      i++;
    }

    return tokens;
  });
}

const BASH_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while',
  'until', 'case', 'esac', 'function', 'set', 'export', 'local', 'readonly',
  'unset', 'return', 'exit', 'echo', 'printf', 'read', 'cd', 'ls', 'cat',
  'grep', 'sed', 'awk', 'find', 'sort', 'uniq', 'wc', 'head', 'tail', 'cut',
  'tr', 'xargs', 'tee', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'chmod', 'chown',
  'curl', 'wget', 'jq', 'git', 'npm', 'npx', 'pnpm', 'yarn', 'node', 'tsx',
  'docker', 'psql', 'pg_dump', 'pg_restore', 'dotnet', 'python', 'python3',
  'pip', 'go', 'make', 'sudo', 'env', 'source',
]);

function highlightBash(rawLines: string[]): HighlightToken[][] {
  return rawLines.map((line, lineIdx) => {
    const tokens: HighlightToken[] = [];
    let i = 0;
    const len = line.length;

    if (lineIdx === 0 && line.startsWith('#!')) {
      pushToken(tokens, 'meta', line);
      return tokens;
    }

    while (i < len) {
      const ch = line[i];

      if (ch === ' ' || ch === '\t' || ch === '\r') {
        let j = i + 1;
        while (j < len && (line[j] === ' ' || line[j] === '\t' || line[j] === '\r')) j++;
        pushToken(tokens, 'plain', line.slice(i, j));
        i = j;
        continue;
      }

      if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
        pushToken(tokens, 'comment', line.slice(i));
        break;
      }

      // Single-quoted literal string
      if (ch === "'") {
        let j = i + 1;
        while (j < len && line[j] !== "'") j++;
        if (j < len) j++;
        pushToken(tokens, 'string', line.slice(i, j));
        i = j;
        continue;
      }

      // Double-quoted string with $VAR / ${...} highlighting
      if (ch === '"') {
        pushToken(tokens, 'string', '"');
        i++;
        while (i < len && line[i] !== '"') {
          if (line[i] === '\\' && i + 1 < len) {
            pushToken(tokens, 'string', line.slice(i, i + 2));
            i += 2;
            continue;
          }
          if (line[i] === '$') {
            const vm = line.slice(i).match(/^\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*|[0-9?*@#])/);
            if (vm) {
              pushToken(tokens, 'variable', vm[0]);
              i += vm[0].length;
              continue;
            }
          }
          pushToken(tokens, 'string', line[i]);
          i++;
        }
        if (i < len && line[i] === '"') {
          pushToken(tokens, 'string', '"');
          i++;
        }
        continue;
      }

      // Variables
      if (ch === '$') {
        const vm = line.slice(i).match(/^\$(?:\{[^}]+\}|\([^)]+\)|[A-Za-z_][A-Za-z0-9_]*|[0-9?*@#])/);
        if (vm) {
          pushToken(tokens, 'variable', vm[0]);
          i += vm[0].length;
          continue;
        }
      }

      // CLI flags (--foo or -e)
      if (ch === '-' && (i === 0 || /\s/.test(line[i - 1]))) {
        const fm = line.slice(i).match(/^--?[A-Za-z0-9][A-Za-z0-9_-]*/);
        if (fm) {
          pushToken(tokens, 'property', fm[0]);
          i += fm[0].length;
          continue;
        }
      }

      // Shell operators & redirects
      const opMatch = line.slice(i).match(/^(?:2>&1|&&|\|\||>>|<<|[|><;&])/);
      if (opMatch) {
        pushToken(tokens, 'operator', opMatch[0]);
        i += opMatch[0].length;
        continue;
      }

      if ('()[]{}'.includes(ch)) {
        pushToken(tokens, 'punctuation', ch);
        i++;
        continue;
      }

      // Assignment VAR=val
      const assignMatch = line.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)(=)/);
      if (assignMatch && (i === 0 || /\s/.test(line[i - 1]))) {
        pushToken(tokens, 'variable', assignMatch[1]);
        pushToken(tokens, 'operator', '=');
        i += assignMatch[0].length;
        continue;
      }

      // Words
      if (/[A-Za-z0-9_./~-]/.test(ch)) {
        const wm = line.slice(i).match(/^[A-Za-z0-9_./~:-]+/)!;
        const word = wm[0];
        if (word === 'true' || word === 'false') {
          pushToken(tokens, 'boolean', word);
        } else if (/^\d+$/.test(word)) {
          pushToken(tokens, 'number', word);
        } else if (BASH_KEYWORDS.has(word)) {
          pushToken(tokens, 'keyword', word);
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

function highlightYamlOrToml(rawLines: string[], isToml: boolean): HighlightToken[][] {
  return rawLines.map((line) => {
    const tokens: HighlightToken[] = [];
    const trimmed = line.trim();

    if (!isToml && (trimmed === '---' || trimmed === '...')) {
      pushToken(tokens, 'meta', line);
      return tokens;
    }

    if (isToml && /^\s*\[{1,2}[^\]]+\]{1,2}\s*(?:#.*)?$/.test(line)) {
      const hashIdx = line.indexOf('#');
      if (hashIdx !== -1) {
        pushToken(tokens, 'meta', line.slice(0, hashIdx));
        pushToken(tokens, 'comment', line.slice(hashIdx));
      } else {
        pushToken(tokens, 'meta', line);
      }
      return tokens;
    }

    let i = 0;
    const len = line.length;

    // Leading whitespace + optional YAML list dash
    const leadMatch = line.match(/^(\s*)(-\s+)?/);
    if (leadMatch) {
      if (leadMatch[1]) pushToken(tokens, 'plain', leadMatch[1]);
      if (leadMatch[2]) {
        pushToken(tokens, 'operator', '- ');
      }
      i = leadMatch[0].length;
    }

    // Check key: value or key = value
    const kvRegex = isToml
      ? /^([A-Za-z0-9_."'-]+)(\s*=\s*)/
      : /^([A-Za-z0-9_."'-]+)(:\s*)/;
    const kvMatch = line.slice(i).match(kvRegex);
    if (kvMatch) {
      pushToken(tokens, 'property', kvMatch[1]);
      pushToken(tokens, 'punctuation', kvMatch[2]);
      i += kvMatch[0].length;
    }

    // Scan remaining value expression
    while (i < len) {
      const ch = line[i];
      if (ch === '#') {
        pushToken(tokens, 'comment', line.slice(i));
        break;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        let j = i + 1;
        while (j < len && line[j] !== quote) {
          if (quote === '"' && line[j] === '\\' && j + 1 < len) j += 2;
          else j++;
        }
        if (j < len) j++;
        pushToken(tokens, 'string', line.slice(i, j));
        i = j;
        continue;
      }
      if (ch === ' ' || ch === '\t') {
        let j = i + 1;
        while (j < len && (line[j] === ' ' || line[j] === '\t')) j++;
        pushToken(tokens, 'plain', line.slice(i, j));
        i = j;
        continue;
      }
      if ('[]{},'.includes(ch)) {
        pushToken(tokens, 'punctuation', ch);
        i++;
        continue;
      }
      const valMatch = line.slice(i).match(/^[^\s#,\[\]{}]+/)!;
      const val = valMatch[0];
      const lower = val.toLowerCase();
      if (lower === 'true' || lower === 'false' || lower === 'null' || lower === 'yes' || lower === 'no' || val === '~') {
        pushToken(tokens, 'boolean', val);
      } else if (/^-?\d+(?:\.\d+)?$/.test(val)) {
        pushToken(tokens, 'number', val);
      } else {
        pushToken(tokens, 'string', val);
      }
      i += val.length;
    }

    return tokens;
  });
}

function highlightXml(rawLines: string[]): HighlightToken[][] {
  let inComment = false;

  return rawLines.map((line) => {
    const tokens: HighlightToken[] = [];
    let i = 0;
    const len = line.length;

    while (i < len) {
      if (inComment) {
        const endIdx = line.indexOf('-->', i);
        if (endIdx === -1) {
          pushToken(tokens, 'comment', line.slice(i));
          break;
        }
        pushToken(tokens, 'comment', line.slice(i, endIdx + 3));
        i = endIdx + 3;
        inComment = false;
        continue;
      }

      if (line.startsWith('<!--', i)) {
        const endIdx = line.indexOf('-->', i + 4);
        if (endIdx === -1) {
          pushToken(tokens, 'comment', line.slice(i));
          inComment = true;
          break;
        }
        pushToken(tokens, 'comment', line.slice(i, endIdx + 3));
        i = endIdx + 3;
        continue;
      }

      if (line[i] === '<') {
        const tagMatch = line.slice(i).match(/^<\/?([A-Za-z!?][\w:-]*)/);
        if (tagMatch) {
          const prefix = line[i + 1] === '/' ? '</' : '<';
          pushToken(tokens, 'punctuation', prefix);
          pushToken(tokens, tagMatch[1].startsWith('!') ? 'meta' : 'identifier', tagMatch[1]);
          i += tagMatch[0].length;
          // Scan attributes until '>'
          while (i < len && line[i] !== '>') {
            if (line[i] === '/' && line[i + 1] === '>') {
              pushToken(tokens, 'punctuation', '/>');
              i += 2;
              break;
            }
            if (/\s/.test(line[i])) {
              let j = i + 1;
              while (j < len && /\s/.test(line[j])) j++;
              pushToken(tokens, 'plain', line.slice(i, j));
              i = j;
              continue;
            }
            if (line[i] === '"' || line[i] === "'") {
              const quote = line[i];
              let j = i + 1;
              while (j < len && line[j] !== quote) j++;
              if (j < len) j++;
              pushToken(tokens, 'string', line.slice(i, j));
              i = j;
              continue;
            }
            const attrMatch = line.slice(i).match(/^[A-Za-z_:][\w:.-]*/);
            if (attrMatch) {
              pushToken(tokens, 'property', attrMatch[0]);
              i += attrMatch[0].length;
              continue;
            }
            pushToken(tokens, 'punctuation', line[i]);
            i++;
          }
          if (i < len && line[i] === '>') {
            pushToken(tokens, 'punctuation', '>');
            i++;
          }
          continue;
        }
      }

      pushToken(tokens, 'plain', line[i]);
      i++;
    }

    return tokens;
  });
}

function highlightDiff(rawLines: string[]): HighlightToken[][] {
  return rawLines.map((line) => {
    if (line.startsWith('@@') || line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
      return [{ type: 'meta', text: line }];
    }
    if (line.startsWith('+')) {
      return [{ type: 'added', text: line }];
    }
    if (line.startsWith('-')) {
      return [{ type: 'removed', text: line }];
    }
    return [{ type: 'plain', text: line }];
  });
}

function highlightMarkdownBlock(rawLines: string[]): HighlightToken[][] {
  return rawLines.map((line) => {
    if (/^\s*#{1,6}\s+/.test(line)) {
      return [{ type: 'meta', text: line }];
    }
    if (/^\s*>/.test(line)) {
      return [{ type: 'comment', text: line }];
    }
    if (/^\s*```/.test(line)) {
      return [{ type: 'keyword', text: line }];
    }
    const tokens: HighlightToken[] = [];
    let i = 0;
    const listMatch = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)/);
    if (listMatch) {
      pushToken(tokens, 'operator', listMatch[1]);
      i = listMatch[1].length;
    }
    while (i < line.length) {
      if (line[i] === '`') {
        const close = line.indexOf('`', i + 1);
        if (close !== -1) {
          pushToken(tokens, 'identifier', line.slice(i, close + 1));
          i = close + 1;
          continue;
        }
      }
      if (line.startsWith('**', i)) {
        const close = line.indexOf('**', i + 2);
        if (close !== -1) {
          pushToken(tokens, 'keyword', line.slice(i, close + 2));
          i = close + 2;
          continue;
        }
      }
      pushToken(tokens, 'plain', line[i]);
      i++;
    }
    return tokens;
  });
}

interface GenericLangConfig {
  keywords: Set<string>;
  types: Set<string>;
  hashComment?: boolean;
  slashComment?: boolean;
  blockComment?: boolean;
  backtickString?: boolean;
  tripleString?: boolean;
  cssMode?: boolean;
}

const LANG_CONFIGS: Record<string, GenericLangConfig> = {
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

function highlightGeneric(rawLines: string[], config: GenericLangConfig): HighlightToken[][] {
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

      // Hex color in CSS
      if (config.cssMode && ch === '#' && /^#[0-9a-fA-F]{3,8}\b/.test(line.slice(i))) {
        const hm = line.slice(i).match(/^#[0-9a-fA-F]{3,8}/)!;
        pushToken(tokens, 'decorator', hm[0]);
        i += hm[0].length;
        continue;
      }

      // Decorators / directives / @rules
      if (ch === '@' && /[A-Za-z_]/.test(line[i + 1] || '')) {
        const dm = line.slice(i).match(/^@[A-Za-z_][A-Za-z0-9_.]*/)!;
        pushToken(tokens, 'decorator', dm[0]);
        i += dm[0].length;
        continue;
      }

      // C# [Attribute] on line start
      if (ch === '[' && /^\s*\[[A-Za-z_][A-Za-z0-9_.]*/.test(line.slice(0, i + 20))) {
        const am = line.slice(i).match(/^\[[A-Za-z_][A-Za-z0-9_.]*(?:\([^)]*\))?\]/);
        if (am) {
          pushToken(tokens, 'decorator', am[0]);
          i += am[0].length;
          continue;
        }
      }

      // Numbers
      const numMatch = line.slice(i).match(/^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?:px|rem|em|vh|vw|%|ms|s)?/);
      if (numMatch && (i === 0 || !/[A-Za-z_$]/.test(line[i - 1]))) {
        pushToken(tokens, 'number', numMatch[0]);
        i += numMatch[0].length;
        continue;
      }

      // Multi-char operators
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

export function highlightCode(code: string, rawLanguage?: string): HighlightResult {
  const normalized = normalizeCodeLanguage(rawLanguage);
  const autoDetected = !normalized;
  const language = normalized || detectCodeLanguage(code);
  const rawLines = code.replace(/\r\n?/g, '\n').split('\n');

  let lines: HighlightToken[][];
  switch (language) {
    case 'dbml':
      lines = highlightDbml(rawLines);
      break;
    case 'sql':
      lines = highlightSql(rawLines);
      break;
    case 'json':
      lines = highlightJson(rawLines);
      break;
    case 'bash':
      lines = highlightBash(rawLines);
      break;
    case 'yaml':
      lines = highlightYamlOrToml(rawLines, false);
      break;
    case 'toml':
      lines = highlightYamlOrToml(rawLines, true);
      break;
    case 'xml':
      lines = highlightXml(rawLines);
      break;
    case 'diff':
      lines = highlightDiff(rawLines);
      break;
    case 'markdown':
      lines = highlightMarkdownBlock(rawLines);
      break;
    default: {
      const cfg = LANG_CONFIGS[language];
      if (cfg) {
        lines = highlightGeneric(rawLines, cfg);
      } else {
        lines = rawLines.map((line) => (line ? [{ type: 'plain', text: line }] : []));
      }
      break;
    }
  }

  return {
    language,
    autoDetected,
    lines,
  };
}
