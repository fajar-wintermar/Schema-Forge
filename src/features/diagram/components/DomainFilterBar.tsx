import React from 'react';
import { Check, ChevronDown, Filter } from 'lucide-react';
import { TableGroupDef } from '../../../types/schema';

export interface DomainFilterBarProps {
  tableGroups: TableGroupDef[];
  selectedDomains: string[];
  selectedDomainSet: Set<string>;
  isFilteringDomains: boolean;
  domainMenuOpen: boolean;
  filterMenuRef: React.RefObject<HTMLDivElement | null>;
  onSetDomainMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onChangeSelectedDomains: (domains: string[]) => void;
}

export const DomainFilterBar: React.FC<DomainFilterBarProps> = ({
  tableGroups,
  selectedDomains,
  selectedDomainSet,
  isFilteringDomains,
  domainMenuOpen,
  filterMenuRef,
  onSetDomainMenuOpen,
  onChangeSelectedDomains,
}) => {
  if (tableGroups.length === 0) return null;

  return (
    <div
      ref={filterMenuRef}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute top-3 left-3 z-20 flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-sm"
    >
      <button
        type="button"
        onClick={() => {
          onChangeSelectedDomains([]);
          onSetDomainMenuOpen(false);
        }}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
          !isFilteringDomains
            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        All Domains
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => onSetDomainMenuOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            isFilteringDomains
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Filter className="w-3 h-3 shrink-0" />
          <span className="max-w-[160px] truncate">
            {selectedDomains.length === 0
              ? 'Only Selected'
              : selectedDomains.length === 1
              ? selectedDomains[0]
              : `${selectedDomains.length} Domains`}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-80" />
        </button>

        {domainMenuOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden z-30">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Domain Visibility</span>
              {isFilteringDomains && (
                <button
                  type="button"
                  onClick={() => {
                    onChangeSelectedDomains([]);
                    onSetDomainMenuOpen(false);
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Show All
                </button>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  onChangeSelectedDomains([]);
                  onSetDomainMenuOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between transition-colors ${
                  !isFilteringDomains
                    ? 'bg-slate-100 dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-50'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <span>Show All Domains</span>
                {!isFilteringDomains && (
                  <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                )}
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {tableGroups.map((g) => {
                const checked = selectedDomainSet.has(g.name);
                return (
                  <div
                    key={g.name}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      checked
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (checked) {
                          onChangeSelectedDomains(
                            selectedDomains.filter((d) => d !== g.name)
                          );
                        } else {
                          onChangeSelectedDomains([...selectedDomains, g.name]);
                        }
                      }}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {checked && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: g.color || '#2563EB' }}
                      />
                      <span className="truncate flex-1">{g.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChangeSelectedDomains([g.name]);
                        onSetDomainMenuOpen(false);
                      }}
                      title={`Show only ${g.name}`}
                      className="text-[10px] font-medium text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 px-1 py-0.5 rounded shrink-0"
                    >
                      Only
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
