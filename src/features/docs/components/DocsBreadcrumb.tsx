import React from 'react';
import { ArrowLeft, PanelLeft } from 'lucide-react';

export interface DocsBreadcrumbProps {
  navOpen: boolean;
  modKey: string;
  onToggleNav: () => void;
  onBackClick: () => void;
  backLabel?: string;
  segments: Array<{ label: string; mono?: boolean; isCurrent?: boolean }>;
}

export const DocsBreadcrumb: React.FC<DocsBreadcrumbProps> = ({
  navOpen,
  modKey,
  onToggleNav,
  onBackClick,
  backLabel = 'Schema Overview',
  segments,
}) => (
  <div className="flex flex-wrap items-center gap-2 text-xs">
    {!navOpen && (
      <button
        type="button"
        onClick={onToggleNav}
        title={`Show Docs navigation (${modKey}J)`}
        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <PanelLeft className="w-3.5 h-3.5" />
      </button>
    )}
    <button
      type="button"
      onClick={onBackClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      <span>{backLabel}</span>
    </button>
    {segments.map((seg, idx) => (
      <React.Fragment key={idx}>
        <span className="text-slate-400">/</span>
        <span
          className={`${seg.mono ? 'font-mono' : ''} ${
            seg.isCurrent
              ? 'font-semibold text-slate-900 dark:text-slate-100'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {seg.label}
        </span>
      </React.Fragment>
    ))}
  </div>
);
