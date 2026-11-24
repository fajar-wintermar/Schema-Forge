import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  compact?: boolean;
  fullScreen?: boolean;
  resetKeys?: ReadonlyArray<unknown>;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function haveResetKeysChanged(
  prevKeys?: ReadonlyArray<unknown>,
  nextKeys?: ReadonlyArray<unknown>
): boolean {
  if (!prevKeys && !nextKeys) return false;
  if (!prevKeys || !nextKeys) return true;
  if (prevKeys.length !== nextKeys.length) return true;
  return prevKeys.some((val, index) => !Object.is(val, nextKeys[index]));
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      haveResetKeysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.setState({ error: null });
    }
  }

  private handleReset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const title = this.props.title || 'Something went wrong in this view';
    const description =
      this.props.description ||
      error.message ||
      'An unexpected rendering error occurred.';

    if (this.props.compact) {
      return (
        <div
          role="alert"
          className="h-full w-full flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950"
        >
          <div className="max-w-sm w-full rounded-xl border border-rose-200 dark:border-rose-900/70 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-sm">
            <div className="flex items-start gap-2.5 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {title}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 break-words leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Try again</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className={`${
          this.props.fullScreen ? 'h-screen w-screen' : 'flex-1 h-full w-full'
        } flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950`}
      >
        <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 break-words leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try again</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
