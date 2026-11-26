import { useCallback, useState } from 'react';
import type { EdgeRoutingMode } from '../../../utils/io/edgeGeometry';
import {
  AUTO_LOD_STORAGE_KEY,
  CROSS_DOMAIN_EDGE_STORAGE_KEY,
  type CrossDomainEdgeMode,
  CURSOR_MODE_STORAGE_KEY,
  type CursorMode,
  EDGE_ROUTING_STORAGE_KEY,
  FK_CARDINALITY_STORAGE_KEY,
  FOCUS_MODE_STORAGE_KEY,
  LAYOUT_LOCKED_STORAGE_KEY,
} from '../types';

export interface DiagramPreferencesSnapshot {
  cursorMode: CursorMode;
  autoLod: boolean;
  focusMode: boolean;
  routingMode: EdgeRoutingMode;
  crossDomainMode: CrossDomainEdgeMode;
  showCardinality: boolean;
  layoutLocked: boolean;
}

export function readDiagramPreferences(): DiagramPreferencesSnapshot {
  const defaults: DiagramPreferencesSnapshot = {
    cursorMode: 'select',
    autoLod: true,
    focusMode: false,
    routingMode: 'bezier',
    crossDomainMode: 'show',
    showCardinality: true,
    layoutLocked: false,
  };
  try {
    const cursorSaved = localStorage.getItem(CURSOR_MODE_STORAGE_KEY);
    if (cursorSaved === 'pan' || cursorSaved === 'marquee') {
      defaults.cursorMode = cursorSaved;
    }
    defaults.autoLod = localStorage.getItem(AUTO_LOD_STORAGE_KEY) !== 'false';
    defaults.focusMode = localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === 'true';
    if (localStorage.getItem(EDGE_ROUTING_STORAGE_KEY) === 'orthogonal') {
      defaults.routingMode = 'orthogonal';
    }
    const crossSaved = localStorage.getItem(CROSS_DOMAIN_EDGE_STORAGE_KEY);
    if (crossSaved === 'bundle' || crossSaved === 'hide') {
      defaults.crossDomainMode = crossSaved;
    }
    defaults.showCardinality =
      localStorage.getItem(FK_CARDINALITY_STORAGE_KEY) !== 'false';
    defaults.layoutLocked =
      localStorage.getItem(LAYOUT_LOCKED_STORAGE_KEY) === 'true';
  } catch {
    // ignore storage errors (e.g. SSR or restricted iframes)
  }
  return defaults;
}

export function useDiagramPreferences() {
  const [snapGrid, setSnapGrid] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [cursorMode, setCursorMode] = useState<CursorMode>(
    () => readDiagramPreferences().cursorMode
  );
  const [autoLod, setAutoLod] = useState<boolean>(
    () => readDiagramPreferences().autoLod
  );
  const [focusMode, setFocusMode] = useState<boolean>(
    () => readDiagramPreferences().focusMode
  );
  const [routingMode, setRoutingMode] = useState<EdgeRoutingMode>(
    () => readDiagramPreferences().routingMode
  );
  const [crossDomainMode, setCrossDomainMode] = useState<CrossDomainEdgeMode>(
    () => readDiagramPreferences().crossDomainMode
  );
  const [showCardinality, setShowCardinality] = useState<boolean>(
    () => readDiagramPreferences().showCardinality
  );
  const [layoutLocked, setLayoutLocked] = useState<boolean>(
    () => readDiagramPreferences().layoutLocked
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

  const toggleShowCardinality = useCallback(() => {
    setShowCardinality((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(FK_CARDINALITY_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const toggleLayoutLocked = useCallback(() => {
    setLayoutLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LAYOUT_LOCKED_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
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
    showCardinality,
    toggleShowCardinality,
    layoutLocked,
    toggleLayoutLocked,
  };
}
