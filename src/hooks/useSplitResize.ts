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
    (e: React.MouseEvent) => {
      e.preventDefault();
      cleanupRef.current?.();

      const startX = e.clientX;
      const origWidth = editorWidth;

      const onMove = (ev: MouseEvent) => {
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, origWidth + (ev.clientX - startX))
        );
        setEditorWidth(next);
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        cleanupRef.current = null;
      };

      cleanupRef.current = onUp;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [editorWidth, minWidth, maxWidth]
  );

  return { editorWidth, setEditorWidth, startSplitResize };
}
