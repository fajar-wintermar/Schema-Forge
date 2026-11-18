import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { ParseError } from '../../types/schema';
import {
  buildShellMergeScript,
  createStarterModuleDbml,
  MERGED_SCHEMA_VIEW_ID,
  normalizeModulePath,
} from '../../utils/schemaModules';
import { AutocompletePopover } from './components/AutocompletePopover';
import { EditorToolbar } from './components/EditorToolbar';
import { ErrorFooter } from './components/ErrorFooter';
import { FindReplaceBar } from './components/FindReplaceBar';
import { GotoLineBar } from './components/GotoLineBar';
import { ModuleExplorer } from './components/ModuleExplorer';
import { getAutocompleteContext, tokenizeForHighlight } from './dbmlLanguage';
import { buildSchemaFileTree } from './fileTreeUtils';
import { AutocompleteItem, DbmlEditorProps } from './types';

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
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const gotoInputRef = useRef<HTMLInputElement>(null);
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

  // Find & Replace state
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  // Go to Line state
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState('');
  const [gotoHighlightLine, setGotoHighlightLine] = useState<number | null>(null);

  // Autocomplete state
  const [acState, setAcState] = useState<{
    open: boolean;
    items: AutocompleteItem[];
    replaceStart: number;
    cursorPos: number;
    activeIndex: number;
    top: number;
    left: number;
  }>({
    open: false,
    items: [],
    replaceStart: 0,
    cursorPos: 0,
    activeIndex: 0,
    top: 0,
    left: 0,
  });

  const lines = value.split('\n');
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

  const findMatches = useMemo<Array<{ start: number; end: number }>>(() => {
    if (!findOpen || !findQuery) return [];
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
    const flags = matchCase ? 'g' : 'gi';
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return [];
    }
    const matches: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(value)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      matches.push({ start: m.index, end: m.index + m[0].length });
      if (matches.length >= 2000) break;
    }
    return matches;
  }, [findOpen, findQuery, matchCase, wholeWord, value]);

  const safeMatchIdx =
    findMatches.length > 0 ? Math.min(activeMatchIdx, findMatches.length - 1) : 0;

  const scrollToOffset = useCallback(
    (offset: number) => {
      if (!scrollContainerRef.current) return;
      const before = value.slice(0, offset);
      const row = before.split('\n').length - 1;
      const targetTop = Math.max(0, (row - 3) * 20);
      scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
    },
    [value]
  );

  const openFindBar = useCallback(
    (withReplace: boolean) => {
      const ta = textareaRef.current;
      let seededQuery = findQuery;
      if (ta && ta.selectionStart !== ta.selectionEnd) {
        const selected = value.slice(ta.selectionStart, ta.selectionEnd);
        if (!selected.includes('\n') && selected.length <= 120) {
          seededQuery = selected;
          setFindQuery(selected);
        }
      }
      setFindOpen(true);
      if (withReplace) setReplaceOpen(true);
      setAcState((s) => (s.open ? { ...s, open: false } : s));
      requestAnimationFrame(() => {
        if (withReplace && seededQuery) {
          replaceInputRef.current?.focus();
          replaceInputRef.current?.select();
        } else {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }
      });
    },
    [findQuery, value]
  );

  const closeFindBar = useCallback(() => {
    setFindOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const goToMatch = useCallback(
    (nextIdx: number) => {
      if (findMatches.length === 0) return;
      const normalized =
        ((nextIdx % findMatches.length) + findMatches.length) % findMatches.length;
      setActiveMatchIdx(normalized);
      scrollToOffset(findMatches[normalized].start);
    },
    [findMatches, scrollToOffset]
  );

  const handleReplaceCurrent = useCallback(() => {
    if (isMergedPreview || findMatches.length === 0) return;
    const target = findMatches[safeMatchIdx];
    const next = value.slice(0, target.start) + replaceQuery + value.slice(target.end);
    onChange(next);
    if (findMatches.length > 1) {
      scrollToOffset(target.start + replaceQuery.length);
    }
  }, [isMergedPreview, findMatches, safeMatchIdx, value, replaceQuery, onChange, scrollToOffset]);

  const handleReplaceAll = useCallback(() => {
    if (isMergedPreview || findMatches.length === 0) return;
    let out = '';
    let last = 0;
    for (const m of findMatches) {
      out += value.slice(last, m.start) + replaceQuery;
      last = m.end;
    }
    out += value.slice(last);
    onChange(out);
    setActiveMatchIdx(0);
  }, [isMergedPreview, findMatches, value, replaceQuery, onChange]);

  const openGotoLine = useCallback(() => {
    const ta = textareaRef.current;
    const currentLine = ta
      ? value.slice(0, ta.selectionStart).split('\n').length
      : 1;
    setFindOpen(false);
    setGotoOpen(true);
    setGotoValue(String(currentLine));
    setAcState((s) => (s.open ? { ...s, open: false } : s));
    requestAnimationFrame(() => {
      gotoInputRef.current?.focus();
      gotoInputRef.current?.select();
    });
  }, [value]);

  const closeGotoLine = useCallback(() => {
    setGotoOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const jumpToLine = useCallback(
    (lineNum: number, colNum = 1) => {
      const clampedLine = Math.max(1, Math.min(lines.length, lineNum));
      const lineText = lines[clampedLine - 1] || '';
      const clampedCol = Math.max(1, Math.min(lineText.length + 1, colNum));
      const pos = (lineStartOffsets[clampedLine - 1] || 0) + (clampedCol - 1);

      setGotoHighlightLine(clampedLine);

      const ta = textareaRef.current;
      if (ta) {
        ta.setSelectionRange(pos, pos);
        ta.focus({ preventScroll: true });
      }

      const container = scrollContainerRef.current;
      if (container) {
        const lineTop = 12 + (clampedLine - 1) * 20;
        const offsetFromTop = Math.min(
          140,
          Math.max(40, Math.floor(container.clientHeight * 0.25))
        );
        const targetTop = Math.max(0, lineTop - offsetFromTop);

        const colX = (clampedCol - 1) * 7.5;
        let targetLeft = container.scrollLeft;
        if (colX < container.scrollLeft) {
          targetLeft = Math.max(0, colX - 24);
        } else if (colX > container.scrollLeft + container.clientWidth - 96) {
          targetLeft = Math.max(0, colX - container.clientWidth + 120);
        }

        container.scrollTo({
          top: targetTop,
          left: targetLeft,
          behavior: 'smooth',
        });
      }
    },
    [lines, lineStartOffsets]
  );

  const handleSubmitGotoLine = useCallback(() => {
    const raw = gotoValue.trim();
    if (!raw) return;
    const parts = raw.split(':');
    const parsedLine = parseInt(parts[0], 10);
    if (Number.isNaN(parsedLine)) return;
    const parsedCol = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
    setGotoOpen(false);
    requestAnimationFrame(() => {
      jumpToLine(parsedLine, parsedCol);
    });
  }, [gotoValue, jumpToLine]);

  // Global editor Find (Ctrl/Cmd+F), Find+Replace (Ctrl/Cmd+H), and Go to Line (Ctrl/Cmd+G) listener
  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'f' && key !== 'h' && key !== 'g') return;

      const active = document.activeElement;
      const insideEditor = Boolean(
        editorWrapperRef.current && active && editorWrapperRef.current.contains(active)
      );
      const typingElsewhere =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable) &&
        !insideEditor;

      if (typingElsewhere) return;

      e.preventDefault();
      if (key === 'g') {
        openGotoLine();
      } else {
        setGotoOpen(false);
        openFindBar(key === 'h');
      }
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [openFindBar, openGotoLine]);

  useEffect(() => {
    if (!findOpen || findMatches.length === 0) {
      setActiveMatchIdx(0);
      return;
    }
    setActiveMatchIdx(0);
    scrollToOffset(findMatches[0].start);
  }, [findOpen, findQuery, matchCase, wholeWord]);

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
    if (!onRenameFile || !renameTargetPath || !renameValue.trim()) {
      return;
    }
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

  const computePopupCoords = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const split = before.split('\n');
    const row = split.length - 1;
    const col = split[split.length - 1].length;
    const scrollTop = scrollContainerRef.current?.scrollTop || 0;
    const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    const codeRect = codeAreaRef.current?.getBoundingClientRect();

    const rawTop = 12 + (row + 1) * 20 - scrollTop + 2;
    const rawLeft = 44 + 12 + col * 7.5 - scrollLeft;

    const maxTop = codeRect ? Math.max(24, codeRect.height - 210) : 280;
    const top = rawTop > maxTop ? Math.max(8, rawTop - 210) : Math.max(8, rawTop);
    const maxLeft = codeRect ? Math.max(16, codeRect.width - 284) : 220;
    const left = Math.min(maxLeft, Math.max(48, rawLeft));

    return { top, left };
  }, []);

  const triggerAutocomplete = useCallback(
    (text: string, cursorPos: number, force = false) => {
      const { replaceStart, items } = getAutocompleteContext(
        text,
        cursorPos,
        tables,
        enumNames
      );
      if (items.length === 0) {
        setAcState((s) => (s.open ? { ...s, open: false } : s));
        return;
      }
      const typedLen = cursorPos - replaceStart;
      const prevChar = text[cursorPos - 1];
      if (!force && typedLen === 0 && prevChar !== '.' && prevChar !== '[') {
        setAcState((s) => (s.open ? { ...s, open: false } : s));
        return;
      }
      const { top, left } = computePopupCoords(text, cursorPos);
      setAcState({
        open: true,
        items,
        replaceStart,
        cursorPos,
        activeIndex: 0,
        top,
        left,
      });
    },
    [tables, enumNames, computePopupCoords]
  );

  const acceptSuggestion = useCallback(
    (item: AutocompleteItem) => {
      const next =
        value.slice(0, acState.replaceStart) +
        item.insertText +
        value.slice(acState.cursorPos);
      onChange(next);
      const targetPos =
        acState.replaceStart +
        item.insertText.length -
        (item.cursorOffsetBack || 0);
      setAcState((s) => ({ ...s, open: false }));
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(targetPos, targetPos);
        }
      });
    },
    [value, acState.replaceStart, acState.cursorPos, onChange]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isMergedPreview) return;
    const nextVal = e.target.value;
    const pos = e.target.selectionStart;
    onChange(nextVal);
    triggerAutocomplete(nextVal, pos, false);
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
      triggerAutocomplete(value, e.currentTarget.selectionStart, true);
      return;
    }

    if (acState.open && acState.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAcState((s) => ({
          ...s,
          activeIndex: (s.activeIndex + 1) % s.items.length,
        }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAcState((s) => ({
          ...s,
          activeIndex: (s.activeIndex - 1 + s.items.length) % s.items.length,
        }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptSuggestion(acState.items[acState.activeIndex] || acState.items[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAcState((s) => ({ ...s, open: false }));
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
        findOpen={findOpen}
        onOpenFind={() => openFindBar(false)}
        isMaximized={isMaximized}
        onToggleMaximize={onToggleMaximize}
        onMinimize={onMinimize}
        modKey={modKey}
      />

      {/* Editor Main Workspace (Optional File Explorer Tree + Code Editor) */}
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

        {/* Code Column */}
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
              onToggleReplace={() => setReplaceOpen((r) => !r)}
              matchCase={matchCase}
              onToggleMatchCase={() => setMatchCase((v) => !v)}
              wholeWord={wholeWord}
              onToggleWholeWord={() => setWholeWord((v) => !v)}
              matchCount={findMatches.length}
              safeMatchIdx={safeMatchIdx}
              onGoToMatch={goToMatch}
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
              totalLines={lines.length}
              onSubmit={handleSubmitGotoLine}
              onClose={closeGotoLine}
            />
          )}

          {/* Editor Body with Shared-Scroll Synchronized Syntax Highlighting */}
          <div ref={codeAreaRef} className="relative flex-1 flex min-h-0 overflow-hidden">
            <div
              ref={scrollContainerRef}
              onScroll={() => {
                if (acState.open) setAcState((s) => ({ ...s, open: false }));
              }}
              className="flex-1 flex min-h-0 overflow-auto relative"
            >
              <div className="sticky left-0 z-20 w-11 shrink-0 py-3 pb-8 pr-2 text-right font-mono text-[12px] leading-[20px] text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 border-r border-slate-200/70 dark:border-slate-800/80 select-none tabular-nums h-fit min-h-full">
                {lines.map((_, idx) => {
                  const lineNum = idx + 1;
                  const lineErrs = errorsByLine.get(lineNum);
                  const hasErr = Boolean(lineErrs && lineErrs.length > 0);
                  const isActiveLine =
                    scrollToLine === lineNum || gotoHighlightLine === lineNum;
                  return (
                    <div
                      key={lineNum}
                      title={
                        lineErrs ? lineErrs.map((e) => e.message).join(' | ') : undefined
                      }
                      className={`h-[20px] leading-[20px] flex items-center justify-end gap-0.5 ${
                        hasErr
                          ? 'text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40'
                          : isActiveLine
                          ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/30'
                          : ''
                      }`}
                    >
                      {hasErr && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      )}
                      <span>{lineNum}</span>
                    </div>
                  );
                })}
              </div>

              <div className="relative flex-1 min-w-max h-fit min-h-full">
                <pre
                  aria-hidden="true"
                  style={{ tabSize: 2, fontVariantLigatures: 'none' }}
                  className="m-0 py-3 pb-8 px-3 pr-8 font-mono font-normal text-[12.5px] leading-[20px] whitespace-pre pointer-events-none select-none"
                >
                  {highlightedLines.map((segs, lineIdx) => {
                    const lineNum = lineIdx + 1;
                    const hasErr = errorsByLine.has(lineNum);
                    const isHighlighted =
                      scrollToLine === lineNum || gotoHighlightLine === lineNum;
                    const lineStart = lineStartOffsets[lineIdx] || 0;
                    const lineLen = lines[lineIdx]?.length || 0;
                    const lineEnd = lineStart + lineLen;

                    const lineMatchSpans: Array<{
                      start: number;
                      end: number;
                      isActive: boolean;
                    }> = [];
                    if (findMatches.length > 0 && lineLen > 0) {
                      for (let mi = 0; mi < findMatches.length; mi++) {
                        const m = findMatches[mi];
                        if (m.end <= lineStart) continue;
                        if (m.start >= lineEnd) break;
                        lineMatchSpans.push({
                          start: Math.max(m.start, lineStart),
                          end: Math.min(m.end, lineEnd),
                          isActive: mi === safeMatchIdx,
                        });
                      }
                    }

                    let renderedSegments: React.ReactNode;
                    if (segs.length === 0) {
                      renderedSegments = <span>{'\u200b'}</span>;
                    } else if (lineMatchSpans.length === 0) {
                      renderedSegments = segs.map((seg, sIdx) => (
                        <span key={sIdx} className={seg.className}>
                          {seg.text}
                        </span>
                      ));
                    } else {
                      const nodes: React.ReactNode[] = [];
                      let cursor = lineStart;
                      segs.forEach((seg, sIdx) => {
                        const segStart = cursor;
                        const segEnd = segStart + seg.text.length;
                        cursor = segEnd;

                        let pos = segStart;
                        for (const ms of lineMatchSpans) {
                          if (ms.end <= pos || ms.start >= segEnd) continue;
                          if (ms.start > pos) {
                            nodes.push(
                              <span key={`${sIdx}-${pos}`} className={seg.className}>
                                {seg.text.slice(pos - segStart, ms.start - segStart)}
                              </span>
                            );
                          }
                          const hiStart = Math.max(pos, ms.start);
                          const hiEnd = Math.min(segEnd, ms.end);
                          nodes.push(
                            <span
                              key={`${sIdx}-m-${hiStart}`}
                              className={`${seg.className} ${
                                ms.isActive
                                  ? 'bg-orange-400/55 dark:bg-orange-500/55 rounded-[2px]'
                                  : 'bg-amber-300/45 dark:bg-amber-500/35 rounded-[2px]'
                              }`}
                            >
                              {seg.text.slice(hiStart - segStart, hiEnd - segStart)}
                            </span>
                          );
                          pos = hiEnd;
                        }
                        if (pos < segEnd) {
                          nodes.push(
                            <span key={`${sIdx}-tail-${pos}`} className={seg.className}>
                              {seg.text.slice(pos - segStart)}
                            </span>
                          );
                        }
                      });
                      renderedSegments = nodes;
                    }

                    return (
                      <div
                        key={lineIdx}
                        className={`h-[20px] leading-[20px] ${
                          hasErr
                            ? 'bg-rose-50/80 dark:bg-rose-950/30 border-b border-rose-500/60 -mx-3 px-3'
                            : isHighlighted
                            ? 'bg-blue-50/80 dark:bg-blue-950/30 -mx-3 px-3'
                            : ''
                        }`}
                      >
                        {renderedSegments}
                      </div>
                    );
                  })}
                </pre>

                <textarea
                  ref={textareaRef}
                  value={value}
                  readOnly={isMergedPreview}
                  onChange={handleChange}
                  onClick={() =>
                    setAcState((s) => (s.open ? { ...s, open: false } : s))
                  }
                  onDoubleClick={() => {
                    if (isMergedPreview && onJumpToMergedLine) {
                      handleJumpFromMergedCursor();
                    }
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setAcState((s) => (s.open ? { ...s, open: false } : s));
                    }, 140);
                  }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollTop !== 0) el.scrollTop = 0;
                    if (el.scrollLeft !== 0) el.scrollLeft = 0;
                  }}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  wrap="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  aria-label="DBML Source Code Editor"
                  style={{ tabSize: 2, fontVariantLigatures: 'none' }}
                  className="dbml-editor-textarea absolute inset-0 z-10 w-full h-full m-0 py-3 pb-8 px-3 pr-8 border-0 font-mono font-normal text-[12.5px] leading-[20px] whitespace-pre bg-transparent text-transparent caret-slate-900 dark:caret-slate-100 resize-none focus:outline-none overflow-hidden selection:bg-blue-500/30 selection:text-transparent"
                />
              </div>
            </div>

            {acState.open && acState.items.length > 0 && (
              <AutocompletePopover
                items={acState.items}
                activeIndex={acState.activeIndex}
                top={acState.top}
                left={acState.left}
                onSelect={acceptSuggestion}
                onHoverIndex={(idx) =>
                  setAcState((s) => ({ ...s, activeIndex: idx }))
                }
              />
            )}
          </div>

          <ErrorFooter
            errors={errors}
            problemsOpen={problemsOpen}
            onToggleProblems={() => setProblemsOpen((p) => !p)}
            onJumpToLine={jumpToLine}
            isModular={isModular}
            otherFileErrorEntries={otherFileErrorEntries}
            otherFileErrorsCount={otherFileErrorsCount}
            onSelectFile={onSelectFile}
            lineCount={lines.length}
            modKey={modKey}
            onOpenGotoLine={openGotoLine}
          />
        </div>
      </div>
    </div>
  );
};
