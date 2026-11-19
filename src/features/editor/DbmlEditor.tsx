import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { ParseError } from '../../types/schema';
import {
  buildShellMergeScript,
  createStarterModuleDbml,
  MERGED_SCHEMA_VIEW_ID,
  normalizeModulePath,
} from '../../utils/schemaModules';
import { AutocompletePopover } from './components/AutocompletePopover';
import { CodeViewport } from './components/CodeViewport';
import { EditorToolbar } from './components/EditorToolbar';
import { ErrorFooter } from './components/ErrorFooter';
import { FindReplaceBar } from './components/FindReplaceBar';
import { GotoLineBar } from './components/GotoLineBar';
import { ModuleExplorer } from './components/ModuleExplorer';
import { tokenizeForHighlight } from './dbmlLanguage';
import { buildSchemaFileTree } from './fileTreeUtils';
import { useEditorAutocomplete } from './hooks/useEditorAutocomplete';
import { useEditorSearchAndNav } from './hooks/useEditorSearchAndNav';
import { DbmlEditorProps } from './types';

export const DbmlEditor: React.FC<DbmlEditorProps> = ({
  value,
  onChange,
  errors,
  scrollToLine,
  enumNames = [],
  tables = [],
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const codeAreaRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const [problemsOpen, setProblemsOpen] = useState(false);

  // Modular file explorer UI state
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [fileSearch, setFileSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileIncludeStub, setNewFileIncludeStub] = useState(true);
  const [renameTargetPath, setRenameTargetPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTargetPath, setDeleteTargetPath] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  const lines = useMemo(() => value.split('\n'), [value]);
  const lineStartOffsets = useMemo(() => {
    const offsets: number[] = [];
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
      offsets.push(pos);
      pos += lines[i].length + 1;
    }
    return offsets;
  }, [lines]);

  const errorsByLine = useMemo(() => {
    const map = new Map<number, ParseError[]>();
    for (const err of errors) {
      if (!map.has(err.line)) map.set(err.line, []);
      map.get(err.line)!.push(err);
    }
    return map;
  }, [errors]);

  const enumNameSet = useMemo(
    () => new Set(enumNames.flatMap((n) => [n, n.toLowerCase()])),
    [enumNames]
  );

  const highlightedLines = useMemo(
    () => tokenizeForHighlight(value, enumNameSet),
    [value, enumNameSet]
  );

  const autocomplete = useEditorAutocomplete({
    value,
    tables,
    enumNames,
    onChange,
    textareaRef,
    scrollContainerRef,
    codeAreaRef,
  });

  const searchAndNav = useEditorSearchAndNav({
    value,
    lines,
    lineStartOffsets,
    isMergedPreview,
    onChange,
    textareaRef,
    scrollContainerRef,
    editorWrapperRef,
    onDismissAutocomplete: autocomplete.dismissAutocomplete,
  });

  useEffect(() => {
    if (!scrollToLine || !scrollContainerRef.current) return;
    const lineHeight = 20;
    const targetTop = Math.max(0, (scrollToLine - 4) * lineHeight);
    scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [scrollToLine, activeFilePath]);

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

  const handleJumpFromMergedCursor = () => {
    if (!onJumpToMergedLine) return;
    const ta = textareaRef.current;
    const pos = ta ? ta.selectionStart : 0;
    const lineNum = Math.max(1, value.slice(0, pos).split('\n').length);
    onJumpToMergedLine(lineNum);
  };

  const handleCopyMergeScript = async () => {
    try {
      await navigator.clipboard.writeText(buildShellMergeScript(schemaFolder));
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isMergedPreview) return;
    const nextVal = e.target.value;
    const pos = e.target.selectionStart;
    onChange(nextVal);
    autocomplete.triggerAutocomplete(nextVal, pos, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMergedPreview) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onJumpToMergedLine) {
        e.preventDefault();
        handleJumpFromMergedCursor();
      }
      return;
    }

    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      autocomplete.triggerAutocomplete(value, e.currentTarget.selectionStart, true);
      return;
    }

    const { acState } = autocomplete;
    if (acState.open && acState.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocomplete.cycleActiveIndex(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocomplete.cycleActiveIndex(-1);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        autocomplete.acceptSuggestion(
          acState.items[acState.activeIndex] || acState.items[0]
        );
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        autocomplete.dismissAutocomplete();
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.substring(0, start) + '  ' + value.substring(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div
      ref={editorWrapperRef}
      className="relative flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800"
    >
      <EditorToolbar
        isModular={isModular}
        isMergedPreview={isMergedPreview}
        activeFilePath={activeFilePath}
        explorerOpen={explorerOpen}
        onToggleExplorer={() => setExplorerOpen((o) => !o)}
        onEnableModularMode={onEnableModularMode}
        findOpen={searchAndNav.findOpen}
        onOpenFind={() => searchAndNav.openFindBar(false)}
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
                <code className="font-mono font-semibold">{schemaFolder}/</code> · Read-only (never pushed to GitHub)
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
                    {copiedScript ? 'Copied build-schema.sh' : 'Copy build-schema.sh'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {searchAndNav.findOpen && (
            <FindReplaceBar
              modKey={modKey}
              findInputRef={searchAndNav.findInputRef}
              replaceInputRef={searchAndNav.replaceInputRef}
              findQuery={searchAndNav.findQuery}
              onFindQueryChange={searchAndNav.setFindQuery}
              replaceQuery={searchAndNav.replaceQuery}
              onReplaceQueryChange={searchAndNav.setReplaceQuery}
              replaceOpen={searchAndNav.replaceOpen}
              onToggleReplace={() => searchAndNav.setReplaceOpen((r) => !r)}
              matchCase={searchAndNav.matchCase}
              onToggleMatchCase={() => searchAndNav.setMatchCase((v) => !v)}
              wholeWord={searchAndNav.wholeWord}
              onToggleWholeWord={() => searchAndNav.setWholeWord((v) => !v)}
              matchCount={searchAndNav.findMatches.length}
              safeMatchIdx={searchAndNav.safeMatchIdx}
              onGoToMatch={searchAndNav.goToMatch}
              onReplaceCurrent={searchAndNav.handleReplaceCurrent}
              onReplaceAll={searchAndNav.handleReplaceAll}
              onClose={searchAndNav.closeFindBar}
            />
          )}

          {searchAndNav.gotoOpen && (
            <GotoLineBar
              gotoInputRef={searchAndNav.gotoInputRef}
              gotoValue={searchAndNav.gotoValue}
              onGotoValueChange={searchAndNav.setGotoValue}
              totalLines={lines.length}
              onSubmit={searchAndNav.handleSubmitGotoLine}
              onClose={searchAndNav.closeGotoLine}
            />
          )}

          <div ref={codeAreaRef} className="relative flex-1 flex min-h-0 overflow-hidden">
            <CodeViewport
              value={value}
              lines={lines}
              lineStartOffsets={lineStartOffsets}
              highlightedLines={highlightedLines}
              errorsByLine={errorsByLine}
              scrollToLine={scrollToLine}
              gotoHighlightLine={searchAndNav.gotoHighlightLine}
              findMatches={searchAndNav.findMatches}
              safeMatchIdx={searchAndNav.safeMatchIdx}
              isMergedPreview={isMergedPreview}
              hasJumpToMerged={Boolean(onJumpToMergedLine)}
              scrollContainerRef={scrollContainerRef}
              textareaRef={textareaRef}
              onScrollDismissAutocomplete={autocomplete.dismissAutocomplete}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onJumpFromMergedCursor={handleJumpFromMergedCursor}
            />

            {autocomplete.acState.open && autocomplete.acState.items.length > 0 && (
              <AutocompletePopover
                items={autocomplete.acState.items}
                activeIndex={autocomplete.acState.activeIndex}
                top={autocomplete.acState.top}
                left={autocomplete.acState.left}
                onSelect={autocomplete.acceptSuggestion}
                onHoverIndex={autocomplete.setActiveIndex}
              />
            )}
          </div>

          <ErrorFooter
            errors={errors}
            problemsOpen={problemsOpen}
            onToggleProblems={() => setProblemsOpen((p) => !p)}
            onJumpToLine={searchAndNav.jumpToLine}
            isModular={isModular}
            otherFileErrorEntries={otherFileErrorEntries}
            otherFileErrorsCount={otherFileErrorsCount}
            onSelectFile={onSelectFile}
            lineCount={lines.length}
            modKey={modKey}
            onOpenGotoLine={searchAndNav.openGotoLine}
          />
        </div>
      </div>
    </div>
  );
};
