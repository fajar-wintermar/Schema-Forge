import React from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';

interface AsyncLoadingStateProps {
  message?: string;
  className?: string;
}

export const AsyncLoadingState: React.FC<AsyncLoadingStateProps> = ({
  message = 'Loading...',
  className = 'py-6',
}) => (
  <div
    className={`flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 ${className}`}
  >
    <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
    <span>{message}</span>
  </div>
);

interface AsyncErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const AsyncErrorState: React.FC<AsyncErrorStateProps> = ({
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}) => (
  <div
    role="alert"
    className={`p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3 ${className}`}
  >
    <div className="flex items-start gap-2 min-w-0">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="break-words">{message}</span>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-rose-300 dark:border-rose-700 bg-white/80 dark:bg-slate-900 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-white dark:hover:bg-slate-800 shrink-0"
      >
        <RefreshCw className="w-3 h-3" />
        <span>{retryLabel}</span>
      </button>
    )}
  </div>
);

interface AsyncEmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const AsyncEmptyState: React.FC<AsyncEmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = 'p-6',
}) => (
  <div
    className={`rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2 ${className}`}
  >
    <div className="flex justify-center text-slate-400">
      {icon ?? <Inbox className="w-6 h-6" />}
    </div>
    <div className="font-semibold text-slate-700 dark:text-slate-200">
      {title}
    </div>
    {description && <div className="leading-relaxed">{description}</div>}
    {action && <div className="pt-1 flex justify-center">{action}</div>}
  </div>
);
