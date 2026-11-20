import {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import { EditorSelection } from '@codemirror/state';
import { TableDef } from '../../../types/schema';
import { getAutocompleteContext } from '../dbmlLanguage';
import { AutocompleteItem } from '../types';

export interface DbmlAutocompleteContextRefs {
  tables: TableDef[];
  enumNames: string[];
  partialNames: string[];
  isMergedPreview: boolean;
}

function mapKindToCmType(kind: AutocompleteItem['kind']): string {
  switch (kind) {
    case 'table':
      return 'class';
    case 'column':
      return 'property';
    case 'type':
    case 'enum':
      return 'type';
    case 'setting':
      return 'property';
    case 'snippet':
      return 'snippet';
    default:
      return 'keyword';
  }
}

export function createDbmlCompletionSource(
  refs: { current: DbmlAutocompleteContextRefs }
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const { tables, enumNames, partialNames, isMergedPreview } = refs.current;
    if (isMergedPreview) return null;

    const docText = context.state.doc.toString();
    const pos = context.pos;
    const { replaceStart, items } = getAutocompleteContext(
      docText,
      pos,
      tables,
      enumNames,
      partialNames
    );

    if (items.length === 0) return null;

    // Require either explicit Ctrl+Space, a word char, `.` or `~` or `[`
    const charBefore = pos > 0 ? docText[pos - 1] : '';
    const hasWord = replaceStart < pos;
    if (!context.explicit && !hasWord && charBefore !== '.' && charBefore !== '~') {
      return null;
    }

    const options: Completion[] = items.map((item, idx) => ({
      label: item.label,
      type: mapKindToCmType(item.kind),
      detail: item.detail,
      boost: items.length - idx,
      apply: (view, _completion, from, to) => {
        const insert = item.insertText;
        const cursorPos =
          item.cursorOffsetBack && item.cursorOffsetBack > 0
            ? from + insert.length - item.cursorOffsetBack
            : from + insert.length;
        view.dispatch({
          changes: { from, to, insert },
          selection: EditorSelection.cursor(cursorPos),
        });
      },
    }));

    return {
      from: replaceStart,
      to: pos,
      options,
      filter: false,
    };
  };
}
