import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from './useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 right-4 z-50 flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/95 dark:bg-amber-950/95 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-100 shadow-lg backdrop-blur-xs"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
      <span>Offline Mode — Changes saved locally in IndexedDB</span>
    </div>
  );
};
