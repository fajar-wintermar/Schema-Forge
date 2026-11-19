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
