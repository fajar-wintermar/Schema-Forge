import { useCallback, useState } from 'react';
import { TableDef } from '../../../types/schema';
import { getAutocompleteContext } from '../dbmlLanguage';
import { AutocompleteItem } from '../types';

interface UseEditorAutocompleteOptions {
  value: string;
  tables: TableDef[];
  enumNames: string[];
  onChange: (nextDbml: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  codeAreaRef: React.RefObject<HTMLDivElement | null>;
}

export function useEditorAutocomplete({
  value,
  tables,
  enumNames,
  onChange,
  textareaRef,
  scrollContainerRef,
  codeAreaRef,
}: UseEditorAutocompleteOptions) {
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

  const dismissAutocomplete = useCallback(() => {
    setAcState((s) => (s.open ? { ...s, open: false } : s));
  }, []);

  const computePopupCoords = useCallback(
    (text: string, cursorPos: number) => {
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
      const top =
        rawTop > maxTop ? Math.max(8, rawTop - 210) : Math.max(8, rawTop);
      const maxLeft = codeRect ? Math.max(16, codeRect.width - 284) : 220;
      const left = Math.min(maxLeft, Math.max(48, rawLeft));

      return { top, left };
    },
    [scrollContainerRef, codeAreaRef]
  );

  const triggerAutocomplete = useCallback(
    (text: string, cursorPos: number, force = false) => {
      const { replaceStart, items } = getAutocompleteContext(
        text,
        cursorPos,
        tables,
        enumNames
      );
      if (items.length === 0) {
        dismissAutocomplete();
        return;
      }
      const typedLen = cursorPos - replaceStart;
      const prevChar = text[cursorPos - 1];
      if (!force && typedLen === 0 && prevChar !== '.' && prevChar !== '[') {
        dismissAutocomplete();
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
    [tables, enumNames, computePopupCoords, dismissAutocomplete]
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
    [value, acState.replaceStart, acState.cursorPos, onChange, textareaRef]
  );

  const setActiveIndex = useCallback((idx: number) => {
    setAcState((s) => ({ ...s, activeIndex: idx }));
  }, []);

  const cycleActiveIndex = useCallback((delta: number) => {
    setAcState((s) => ({
      ...s,
      activeIndex:
        (s.activeIndex + delta + s.items.length) % s.items.length,
    }));
  }, []);

  return {
    acState,
    dismissAutocomplete,
    triggerAutocomplete,
    acceptSuggestion,
    setActiveIndex,
    cycleActiveIndex,
  };
}
