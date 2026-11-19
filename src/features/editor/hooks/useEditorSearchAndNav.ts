import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseEditorSearchAndNavOptions {
  value: string;
  lines: string[];
  lineStartOffsets: number[];
  isMergedPreview: boolean;
  onChange: (nextDbml: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  editorWrapperRef: React.RefObject<HTMLDivElement | null>;
  onDismissAutocomplete: () => void;
}

export function useEditorSearchAndNav({
  value,
  lines,
  lineStartOffsets,
  isMergedPreview,
  onChange,
  textareaRef,
  scrollContainerRef,
  editorWrapperRef,
  onDismissAutocomplete,
}: UseEditorSearchAndNavOptions) {
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const gotoInputRef = useRef<HTMLInputElement>(null);

  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState('');
  const [gotoHighlightLine, setGotoHighlightLine] = useState<number | null>(null);

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
    [value, scrollContainerRef]
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
      onDismissAutocomplete();
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
    [findQuery, value, textareaRef, onDismissAutocomplete]
  );

  const closeFindBar = useCallback(() => {
    setFindOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, [textareaRef]);

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
  }, [
    isMergedPreview,
    findMatches,
    safeMatchIdx,
    value,
    replaceQuery,
    onChange,
    scrollToOffset,
  ]);

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
    onDismissAutocomplete();
    requestAnimationFrame(() => {
      gotoInputRef.current?.focus();
      gotoInputRef.current?.select();
    });
  }, [value, textareaRef, onDismissAutocomplete]);

  const closeGotoLine = useCallback(() => {
    setGotoOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, [textareaRef]);

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
    [lines, lineStartOffsets, textareaRef, scrollContainerRef]
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

  // Global editor Find (Ctrl/Cmd+F), Find+Replace (Ctrl/Cmd+H), and Go to Line (Ctrl/Cmd+G)
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
  }, [openFindBar, openGotoLine, editorWrapperRef]);

  useEffect(() => {
    if (!findOpen || findMatches.length === 0) {
      setActiveMatchIdx(0);
      return;
    }
    setActiveMatchIdx(0);
    scrollToOffset(findMatches[0].start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen, findQuery, matchCase, wholeWord]);

  return {
    findInputRef,
    replaceInputRef,
    gotoInputRef,
    findOpen,
    replaceOpen,
    setReplaceOpen,
    findQuery,
    setFindQuery,
    replaceQuery,
    setReplaceQuery,
    matchCase,
    setMatchCase,
    wholeWord,
    setWholeWord,
    findMatches,
    safeMatchIdx,
    gotoOpen,
    gotoValue,
    setGotoValue,
    gotoHighlightLine,
    openFindBar,
    closeFindBar,
    goToMatch,
    handleReplaceCurrent,
    handleReplaceAll,
    openGotoLine,
    closeGotoLine,
    jumpToLine,
    handleSubmitGotoLine,
  };
}
