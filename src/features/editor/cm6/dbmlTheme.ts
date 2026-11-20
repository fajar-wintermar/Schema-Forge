import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export const setErrorLinesEffect = StateEffect.define<number[]>();
export const setGotoLineEffect = StateEffect.define<number | null>();

interface LineHighlightsState {
  errorLines: number[];
  gotoLine: number | null;
  decorations: DecorationSet;
}

function buildLineDecorations(
  doc: EditorView['state']['doc'],
  errorLines: number[],
  gotoLine: number | null
): DecorationSet {
  const entries: Array<{ pos: number; cls: string }> = [];

  for (const ln of errorLines) {
    if (ln >= 1 && ln <= doc.lines) {
      entries.push({ pos: doc.line(ln).from, cls: 'cm-dbml-error-line' });
    }
  }

  if (gotoLine !== null && gotoLine >= 1 && gotoLine <= doc.lines) {
    entries.push({ pos: doc.line(gotoLine).from, cls: 'cm-dbml-goto-line' });
  }

  entries.sort((a, b) => a.pos - b.pos);

  const decoRanges = entries.map((e) =>
    Decoration.line({ attributes: { class: e.cls } }).range(e.pos)
  );
  return Decoration.set(decoRanges, true);
}

export const lineHighlightsField = StateField.define<LineHighlightsState>({
  create() {
    return { errorLines: [], gotoLine: null, decorations: Decoration.none };
  },
  update(value, tr) {
    let errorLines = value.errorLines;
    let gotoLine = value.gotoLine;
    let changed = tr.docChanged;

    for (const effect of tr.effects) {
      if (effect.is(setErrorLinesEffect)) {
        errorLines = effect.value;
        changed = true;
      } else if (effect.is(setGotoLineEffect)) {
        gotoLine = effect.value;
        changed = true;
      }
    }

    if (!changed) return value;

    return {
      errorLines,
      gotoLine,
      decorations: buildLineDecorations(tr.state.doc, errorLines, gotoLine),
    };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

export function createDbmlTheme(isDark: boolean) {
  const highlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: isDark ? '#a78bfa' : '#7c3aed', fontWeight: '500' },
    { tag: tags.className, color: isDark ? '#93c5fd' : '#1d4ed8', fontWeight: '600' },
    { tag: tags.typeName, color: isDark ? '#34d399' : '#059669' },
    { tag: tags.propertyName, color: isDark ? '#38bdf8' : '#0284c7' },
    { tag: tags.string, color: isDark ? '#fcd34d' : '#b45309' },
    { tag: tags.special(tags.string), color: isDark ? '#67e8f9' : '#0e7490' },
    { tag: tags.atom, color: isDark ? '#2dd4bf' : '#0d9488', fontWeight: '500' },
    { tag: tags.color, color: isDark ? '#f472b6' : '#db2777' },
    { tag: [tags.number, tags.bool], color: isDark ? '#fb923c' : '#ea580c' },
    { tag: tags.operator, color: isDark ? '#60a5fa' : '#2563eb', fontWeight: '600' },
    { tag: tags.comment, color: isDark ? '#64748b' : '#94a3b8', fontStyle: 'italic' },
    { tag: tags.punctuation, color: isDark ? '#64748b' : '#94a3b8' },
    { tag: tags.variableName, color: isDark ? '#f1f5f9' : '#0f172a' },
  ]);

  const editorTheme = EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: isDark ? '#020617' : '#ffffff',
        color: isDark ? '#f1f5f9' : '#0f172a',
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
        lineHeight: '20px',
      },
      '.cm-content': {
        padding: '12px 0',
        caretColor: '#3b82f6',
      },
      '.cm-line': {
        padding: '0 14px 0 8px',
      },
      '.cm-gutters': {
        backgroundColor: isDark ? '#0f172a' : '#f8fafc',
        color: isDark ? '#64748b' : '#94a3b8',
        borderRight: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
        fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
        fontSize: '11px',
        userSelect: 'none',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 10px',
        minWidth: '38px',
      },
      '.cm-foldGutter .cm-gutterElement': {
        padding: '0 4px 0 2px',
        cursor: 'pointer',
        color: isDark ? '#64748b' : '#94a3b8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      '.cm-foldGutter .cm-gutterElement:hover': {
        color: isDark ? '#e2e8f0' : '#0f172a',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
        border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
        color: isDark ? '#94a3b8' : '#475569',
        borderRadius: '4px',
        padding: '0 5px',
        margin: '0 3px',
        fontSize: '11px',
      },
      '.cm-activeLine': {
        backgroundColor: isDark
          ? 'rgba(30, 41, 59, 0.35)'
          : 'rgba(241, 245, 249, 0.6)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
        color: isDark ? '#e2e8f0' : '#0f172a',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection':
        {
          backgroundColor: isDark
            ? 'rgba(59, 130, 246, 0.3)'
            : 'rgba(59, 130, 246, 0.22)',
        },
      '&.cm-focused .cm-matchingBracket': {
        backgroundColor: isDark
          ? 'rgba(59, 130, 246, 0.28)'
          : 'rgba(59, 130, 246, 0.2)',
        outline: `1px solid ${isDark ? '#60a5fa' : '#2563eb'}`,
        borderRadius: '2px',
      },
      '.cm-selectionMatch': {
        backgroundColor: isDark
          ? 'rgba(245, 158, 11, 0.22)'
          : 'rgba(245, 158, 11, 0.2)',
        borderRadius: '2px',
      },
      '.cm-searchMatch': {
        backgroundColor: isDark
          ? 'rgba(245, 158, 11, 0.3)'
          : 'rgba(250, 204, 21, 0.4)',
        outline: '1px solid rgba(245, 158, 11, 0.55)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: isDark
          ? 'rgba(59, 130, 246, 0.45)'
          : 'rgba(59, 130, 246, 0.3)',
        outline: '1px solid #3b82f6',
      },
      '.cm-dbml-error-line': {
        backgroundColor: isDark
          ? 'rgba(244, 63, 94, 0.14)'
          : 'rgba(244, 63, 94, 0.1)',
      },
      '.cm-dbml-goto-line': {
        backgroundColor: isDark
          ? 'rgba(59, 130, 246, 0.2)'
          : 'rgba(59, 130, 246, 0.14)',
      },
      '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy #f43f5e',
      },
      '.cm-tooltip': {
        border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        color: isDark ? '#f1f5f9' : '#0f172a',
        borderRadius: '8px',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      },
      '.cm-tooltip-autocomplete': {
        '& > ul': {
          fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
          fontSize: '12px',
          maxHeight: '220px',
          minWidth: '250px',
        },
        '& > ul > li': {
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        },
        '& > ul > li[aria-selected]': {
          backgroundColor: isDark ? 'rgba(30, 58, 138, 0.55)' : '#eff6ff',
          color: isDark ? '#f8fafc' : '#1e3a8a',
        },
      },
      '.cm-completionDetail': {
        fontSize: '11px',
        color: isDark ? '#94a3b8' : '#64748b',
        fontFamily: "var(--font-sans, sans-serif)",
        marginLeft: 'auto',
      },
    },
    { dark: isDark }
  );

  return [editorTheme, syntaxHighlighting(highlightStyle)];
}
