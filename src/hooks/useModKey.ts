import { useMemo } from 'react';

export function useModKey(): '⌘' | 'Ctrl+' {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return '⌘';
    const platform = navigator.platform || navigator.userAgent || '';
    return /Mac|iPod|iPhone|iPad/i.test(platform) ? '⌘' : 'Ctrl+';
  }, []);
}
