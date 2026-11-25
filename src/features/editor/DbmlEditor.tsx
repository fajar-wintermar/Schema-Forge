import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, Copy } from 'lucide-react';
import {
  buildShellMergeScript,
  createStarterModuleDbml,
  MERGED_SCHEMA_VIEW_ID,
  normalizeModulePath,
} from '../../utils/schemaModules';
import {
  CodeMirrorViewport,
  CodeMirrorViewportHandle,
  SearchStats,
} from './components/CodeMirrorViewport';
import { EditorToolbar } from './components/EditorToolbar';
import { ErrorFooter } from './components/ErrorFooter';
import { FindReplaceBar } from './components/FindReplaceBar';
import { GotoLineBar } from './components/GotoLineBar';
import { ModuleExplorer } from './components/ModuleExplorer';
import { buildSchemaFileTree } from './fileTreeUtils';
import { DbmlEditorProps } from './types';

function countLinesFast(text: string): number {
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

export const DbmlEditor: React.FC<DbmlEditorProps> = ({
  value,
  onChange,
  errors,
  lintResult,
  onJumpToLintIssue,
  scrollToLine,
  enumNames = [],
  tables = [],
  partialNames = [],
  isMaximized = false,
  onToggleMaximize,
  onMinimize,
  modKey = '⌘',
  schemaFiles,
  activeFilePath,
  schemaFolder = 'schema',
  allErrorsByFile,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onEnableModularMode,
  onFlattenToSingleFile,
  onJumpToMergedLine,
}) => {
  const isModular = Boolean(schemaFiles && schemaFiles.length > 0);
  const isMergedPreview = isModular && activeFilePath === MERGED_SCHEMA_VIEW_ID;

  const cmRef = useRef<CodeMirrorViewportHandle>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const gotoInputRef = useRef<HTMLInputElement>(null);

  const [problemsOpen, setProblemsOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);

  // Find / Replace & Go to Line state
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [searchStats, setSearchStats] = useState<SearchStats>({
    matchCount: 0,
    activeIndex: 0,
  });
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState('');

  // Modular file explorer UI state
  const [explorerOpen, setExplorerOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('schemaforge_explorer_open');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const prevIsModularRef = useRef(isModular);

  useEffect(() => {
    try {
      localStorage.setItem('schemaforge_explorer_open', String(explorerOpen));
    } catch {
      // Ignore storage failures
    }
  }, [explorerOpen]);

  useEffect(() => {
    if (!prevIsModularRef.current && isModular) {
      setExplorerOpen(true);
    }
    prevIsModularRef.current = isModular;
  }, [isModular]);

  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    try {
      return localStorage.getItem('schemaforge_editor_word_wrap') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('schemaforge_editor_word_wrap', String(wordWrap));
    } catch {
      // Ignore storage failures
    }
  }, [wordWrap]);
  const [fileSearch, setFileSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileIncludeStub, setNewFileIncludeStub] = useState(true);
  const [renameTargetPath, setRenameTargetPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTargetPath, setDeleteTargetPath] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  const lineCount = useMemo(() => countLinesFast(value), [value]);

  const openFindBar = useCallback((withReplace = false) => {
    const selected = cmRef.current?.getSelectedText() || '';
    setGotoOpen(false);
    setFindOpen(true);
    setReplaceOpen(withReplace);
    if (selected && !selected.includes('\n') && selected.length <= 120) {
      setFindQuery(selected);
    }
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  const closeFindBar = useCallback(() => {
    setFindOpen(false);
    setReplaceOpen(false);
    cmRef.current?.clearSearch();
    cmRef.current?.focus();
  }, []);

  const openGotoLine = useCallback(() => {
    setFindOpen(false);
    setReplaceOpen(false);
    cmRef.current?.clearSearch();
    setGotoValue('');
    setGotoOpen(true);
    requestAnimationFrame(() => {
      gotoInputRef.current?.focus();
    });
  }, []);

  const closeGotoLine = useCallback(() => {
    setGotoOpen(false);
    cmRef.current?.focus();
  }, []);

  // Re-run CM6 search query whenever query/flags/doc update while find bar is open
  useEffect(() => {
    if (!findOpen) return;
    const stats = cmRef.current?.applySearch(
      findQuery,
      matchCase,
      wholeWord,
      false
    );
    if (stats) setSearchStats(stats);
  }, [findOpen, findQuery, matchCase, wholeWord, value, activeFilePath]);

  // Global keyboard shortcuts scoped to the editor panel (Cmd/Ctrl+F, H, G)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'f' && key !== 'h' && key !== 'g') return;

      const activeEl = document.activeElement;
      const inEditor =
        Boolean(editorWrapperRef.current?.contains(activeEl)) ||
        findOpen ||
        gotoOpen;
      if (!inEditor) return;

      if (key === 'f' && !e.shiftKey) {
        e.preventDefault();
        openFindBar(false);
      } else if (key === 'h' && !e.shiftKey) {
        e.preventDefault();
        openFindBar(!isMergedPreview);
      } else if (key === 'g' && !e.shiftKey) {
        e.preventDefault();
        openGotoLine();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [findOpen, gotoOpen, isMergedPreview, openFindBar, openGotoLine]);

  // Capture Alt+Z (and macOS Option+Z) before CodeMirror inserts Ω
  useEffect(() => {
    const handleWordWrapKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.code !== 'KeyZ' && e.key.toLowerCase() !== 'z') return;

      const activeEl = document.activeElement;
      const inEditor =
        Boolean(editorWrapperRef.current?.contains(activeEl)) ||
        (e.target instanceof Node &&
          Boolean(editorWrapperRef.current?.contains(e.target))) ||
        findOpen ||
        gotoOpen;
      if (!inEditor) return;

      e.preventDefault();
      e.stopPropagation();
      setWordWrap((w) => !w);
    };

    window.addEventListener('keydown', handleWordWrapKey, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleWordWrapKey, {
        capture: true,
      });
  }, [findOpen, gotoOpen]);

  // Reset inline rename/delete states and expand active file's parent folders
  useEffect(() => {
    setRenameTargetPath(null);
    setDeleteTargetPath(null);
    if (!activeFilePath || activeFilePath === MERGED_SCHEMA_VIEW_ID) return;
    const parts = activeFilePath.split('/').filter(Boolean);
    if (parts.length > 1) {
      setCollapsedFolders((prev) => {
        let changed = false;
        const next = { ...prev };
        let accum = '';
        for (let i = 0; i < parts.length - 1; i++) {
          accum = accum ? `${accum}/${parts[i]}` : parts[i];
          if (next[accum]) {
            delete next[accum];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [activeFilePath]);

  const sortedSchemaFiles = useMemo(() => {
    if (!schemaFiles) return [];
    return [...schemaFiles].sort((a, b) => a.path.localeCompare(b.path));
  }, [schemaFiles]);

  const schemaTree = useMemo(
    () => buildSchemaFileTree(sortedSchemaFiles, fileSearch, allErrorsByFile),
    [sortedSchemaFiles, fileSearch, allErrorsByFile]
  );

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const otherFileErrorEntries = useMemo(() => {
    if (!isModular || !allErrorsByFile) return [];
    return Object.entries(allErrorsByFile).filter(
      ([path, errs]) => path !== activeFilePath && errs.length > 0
    );
  }, [isModular, allErrorsByFile, activeFilePath]);

  const otherFileErrorsCount = useMemo(
    () => otherFileErrorEntries.reduce((acc, [, errs]) => acc + errs.length, 0),
    [otherFileErrorEntries]
  );

  const handleCreateModuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateFile || !newFileName.trim()) return;
    const normalizedPath = normalizeModulePath(newFileName, schemaFolder);
    const content = newFileIncludeStub
      ? createStarterModuleDbml(normalizedPath)
      : `// ${normalizedPath}\n`;
    onCreateFile(normalizedPath, content);
    setNewFileName('');
    setNewFileOpen(false);
    setExplorerOpen(true);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRenameFile || !renameTargetPath || !renameValue.trim()) return;
    const nextPath = normalizeModulePath(renameValue, schemaFolder);
    onRenameFile(renameTargetPath, nextPath);
    setRenameTargetPath(null);
  };

  const handleJumpFromMergedCursor = useCallback(() => {
    if (!onJumpToMergedLine || !cmRef.current) return;
    onJumpToMergedLine(cmRef.current.getCursorLine());
  }, [onJumpToMergedLine]);

  const handleCopyMergeScript = async () => {
    try {
      await navigator.clipboard.writeText(buildShellMergeScript(schemaFolder));
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleGoToMatch = (nextIdx: number) => {
    const dir = nextIdx < searchStats.activeIndex ? 'prev' : 'next';
    const stats = cmRef.current?.stepSearch(dir);
    if (stats) setSearchStats(stats);
  };

  const handleReplaceCurrent = () => {
    if (isMergedPreview || !findQuery) return;
    const stats = cmRef.current?.replaceOne(
      findQuery,
      replaceQuery,
      matchCase,
      wholeWord
    );
    if (stats) setSearchStats(stats);
  };

  const handleReplaceAll = () => {
    if (isMergedPreview || !findQuery) return;
    const stats = cmRef.current?.replaceAllMatches(
      findQuery,
      replaceQuery,
      matchCase,
      wholeWord
    );
    if (stats) setSearchStats(stats);
  };

  const handleSubmitGotoLine = () => {
    const match = gotoValue.trim().match(/^(\d+)(?::(\d+))?$/);
    if (!match) return;
    const lineNum = Number(match[1]);
    const colNum = match[2] ? Number(match[2]) : undefined;
    cmRef.current?.jumpToLine(lineNum, colNum);
    setGotoOpen(false);
  };

  const handleJumpToLine = (line: number) => {
    cmRef.current?.jumpToLine(line);
  };

  return (
    <div
      ref={editorWrapperRef}
      className={`relative flex-1 w-full min-w-0 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-950 ${
        isMaximized ? '' : 'border-r border-slate-200 dark:border-slate-800'
      }`}
    >
      <EditorToolbar
        isModular={isModular}
        isMergedPreview={isMergedPreview}
        activeFilePath={activeFilePath}
        explorerOpen={explorerOpen}
        otherFileErrorsCount={otherFileErrorsCount}
        onToggleExplorer={() => setExplorerOpen((o) => !o)}
        onEnableModularMode={onEnableModularMode}
        findOpen={findOpen}
        onOpenFind={() => openFindBar(false)}
        wordWrap={wordWrap}
        onToggleWordWrap={() => setWordWrap((w) => !w)}
        isMaximized={isMaximized}
        onToggleMaximize={onToggleMaximize}
        onMinimize={onMinimize}
        modKey={modKey}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {isModular && explorerOpen && (
          <ModuleExplorer
            schemaFolder={schemaFolder}
            sortedSchemaFiles={sortedSchemaFiles}
            schemaTreeNodes={schemaTree.nodes}
            activeFilePath={activeFilePath}
            isMergedPreview={isMergedPreview}
            allErrorsByFile={allErrorsByFile}
            fileSearch={fileSearch}
            onFileSearchChange={setFileSearch}
            collapsedFolders={collapsedFolders}
            onToggleFolder={toggleFolder}
            onSelectFile={onSelectFile}
            onCreateFile={onCreateFile}
            onRenameFile={onRenameFile}
            onDeleteFile={onDeleteFile}
            onFlattenToSingleFile={onFlattenToSingleFile}
            onHideExplorer={() => setExplorerOpen(false)}
            newFileOpen={newFileOpen}
            setNewFileOpen={setNewFileOpen}
            newFileName={newFileName}
            setNewFileName={setNewFileName}
            newFileIncludeStub={newFileIncludeStub}
            setNewFileIncludeStub={setNewFileIncludeStub}
            onCreateSubmit={handleCreateModuleSubmit}
            renameTargetPath={renameTargetPath}
            setRenameTargetPath={setRenameTargetPath}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            deleteTargetPath={deleteTargetPath}
            setDeleteTargetPath={setDeleteTargetPath}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {isMergedPreview && (
            <div className="shrink-0 px-2.5 py-1.5 border-b border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-emerald-900 dark:text-emerald-200">
                Generated on the fly from {sortedSchemaFiles.length} files in{' '}
                <code className="font-mono font-semibold">{schemaFolder}/</code>{' '}
                · Read-only (never pushed to GitHub)
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {onJumpToMergedLine && (
                  <button
                    type="button"
                    onClick={handleJumpFromMergedCursor}
                    className="px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-200 font-medium hover:bg-emerald-50"
                  >
                    Jump to Source File
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopyMergeScript}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-200 font-medium hover:bg-emerald-50"
                >
                  {copiedScript ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>
                    {copiedScript
                      ? 'Copied build-schema.sh'
                      : 'Copy build-schema.sh'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {findOpen && (
            <FindReplaceBar
              modKey={modKey}
              findInputRef={findInputRef}
              replaceInputRef={replaceInputRef}
              findQuery={findQuery}
              onFindQueryChange={setFindQuery}
              replaceQuery={replaceQuery}
              onReplaceQueryChange={setReplaceQuery}
              replaceOpen={replaceOpen}
              onToggleReplace={() =>
                setReplaceOpen((r) => (!isMergedPreview ? !r : false))
              }
              matchCase={matchCase}
              onToggleMatchCase={() => setMatchCase((v) => !v)}
              wholeWord={wholeWord}
              onToggleWholeWord={() => setWholeWord((v) => !v)}
              matchCount={searchStats.matchCount}
              safeMatchIdx={searchStats.activeIndex}
              onGoToMatch={handleGoToMatch}
              onReplaceCurrent={handleReplaceCurrent}
              onReplaceAll={handleReplaceAll}
              onClose={closeFindBar}
            />
          )}

          {gotoOpen && (
            <GotoLineBar
              gotoInputRef={gotoInputRef}
              gotoValue={gotoValue}
              onGotoValueChange={setGotoValue}
              totalLines={lineCount}
              onSubmit={handleSubmitGotoLine}
              onClose={closeGotoLine}
            />
          )}

          <div className="relative flex-1 flex min-h-0 overflow-hidden">
            <CodeMirrorViewport
              ref={cmRef}
              value={value}
              onChange={onChange}
              errors={errors}
              tables={tables}
              enumNames={enumNames}
              partialNames={partialNames}
              activeFilePath={activeFilePath}
              isMergedPreview={isMergedPreview}
              wordWrap={wordWrap}
              scrollToLine={scrollToLine}
              onOpenFind={openFindBar}
              onOpenGotoLine={openGotoLine}
              onJumpFromMergedCursor={
                onJumpToMergedLine ? handleJumpFromMergedCursor : undefined
              }
            />
          </div>

          <ErrorFooter
            errors={errors}
            problemsOpen={problemsOpen}
            onToggleProblems={() => setProblemsOpen((p) => !p)}
            lintResult={lintResult}
            qualityOpen={qualityOpen}
            onToggleQuality={() => setQualityOpen((q) => !q)}
            onCloseQuality={() => setQualityOpen(false)}
            onJumpToLintIssue={(issue) => {
              if (onJumpToLintIssue) {
                onJumpToLintIssue(issue);
              } else if (issue.line) {
                handleJumpToLine(issue.line);
              }
            }}
            onJumpToLine={handleJumpToLine}
            isModular={isModular}
            otherFileErrorEntries={otherFileErrorEntries}
            otherFileErrorsCount={otherFileErrorsCount}
            onSelectFile={onSelectFile}
            lineCount={lineCount}
            modKey={modKey}
            onOpenGotoLine={openGotoLine}
          />
        </div>
      </div>
    </div>
  );
};
