import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from '@codemirror/language';
import { lintGutter } from '@codemirror/lint';
import {
  SearchQuery,
  findNext,
  findPrevious,
  highlightSelectionMatches,
  replaceAll,
  replaceNext,
  search,
  selectNextOccurrence,
  setSearchQuery,
} from '@codemirror/search';
import {
  Compartment,
  EditorSelection,
  EditorState,
  Extension,
  Prec,
} from '@codemirror/state';
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { ParseError, TableDef } from '../../../types/schema';
import {
  DbmlAutocompleteContextRefs,
  createDbmlCompletionSource,
} from '../cm6/dbmlAutocomplete';
import { syncErrorsToDiagnostics } from '../cm6/dbmlDiagnostics';
import { dbmlFoldService } from '../cm6/dbmlFolding';
import { createDbmlStreamLanguage } from '../cm6/dbmlHighlighter';
import {
  createDbmlTheme,
  lineHighlightsField,
  setErrorLinesEffect,
  setGotoLineEffect,
} from '../cm6/dbmlTheme';

export interface SearchStats {
  matchCount: number;
  activeIndex: number;
}

export interface CodeMirrorViewportHandle {
  jumpToLine: (line: number, col?: number) => void;
  getCursorLine: () => number;
  getSelectedText: () => string;
  applySearch: (
    query: string,
    matchCase: boolean,
    wholeWord: boolean,
    jumpToMatch?: boolean
  ) => SearchStats;
  stepSearch: (direction: 'next' | 'prev') => SearchStats;
  replaceOne: (
    query: string,
    replaceText: string,
    matchCase: boolean,
    wholeWord: boolean
  ) => SearchStats;
  replaceAllMatches: (
    query: string,
    replaceText: string,
    matchCase: boolean,
    wholeWord: boolean
  ) => SearchStats;
  clearSearch: () => void;
  focus: () => void;
}

interface CodeMirrorViewportProps {
  value: string;
  onChange: (value: string) => void;
  errors: ParseError[];
  tables: TableDef[];
  enumNames: string[];
  partialNames: string[];
  activeFilePath?: string;
  isMergedPreview: boolean;
  wordWrap?: boolean;
  scrollToLine?: number | null;
  onOpenFind: (withReplace: boolean) => void;
  onOpenGotoLine: () => void;
  onJumpFromMergedCursor?: () => void;
}

function computeSearchStats(view: EditorView, sq: SearchQuery): SearchStats {
  if (!sq.search) return { matchCount: 0, activeIndex: 0 };

  const doc = view.state.doc;
  const sel = view.state.selection.main;
  const cursor = sq.getCursor(doc);
  let matchCount = 0;
  let activeIndex = 0;
  let foundExactOrNext = false;

  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    const { from, to } = next.value;
    if (!foundExactOrNext) {
      if (from === sel.from && to === sel.to) {
        activeIndex = matchCount;
        foundExactOrNext = true;
      } else if (from >= sel.from) {
        activeIndex = matchCount;
        foundExactOrNext = true;
      }
    }
    matchCount++;
    if (matchCount >= 5000) break;
  }

  return { matchCount, activeIndex: matchCount === 0 ? 0 : activeIndex };
}

export const CodeMirrorViewport = React.forwardRef<
  CodeMirrorViewportHandle,
  CodeMirrorViewportProps
