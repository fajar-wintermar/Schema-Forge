import { HighlightToken, pushToken } from './types';

export function highlightJson(rawLines: string[]): HighlightToken[][] {
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

export function highlightBash(rawLines: string[]): HighlightToken[][] {
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

      if (ch === "'") {
        let j = i + 1;
        while (j < len && line[j] !== "'") j++;
        if (j < len) j++;
        pushToken(tokens, 'string', line.slice(i, j));
        i = j;
        continue;
      }

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

      if (ch === '$') {
        const vm = line.slice(i).match(/^\$(?:\{[^}]+\}|\([^)]+\)|[A-Za-z_][A-Za-z0-9_]*|[0-9?*@#])/);
        if (vm) {
          pushToken(tokens, 'variable', vm[0]);
          i += vm[0].length;
          continue;
        }
      }

      if (ch === '-' && (i === 0 || /\s/.test(line[i - 1]))) {
        const fm = line.slice(i).match(/^--?[A-Za-z0-9][A-Za-z0-9_-]*/);
        if (fm) {
          pushToken(tokens, 'property', fm[0]);
          i += fm[0].length;
          continue;
        }
      }

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

      const assignMatch = line.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)(=)/);
      if (assignMatch && (i === 0 || /\s/.test(line[i - 1]))) {
        pushToken(tokens, 'variable', assignMatch[1]);
        pushToken(tokens, 'operator', '=');
        i += assignMatch[0].length;
        continue;
      }

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

export function highlightYamlOrToml(rawLines: string[], isToml: boolean): HighlightToken[][] {
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

    const leadMatch = line.match(/^(\s*)(-\s+)?/);
    if (leadMatch) {
      if (leadMatch[1]) pushToken(tokens, 'plain', leadMatch[1]);
      if (leadMatch[2]) {
        pushToken(tokens, 'operator', '- ');
      }
      i = leadMatch[0].length;
    }

    const kvRegex = isToml
      ? /^([A-Za-z0-9_."'-]+)(\s*=\s*)/
      : /^([A-Za-z0-9_."'-]+)(:\s*)/;
    const kvMatch = line.slice(i).match(kvRegex);
    if (kvMatch) {
      pushToken(tokens, 'property', kvMatch[1]);
      pushToken(tokens, 'punctuation', kvMatch[2]);
      i += kvMatch[0].length;
    }

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

export function highlightXml(rawLines: string[]): HighlightToken[][] {
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

export function highlightDiff(rawLines: string[]): HighlightToken[][] {
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

export function highlightMarkdownBlock(rawLines: string[]): HighlightToken[][] {
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
