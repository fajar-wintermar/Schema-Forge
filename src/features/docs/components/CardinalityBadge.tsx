import React from 'react';
import { GitBranch } from 'lucide-react';
import { RefRelation } from '../../../types/schema';
import { CARDINALITY_META } from '../types';

export const CardinalityBadge: React.FC<{ relation: RefRelation }> = ({
  relation,
}) => {
  const meta = CARDINALITY_META[relation];
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium whitespace-nowrap ${meta.badgeCls}`}
    >
      <span className="font-mono font-bold">{meta.symbol}</span>
      <span>{meta.title}</span>
      <span className="font-mono opacity-80">({meta.ratio})</span>
    </span>
  );
};

export const CardinalityLegend: React.FC = () => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
      <GitBranch className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
      <span>Cardinality Legend</span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      {(['>', '<', '-', '<>'] as const satisfies readonly RefRelation[]).map((rel) => {
        const meta = CARDINALITY_META[rel];
        return (
          <div
            key={rel}
            className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <CardinalityBadge relation={rel} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              {meta.description}
            </p>
          </div>
        );
      })}
    </div>
  </div>
);
