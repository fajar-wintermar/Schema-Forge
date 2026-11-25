import React, { useCallback, useEffect, useRef, useState } from 'react';

interface UseSplitResizeOptions {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function useSplitResize({
  initialWidth = 460,
  minWidth = 280,
  maxWidth = 900,
}: UseSplitResizeOptions = {}) {
  const [editorWidth, setEditorWidth] = useState(initialWidth);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const startSplitResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      cleanupRef.current?.();

      const startX = e.clientX;
      const origWidth = editorWidth;
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: PointerEvent) => {
        const viewportCap =
          typeof window !== 'undefined'
            ? Math.max(minWidth, window.innerWidth - 260)
            : maxWidth;
        const effectiveMax = Math.min(maxWidth, viewportCap);
        const next = Math.min(
          effectiveMax,
          Math.max(minWidth, origWidth + (ev.clientX - startX))
        );
        setEditorWidth(next);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        cleanupRef.current = null;
      };

      cleanupRef.current = onUp;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [editorWidth, minWidth, maxWidth]
  );

  return { editorWidth, setEditorWidth, startSplitResize };
}
