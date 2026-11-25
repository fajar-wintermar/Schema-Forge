import { useCallback, useState } from 'react';
import type { EdgeRoutingMode } from '../../../utils/io/edgeGeometry';
import {
  AUTO_LOD_STORAGE_KEY,
  CROSS_DOMAIN_EDGE_STORAGE_KEY,
  type CrossDomainEdgeMode,
  CURSOR_MODE_STORAGE_KEY,
  type CursorMode,
  EDGE_ROUTING_STORAGE_KEY,
  FOCUS_MODE_STORAGE_KEY,
} from '../types';

export function useDiagramPreferences() {
  const [snapGrid, setSnapGrid] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [cursorMode, setCursorMode] = useState<CursorMode>(() => {
    try {
      const saved = localStorage.getItem(CURSOR_MODE_STORAGE_KEY);
      return saved === 'pan' || saved === 'marquee' ? saved : 'select';
    } catch {
      return 'select';
    }
  });
  const [autoLod, setAutoLod] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_LOD_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [routingMode, setRoutingMode] = useState<EdgeRoutingMode>(() => {
    try {
      const saved = localStorage.getItem(EDGE_ROUTING_STORAGE_KEY);
      return saved === 'orthogonal' ? 'orthogonal' : 'bezier';
    } catch {
      return 'bezier';
    }
  });
  const [crossDomainMode, setCrossDomainMode] = useState<CrossDomainEdgeMode>(
    () => {
      try {
        const saved = localStorage.getItem(CROSS_DOMAIN_EDGE_STORAGE_KEY);
        return saved === 'bundle' || saved === 'hide' ? saved : 'show';
      } catch {
        return 'show';
      }
    }
  );

  const toggleAutoLod = useCallback(() => {
    setAutoLod((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_LOD_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const updateFocusMode = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setFocusMode((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        try {
          localStorage.setItem(FOCUS_MODE_STORAGE_KEY, String(resolved));
        } catch {
          // ignore storage errors
        }
        return resolved;
      });
    },
    []
  );

  const toggleRoutingMode = useCallback(() => {
    setRoutingMode((prev) => {
      const next: EdgeRoutingMode =
        prev === 'bezier' ? 'orthogonal' : 'bezier';
      try {
        localStorage.setItem(EDGE_ROUTING_STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const updateCrossDomainMode = useCallback((next: CrossDomainEdgeMode) => {
    setCrossDomainMode(next);
    try {
      localStorage.setItem(CROSS_DOMAIN_EDGE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const updateCursorMode = useCallback((mode: CursorMode) => {
    setCursorMode(mode);
    try {
      localStorage.setItem(CURSOR_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }, []);

  return {
    snapGrid,
    setSnapGrid,
    showMinimap,
    setShowMinimap,
    cursorMode,
    updateCursorMode,
    autoLod,
    toggleAutoLod,
    focusMode,
    updateFocusMode,
    routingMode,
    toggleRoutingMode,
    crossDomainMode,
    updateCrossDomainMode,
  };
}