>(
  (
    {
      value,
      onChange,
      errors,
      tables,
      enumNames,
      partialNames,
      activeFilePath,
      isMergedPreview,
      wordWrap = false,
      scrollToLine,
      onOpenFind,
      onOpenGotoLine,
      onJumpFromMergedCursor,
    },
    ref
  ) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isSyncingExternalRef = useRef(false);
    const prevFilePathRef = useRef<string | undefined>(activeFilePath);
    const gotoTimerRef = useRef<number | null>(null);
    const lastSearchRef = useRef<{
      query: string;
      matchCase: boolean;
      wholeWord: boolean;
    }>({ query: '', matchCase: false, wholeWord: false });

    const themeCompartmentRef = useRef(new Compartment());
    const langCompartmentRef = useRef(new Compartment());
    const readOnlyCompartmentRef = useRef(new Compartment());
    const wordWrapCompartmentRef = useRef(new Compartment());

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const onOpenFindRef = useRef(onOpenFind);
    onOpenFindRef.current = onOpenFind;

    const onOpenGotoLineRef = useRef(onOpenGotoLine);
    onOpenGotoLineRef.current = onOpenGotoLine;

    const onJumpMergedRef = useRef(onJumpFromMergedCursor);
    onJumpMergedRef.current = onJumpFromMergedCursor;

    const isMergedPreviewRef = useRef(isMergedPreview);
    isMergedPreviewRef.current = isMergedPreview;

    const wordWrapRef = useRef(wordWrap);
    wordWrapRef.current = wordWrap;

    const enumNamesRef = useRef(enumNames);
    enumNamesRef.current = enumNames;

    const initialValueRef = useRef(value);

    const autocompleteRefs = useRef<DbmlAutocompleteContextRefs>({
      tables,
      enumNames,
      partialNames,
      isMergedPreview,
    });
    autocompleteRefs.current = {
      tables,
      enumNames,
      partialNames,
      isMergedPreview,
    };

    const buildExtensions = useCallback((): Extension[] => {
      const isDark = document.documentElement.classList.contains('dark');
      return [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        dbmlFoldService,
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({
          override: [createDbmlCompletionSource(autocompleteRefs)],
          activateOnTyping: true,
          icons: false,
        }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: false }),
        lintGutter(),
        lineHighlightsField,
        themeCompartmentRef.current.of(createDbmlTheme(isDark)),
        langCompartmentRef.current.of(
          createDbmlStreamLanguage(enumNamesRef.current)
        ),
        readOnlyCompartmentRef.current.of(
          EditorState.readOnly.of(isMergedPreviewRef.current)
        ),
        wordWrapCompartmentRef.current.of(
          wordWrapRef.current ? EditorView.lineWrapping : []
        ),
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-f',
              run: () => {
                onOpenFindRef.current(false);
                return true;
              },
            },
            {
              key: 'Mod-h',
              run: () => {
                onOpenFindRef.current(true);
                return true;
              },
            },
            {
              key: 'Mod-g',
              run: () => {
                onOpenGotoLineRef.current();
                return true;
              },
            },
            {
              key: 'Mod-Enter',
              run: () => {
                if (isMergedPreviewRef.current && onJumpMergedRef.current) {
                  onJumpMergedRef.current();
                  return true;
                }
                return false;
              },
            },
          ])
        ),
        Prec.high(keymap.of(completionKeymap)),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isSyncingExternalRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          dblclick: () => {
            if (isMergedPreviewRef.current && onJumpMergedRef.current) {
              onJumpMergedRef.current();
              return true;
            }
            return false;
          },
        }),
      ];
    }, []);

    const flashLineHighlight = (view: EditorView, lineNumber: number) => {
      if (gotoTimerRef.current) {
        window.clearTimeout(gotoTimerRef.current);
      }
      view.dispatch({ effects: setGotoLineEffect.of(lineNumber) });
      gotoTimerRef.current = window.setTimeout(() => {
        viewRef.current?.dispatch({ effects: setGotoLineEffect.of(null) });
      }, 1800);
    };

    useImperativeHandle(ref, () => ({
      jumpToLine: (line: number, col?: number) => {
        const view = viewRef.current;
        if (!view) return;
        const clampedLine = Math.max(1, Math.min(view.state.doc.lines, line));
        const info = view.state.doc.line(clampedLine);
        const targetOffset = Math.min(
          info.to,
          info.from + Math.max(0, (col ?? 1) - 1)
        );
        view.dispatch({
          selection: EditorSelection.cursor(targetOffset),
          effects: EditorView.scrollIntoView(targetOffset, { y: 'center' }),
        });
        flashLineHighlight(view, clampedLine);
        view.focus();
      },
      getCursorLine: () => {
        const view = viewRef.current;
        if (!view) return 1;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
      },
      getSelectedText: () => {
        const view = viewRef.current;
        if (!view) return '';
        const { from, to } = view.state.selection.main;
        return from === to ? '' : view.state.doc.sliceString(from, to);
      },
      applySearch: (
        query: string,
        matchCase: boolean,
        wholeWord: boolean,
        jumpToMatch = false
      ) => {
        lastSearchRef.current = { query, matchCase, wholeWord };
        const view = viewRef.current;
        if (!view) return { matchCount: 0, activeIndex: 0 };
        const sq = new SearchQuery({
          search: query,
          caseSensitive: matchCase,
          wholeWord,
        });
        view.dispatch({ effects: setSearchQuery.of(sq) });
        if (jumpToMatch && query) {
          findNext(view);
        }
        return computeSearchStats(view, sq);
      },
      stepSearch: (direction: 'next' | 'prev') => {
        const view = viewRef.current;
        const { query, matchCase, wholeWord } = lastSearchRef.current;
        if (!view || !query) return { matchCount: 0, activeIndex: 0 };
        const sq = new SearchQuery({
          search: query,
          caseSensitive: matchCase,
          wholeWord,
        });
        if (direction === 'next') findNext(view);
        else findPrevious(view);
        return computeSearchStats(view, sq);
      },
      replaceOne: (
        query: string,
        replaceText: string,
        matchCase: boolean,
        wholeWord: boolean
      ) => {
        const view = viewRef.current;
        if (!view || !query) return { matchCount: 0, activeIndex: 0 };
        const sq = new SearchQuery({
          search: query,
          replace: replaceText,
          caseSensitive: matchCase,
          wholeWord,
        });
        view.dispatch({ effects: setSearchQuery.of(sq) });
        replaceNext(view);
        return computeSearchStats(view, sq);
      },
      replaceAllMatches: (
        query: string,
        replaceText: string,
        matchCase: boolean,
        wholeWord: boolean
      ) => {
        const view = viewRef.current;
        if (!view || !query) return { matchCount: 0, activeIndex: 0 };
        const sq = new SearchQuery({
          search: query,
          replace: replaceText,
          caseSensitive: matchCase,
          wholeWord,
        });
        view.dispatch({ effects: setSearchQuery.of(sq) });
        replaceAll(view);
        return computeSearchStats(view, sq);
      },
      clearSearch: () => {
        lastSearchRef.current = {
          query: '',
          matchCase: false,
          wholeWord: false,
        };
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          effects: setSearchQuery.of(new SearchQuery({ search: '' })),
        });
      },
      focus: () => {
        viewRef.current?.focus();
      },
    }));

    // Mount CodeMirror 6 instance once and clean up on unmount
    useEffect(() => {
      if (!hostRef.current) return;

      const view = new EditorView({
        state: EditorState.create({
          doc: initialValueRef.current,
          extensions: buildExtensions(),
        }),
        parent: hostRef.current,
      });

      viewRef.current = view;

      const observer = new MutationObserver(() => {
        const dark = document.documentElement.classList.contains('dark');
        view.dispatch({
          effects: themeCompartmentRef.current.reconfigure(
            createDbmlTheme(dark)
          ),
        });
      });

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });

      return () => {
        observer.disconnect();
        if (gotoTimerRef.current) {
          window.clearTimeout(gotoTimerRef.current);
        }
        view.destroy();
        viewRef.current = null;
      };
    }, [buildExtensions]);

    // Handle active file switches (fresh undo history) and external value updates
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      const fileChanged = prevFilePathRef.current !== activeFilePath;
      prevFilePathRef.current = activeFilePath;

      if (fileChanged) {
        isSyncingExternalRef.current = true;
        view.setState(
          EditorState.create({
            doc: value,
            extensions: buildExtensions(),
          })
        );
        isSyncingExternalRef.current = false;
        return;
      }

      const currentDoc = view.state.doc.toString();
      if (currentDoc !== value) {
        isSyncingExternalRef.current = true;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
        });
        isSyncingExternalRef.current = false;
      }
    }, [value, activeFilePath, buildExtensions]);

    // Update DBML syntax highlighter when enumNames change
    const enumKey = enumNames.join('\0');
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: langCompartmentRef.current.reconfigure(
          createDbmlStreamLanguage(enumNamesRef.current)
        ),
      });
    }, [enumKey]);

    // Update readOnly mode when switching to/from merged preview
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: readOnlyCompartmentRef.current.reconfigure(
          EditorState.readOnly.of(isMergedPreview)
        ),
      });
    }, [isMergedPreview]);

    // Update word wrapping dynamically when toggled
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: wordWrapCompartmentRef.current.reconfigure(
          wordWrap ? EditorView.lineWrapping : []
        ),
      });
    }, [wordWrap]);

    // Sync parse/semantic errors to line highlights & @codemirror/lint gutter
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const uniqueLines = Array.from(new Set(errors.map((e) => e.line)));
      view.dispatch({ effects: setErrorLinesEffect.of(uniqueLines) });
      syncErrorsToDiagnostics(view, errors);
    }, [errors, activeFilePath]);

    // Scroll into view when diagram/inspector requests jumping to a specific line
    useEffect(() => {
      const view = viewRef.current;
      if (!view || !scrollToLine) return;
      const clampedLine = Math.max(
        1,
        Math.min(view.state.doc.lines, scrollToLine)
      );
      const info = view.state.doc.line(clampedLine);
      view.dispatch({
        effects: EditorView.scrollIntoView(info.from, { y: 'center' }),
      });
      flashLineHighlight(view, clampedLine);
    }, [scrollToLine, activeFilePath]);

    return (
      <div
        ref={hostRef}
        className="flex-1 min-w-0 min-h-0 h-full overflow-hidden"
        aria-label="DBML Schema Editor"
      />
    );
  }
);

CodeMirrorViewport.displayName = 'CodeMirrorViewport';
