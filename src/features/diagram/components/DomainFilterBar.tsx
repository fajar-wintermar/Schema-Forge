import React from 'react';
import { Check, ChevronDown, Crosshair, Filter, X } from 'lucide-react';
import {
  formatDomainLabel,
  TableGroupDef,
  UNGROUPED_DOMAIN_ID,
} from '../../../types/schema';
import type { CrossDomainEdgeMode } from '../types';

export interface DomainFilterBarProps {
  tableGroups: TableGroupDef[];
  ungroupedCount: number;
  selectedDomains: string[];
  selectedDomainSet: Set<string>;
  isFilteringDomains: boolean;
  domainMenuOpen: boolean;
  filterMenuRef: React.RefObject<HTMLDivElement | null>;
  onSetDomainMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onChangeSelectedDomains: (domains: string[]) => void;
  hasCrossDomainEdges: boolean;
  crossDomainEdgeCount: number;
  crossDomainMode: CrossDomainEdgeMode;
  onChangeCrossDomainMode: (mode: CrossDomainEdgeMode) => void;
  focusMode: boolean;
  focusedTableId: string | null;
  neighborCount: number;
  onClearFocusSelection: () => void;
  onExitFocusMode: () => void;
}

export const DomainFilterBar: React.FC<DomainFilterBarProps> = ({
  tableGroups,
  ungroupedCount,
  selectedDomains,
  selectedDomainSet,
  isFilteringDomains,
  domainMenuOpen,
  filterMenuRef,
  onSetDomainMenuOpen,
  onChangeSelectedDomains,
  hasCrossDomainEdges,
  crossDomainEdgeCount,
  crossDomainMode,
  onChangeCrossDomainMode,
  focusMode,
  focusedTableId,
  neighborCount,
  onClearFocusSelection,
  onExitFocusMode,
}) => {
  const showDomainFilter = tableGroups.length > 0 || isFilteringDomains;
  const showUngroupedOption =
    ungroupedCount > 0 || selectedDomainSet.has(UNGROUPED_DOMAIN_ID);

  const showBar =
    showDomainFilter ||
    hasCrossDomainEdges ||
    crossDomainMode !== 'show' ||
    focusMode;

  if (!showBar) return null;

  const isUngroupedChecked = selectedDomainSet.has(UNGROUPED_DOMAIN_ID);

  return (
    <div
      ref={filterMenuRef}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5 max-w-[calc(100%-1.5rem)]"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {showDomainFilter && (
          <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-sm">
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
                title={
                  selectedDomains.length > 0
                    ? selectedDomains.map(formatDomainLabel).join(', ')
                    : 'Filter visible domains or ungrouped tables'
                }
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
                    ? formatDomainLabel(selectedDomains[0])
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
                                onChangeSelectedDomains([
                                  ...selectedDomains,
                                  g.name,
                                ]);
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

                    {showUngroupedOption && (
                      <>
                        {tableGroups.length > 0 && (
                          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                        )}
                        <div
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                            isUngroupedChecked
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-medium'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (isUngroupedChecked) {
                                onChangeSelectedDomains(
                                  selectedDomains.filter(
                                    (d) => d !== UNGROUPED_DOMAIN_ID
                                  )
                                );
                              } else {
                                onChangeSelectedDomains([
                                  ...selectedDomains,
                                  UNGROUPED_DOMAIN_ID,
                                ]);
                              }
                            }}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                isUngroupedChecked
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {isUngroupedChecked && (
                                <Check className="w-2.5 h-2.5" />
                              )}
                            </span>
                            <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-slate-400 dark:border-slate-500 bg-slate-200/80 dark:bg-slate-700 shrink-0" />
                            <span className="truncate flex-1">Ungrouped</span>
                            <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                              {ungroupedCount}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onChangeSelectedDomains([UNGROUPED_DOMAIN_ID]);
                              onSetDomainMenuOpen(false);
                            }}
                            title="Show only ungrouped tables"
                            className="text-[10px] font-medium text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 px-1 py-0.5 rounded shrink-0"
                          >
                            Only
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {(hasCrossDomainEdges || crossDomainMode !== 'show') && (
          <div
            className="flex items-center gap-0.5 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-sm"
            role="group"
            aria-label="Cross-domain relationship links"
            title={`Cross-domain links (${crossDomainEdgeCount})`}
          >
            <span className="px-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hidden sm:inline whitespace-nowrap">
              Cross-domain:
            </span>
            {(
              [
                { id: 'show', label: 'Show', title: 'Show all cross-domain links' },
                {
                  id: 'bundle',
                  label: 'Bundle',
                  title: 'Bundle cross-domain links per domain pair',
                },
                { id: 'hide', label: 'Hide', title: 'Hide cross-domain links' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeCrossDomainMode(opt.id)}
                title={opt.title}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  crossDomainMode === opt.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {focusMode && (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/95 dark:bg-blue-950/90 text-xs text-blue-900 dark:text-blue-100 shadow-xs backdrop-blur-xs">
          <Crosshair className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          {focusedTableId ? (
            <>
              <span className="font-medium truncate max-w-[240px]">
                Focus: <span className="font-mono font-semibold">{focusedTableId}</span>
                {' · '}
                {neighborCount} neighbor{neighborCount === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={onClearFocusSelection}
                className="text-[11px] text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            </>
          ) : (
            <span>Click any table to isolate its 1-hop neighborhood</span>
          )}
          <button
            type="button"
            onClick={onExitFocusMode}
            title="Exit Focus Neighborhood Mode (F)"
            aria-label="Exit Focus Neighborhood Mode"
            className="p-0.5 rounded hover:bg-blue-200/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
