import { ParseError } from '../../types/schema';

export interface DbmlToken {
  type: 'word' | 'string' | 'symbol' | 'newline';
  value: string;
  line: number;
}

export function dedentTripleQuoted(raw: string): string {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length === 0) return '';

  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^[ \t]*/);
    const indentLen = match ? match[0].length : 0;
    if (indentLen < minIndent) minIndent = indentLen;
  }

  if (!Number.isFinite(minIndent) || minIndent === 0) {
    return lines.join('\n').trim();
  }

  return lines
    .map((line) => (line.trim().length === 0 ? '' : line.slice(minIndent)))
    .join('\n')
    .trim();
}

export function unquote(val: string): string {
  return val.replace(/^['"`]|['"`]$/g, '');
}

export function tokenizeDbml(input: string, errors: ParseError[]): DbmlToken[] {
  const tokens: DbmlToken[] = [];
  let i = 0;
  let line = 1;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (ch === '\r') {
      i++;
      continue;
    }

    if (ch === '\n') {
      tokens.push({ type: 'newline', value: '\n', line });
      line++;
      i++;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    // Single-line comment
    if (ch === '/' && input[i + 1] === '/') {
      while (i < len && input[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Multi-line comment
    if (ch === '/' && input[i + 1] === '*') {
      const startLine = line;
      i += 2;
      let closed = false;
      while (i < len) {
        if (input[i] === '*' && input[i + 1] === '/') {
          closed = true;
          i += 2;
          break;
        }
        if (input[i] === '\n') line++;
        i++;
      }
      if (!closed) {
        errors.push({
          line: startLine,
          message: 'Unclosed multi-line comment (missing */)',
        });
      }
      continue;
    }

    // Triple-quoted multiline string '''...'''
    if (input.slice(i, i + 3) === "'''") {
      const startLine = line;
      i += 3;
      let val = '';
      let closed = false;
      while (i < len) {
        if (input[i] === '\\' && input.slice(i + 1, i + 4) === "'''") {
          val += "'''";
          i += 4;
          continue;
        }
        if (input.slice(i, i + 3) === "'''") {
          closed = true;
          i += 3;
          break;
        }
        if (input[i] === '\n') line++;
        val += input[i];
        i++;
      }
      if (!closed) {
        errors.push({
          line: startLine,
          message: "Unclosed multi-line string (missing ''')",
        });
      }
      tokens.push({
        type: 'string',
        value: dedentTripleQuoted(val),
        line: startLine,
      });
      continue;
    }

    // Single, double, or backtick quoted strings
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      const startLine = line;
      i++;
      let val = '';
      let closed = false;
      while (i < len) {
        if (input[i] === quote) {
          closed = true;
          i++;
          break;
        }
        if (input[i] === '\\' && i + 1 < len) {
          i++;
          val += input[i];
        } else {
          if (input[i] === '\n') line++;
          val += input[i];
        }
        i++;
      }
      if (!closed) {
        errors.push({
          line: startLine,
          message: `Unclosed string literal (missing ${quote})`,
        });
      }
      tokens.push({ type: 'string', value: val, line: startLine });
      continue;
    }

    // Multi-char symbols
    if (ch === '<' && input[i + 1] === '>') {
      tokens.push({ type: 'symbol', value: '<>', line });
      i += 2;
      continue;
    }

    // Single-char symbols
    if ('{}[]():,.<>-'.includes(ch)) {
      tokens.push({ type: 'symbol', value: ch, line });
      i++;
      continue;
    }

    // Word / identifier / type / number / hex color
    let word = '';
    const startLine = line;
    while (
      i < len &&
      !/[\s{}\[\]():,.<>'"`\-]/.test(input[i]) &&
      !(input[i] === '/' && (input[i + 1] === '/' || input[i + 1] === '*'))
    ) {
      word += input[i];
      i++;
    }
    if (word) {
      tokens.push({ type: 'word', value: word, line: startLine });
    }
  }

  return tokens;
}
