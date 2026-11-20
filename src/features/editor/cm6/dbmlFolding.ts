import { foldService } from '@codemirror/language';

/**
 * Custom CodeMirror 6 fold service for DBML blocks:
 * - Brace blocks: Table, TablePartial, TableGroup, Enum, Note, Project, Indexes, Checks, Ref
 * - Multi-line triple-quoted notes '''...'''
 * - Multi-line block comments /* ... *\/
 */
export const dbmlFoldService = foldService.of((state, lineStart, lineEnd) => {
  const doc = state.doc;
  const lineText = doc.sliceString(lineStart, lineEnd);

  // 1. Multi-line block comment starting on this line
  const commentStartIdx = lineText.indexOf('/*');
  if (commentStartIdx !== -1 && lineText.indexOf('*/', commentStartIdx + 2) === -1) {
    const startLine = doc.lineAt(lineStart);
    for (let ln = startLine.number + 1; ln <= doc.lines; ln++) {
      const l = doc.line(ln);
      const closeIdx = l.text.indexOf('*/');
      if (closeIdx !== -1) {
        return { from: lineStart + commentStartIdx + 2, to: l.from + closeIdx + 2 };
      }
    }
  }

  // 2. Multi-line '''...''' note starting on this line
  const tripleIdx = lineText.indexOf("'''");
  if (tripleIdx !== -1 && lineText.indexOf("'''", tripleIdx + 3) === -1) {
    const startLine = doc.lineAt(lineStart);
    for (let ln = startLine.number + 1; ln <= doc.lines; ln++) {
      const l = doc.line(ln);
      const closeIdx = l.text.indexOf("'''");
      if (closeIdx !== -1) {
        return { from: lineStart + tripleIdx + 3, to: l.from + closeIdx };
      }
    }
  }

  // 3. Brace block { ... } opening on this line (outside strings and comments)
  let openBraceCol = -1;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = 0; i < lineText.length; i++) {
    const ch = lineText[i];
    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '/' && lineText[i + 1] === '/') break;
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === '`') {
        inBacktick = true;
        continue;
      }
      if (ch === '{') {
        openBraceCol = i;
      } else if (ch === '}' && openBraceCol !== -1) {
        // Closed on the same line -> not multi-line foldable
        openBraceCol = -1;
      }
    } else {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (inSingle && ch === "'") inSingle = false;
      else if (inDouble && ch === '"') inDouble = false;
      else if (inBacktick && ch === '`') inBacktick = false;
    }
  }

  if (openBraceCol === -1) return null;

  const foldFrom = lineStart + openBraceCol + 1;
  const startLine = doc.lineAt(lineStart);
  let depth = 1;
  let inTriple = false;
  let inBlockComment = false;

  for (let ln = startLine.number + 1; ln <= doc.lines; ln++) {
    const l = doc.line(ln);
    const text = l.text;
    let sSingle = false;
    let sDouble = false;
    let sBacktick = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inBlockComment) {
        if (ch === '*' && text[i + 1] === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (inTriple) {
        if (text.startsWith("'''", i)) {
          inTriple = false;
          i += 2;
        } else if (ch === '\\') {
          i++;
        }
        continue;
      }

      if (!sSingle && !sDouble && !sBacktick) {
        if (ch === '/' && text[i + 1] === '/') break;
        if (ch === '/' && text[i + 1] === '*') {
          inBlockComment = true;
          i++;
          continue;
        }
        if (text.startsWith("'''", i)) {
          inTriple = true;
          i += 2;
          continue;
        }
        if (ch === "'") {
          sSingle = true;
          continue;
        }
        if (ch === '"') {
          sDouble = true;
          continue;
        }
        if (ch === '`') {
          sBacktick = true;
          continue;
        }
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            const foldTo = l.from + i;
            return foldTo > foldFrom ? { from: foldFrom, to: foldTo } : null;
          }
        }
      } else {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (sSingle && ch === "'") sSingle = false;
        else if (sDouble && ch === '"') sDouble = false;
        else if (sBacktick && ch === '`') sBacktick = false;
      }
    }
  }

  return null;
});
