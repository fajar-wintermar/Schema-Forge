import { Diagnostic, setDiagnostics } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { ParseError } from '@shared/domain/schemaTypes';

export function syncErrorsToDiagnostics(
  view: EditorView,
  errors: ParseError[]
): void {
  const doc = view.state.doc;
  const diagnostics: Diagnostic[] = [];

  for (const err of errors) {
    const lineNum = Math.max(1, Math.min(doc.lines, err.line || 1));
    const line = doc.line(lineNum);
    const trimmedStart = line.text.search(/\S/);
    const from =
      trimmedStart >= 0 ? line.from + trimmedStart : line.from;
    const to = Math.max(from, line.to);

    diagnostics.push({
      from,
      to,
      severity: 'error',
      message: err.message,
      source: 'DBML',
    });
  }

  view.dispatch(setDiagnostics(view.state, diagnostics));
}
