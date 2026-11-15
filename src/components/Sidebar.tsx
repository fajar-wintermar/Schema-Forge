import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  GitCompare,
  GripVertical,
  History,
  Layers,
  LayoutGrid,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import {
  ParsedSchema,
  SchemaVersion,
  TableGroupDef,
} from '../types/schema';
import { computeSchemaDiff } from '../utils/schemaDiff';

export type SidebarTab = 'domains' | 'versions' | 'changelog';

interface SidebarProps {
  activeTab: SidebarTab;
  onChangeTab: (tab: SidebarTab) => void;
  schema: ParsedSchema;
  currentDbml: string;
  versions: SchemaVersion[];
  selectedDomains: string[];
  onChangeSelectedDomains: (domains: string[]) => void;
  selectedTableId: string | null;
  onSelectTable: (tableId: string) => void;
  onFocusGroupOnCanvas: (groupName: string) => void;
  onCreateGroup: () => void;
  onEditGroup: (group: TableGroupDef) => void;
  onDeleteGroup: (groupName: string) => void;
  onAutoLayoutGroup: (groupName: string) => void;
  onMoveTableToGroup: (
    tableId: string,
    targetGroup: string | null,
    sourceGroup?: string | null,
    keepInSource?: boolean
  ) => void;
  onRemoveTableFromGroup: (tableId: string, groupName: string) => void;
  onReorderGroups: (orderedGroupNames: string[]) => void;
  onReorderTableInGroup: (groupName: string, orderedTables: string[]) => void;
  onSaveVersion: () => void;
  onRestoreVersion: (version: SchemaVersion) => void;
  onTogglePublishVersion: (versionId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onChangeTab,
  schema,
  currentDbml,
  versions,
  selectedDomains,
  onChangeSelectedDomains,
  selectedTableId,
  onSelectTable,
  onFocusGroupOnCanvas,
  onCreateGroup,
  onEditGroup,
  onDeleteGroup,
  onAutoLayoutGroup,
  onMoveTableToGroup,
  onRemoveTableFromGroup,
  onReorderGroups,
  onReorderTableInGroup,
  onSaveVersion,
  onRestoreVersion,
  onTogglePublishVersion,
}) => {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [draggedTable, setDraggedTable] = useState<{
    tableId: string;
    sourceGroup: string | null;
  } | null>(null);
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [dropHoverGroup, setDropHoverGroup] = useState<string | null>(null);

  // Changelog selectors
  const [compareFromId, setCompareFromId] = useState<string>(
    versions[1]?.id || versions[0]?.id || 'working'
  );
  const [compareToId, setCompareToId] = useState<string>('working');
  const [diffFilter, setDiffFilter] = useState<'all' | 'added' | 'modified' | 'removed'>('all');
  const [diffDomainFilter, setDiffDomainFilter] = useState<string>('all');
  const [showLineDiff, setShowLineDiff] = useState(false);

  const tableDomainCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of schema.tableGroups) {
      for (const t of new Set(g.tables)) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return counts;
  }, [schema.tableGroups]);

  const ungroupedTables = useMemo(() => {
    return schema.tables.filter((t) => !tableDomainCount.has(t.id));
  }, [schema.tables, tableDomainCount]);

  const query = search.trim().toLowerCase();

  const toggleGroupExpand = (name: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [name]: prev[name] === false ? true : !(prev[name] ?? true),
    }));
  };

  const isGroupExpanded = (name: string) => expandedGroups[name] ?? true;

  // Compute diff for Changelog tab
  const diffResult = useMemo(() => {
    const getDbmlForId = (id: string) => {
      if (id === 'working') return currentDbml;
      return versions.find((v) => v.id === id)?.dbml || currentDbml;
    };
    return computeSchemaDiff(getDbmlForId(compareFromId), getDbmlForId(compareToId));
  }, [compareFromId, compareToId, currentDbml, versions]);

  const filteredTableDiffs = useMemo(() => {
    return diffResult.tables.filter((td) => {
      if (diffFilter !== 'all' && td.status !== diffFilter) return false;
      if (diffDomainFilter !== 'all') {
        const groups = td.groupNames || [];
        if (diffDomainFilter === 'Ungrouped') {
          if (groups.length > 0) return false;
        } else if (!groups.includes(diffDomainFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [diffResult.tables, diffFilter, diffDomainFilter]);

  return (
    <aside className="w-[300px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full select-none z-10">
      {/* Sidebar Tabs */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => onChangeTab('domains')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap min-w-0 ${
              activeTab === 'domains'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Domains</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('versions')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap min-w-0 ${
              activeTab === 'versions'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Versions</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('changelog')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap min-w-0 ${
              activeTab === 'changelog'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Changelog</span>
          </button>
        </div>
      </div>

      {/* TAB 1: BUSINESS DOMAINS & TABLES */}
      {activeTab === 'domains' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter domains or tables..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                {schema.tableGroups.length} domains · {schema.tables.length} tables
              </span>
              <button
                type="button"
                onClick={onCreateGroup}
                className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New Domain</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Drag tables to move · Hold Alt + drop to share in multiple domains
            </p>

            {schema.tableGroups.length > 0 && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80">
                  <button
                    type="button"
                    onClick={() => onChangeSelectedDomains([])}
                    className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                      selectedDomains.length === 0
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Show All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedDomains.length === 0 && schema.tableGroups[0]) {
                        onChangeSelectedDomains([schema.tableGroups[0].name]);
                        onFocusGroupOnCanvas(schema.tableGroups[0].name);
                      }
                    }}
                    className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                      selectedDomains.length > 0
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {selectedDomains.length > 0
                      ? `Selected (${selectedDomains.length})`
                      : 'Selected Only'}
                  </button>
                </div>

                {selectedDomains.length > 0 && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-xs">
                    <span className="text-blue-800 dark:text-blue-200 truncate font-medium">
                      {selectedDomains.join(', ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChangeSelectedDomains([])}
                      className="text-blue-600 dark:text-blue-300 hover:underline shrink-0 ml-2 font-medium"
                    >
                      Show All
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {schema.tableGroups.map((group) => {
              const matchingTables = group.tables.filter((tId) => {
                if (!query) return true;
                return (
                  tId.toLowerCase().includes(query) ||
                  group.name.toLowerCase().includes(query)
                );
              });
              if (
                query &&
                matchingTables.length === 0 &&
                !group.name.toLowerCase().includes(query)
              ) {
                return null;
              }

              const expanded = isGroupExpanded(group.name);
              const isFiltering = selectedDomains.length > 0;
              const isDomainSelected = selectedDomains.includes(group.name);
              const isDomainVisible = !isFiltering || isDomainSelected;
              const isDropTarget = dropHoverGroup === group.name;

              return (
                <div
                  key={group.name}
                  draggable
                  onDragStart={(e) => {
                    if (draggedTable) return;
                    setDraggedGroup(group.name);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDraggedGroup(null);
                    setDropHoverGroup(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropHoverGroup(group.name);
                  }}
                  onDragLeave={() => {
                    if (dropHoverGroup === group.name) setDropHoverGroup(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropHoverGroup(null);
                    if (draggedTable) {
                      const keepInSource = e.altKey || e.ctrlKey || e.metaKey;
                      onMoveTableToGroup(
                        draggedTable.tableId,
                        group.name,
                        draggedTable.sourceGroup,
                        keepInSource
                      );
                      setDraggedTable(null);
                    } else if (draggedGroup && draggedGroup !== group.name) {
                      const names = schema.tableGroups.map((g) => g.name);
                      const fromIdx = names.indexOf(draggedGroup);
                      const toIdx = names.indexOf(group.name);
                      if (fromIdx >= 0 && toIdx >= 0) {
                        const next = [...names];
                        const [moved] = next.splice(fromIdx, 1);
                        next.splice(toIdx, 0, moved);
                        onReorderGroups(next);
                      }
                      setDraggedGroup(null);
                    }
                  }}
                  className={`rounded-lg border transition-all ${
                    isDropTarget
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                      : isDomainSelected
                      ? 'border-blue-400 dark:border-blue-600 bg-blue-50/30 dark:bg-blue-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                  } ${!isDomainVisible ? 'opacity-55' : ''}`}
                >
                  {/* Group Header */}
                  <div className="flex items-center gap-1.5 px-2 py-2">
                    <GripVertical className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 cursor-grab shrink-0" />
                    <button
                      type="button"
                      onClick={() => toggleGroupExpand(group.name)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                    >
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: group.color || '#2563EB' }}
                    />
                    <button
                      type="button"
                      onClick={() => onFocusGroupOnCanvas(group.name)}
                      className="flex-1 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 truncate hover:text-blue-600 dark:hover:text-blue-400"
                      title={group.note || `Focus ${group.name} on canvas`}
                    >
                      {group.name}
                    </button>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                      {group.tables.length}
                    </span>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isFiltering) {
                            onChangeSelectedDomains([group.name]);
                            onFocusGroupOnCanvas(group.name);
                          } else if (isDomainSelected) {
                            onChangeSelectedDomains(
                              selectedDomains.filter((d) => d !== group.name)
                            );
                          } else {
                            onChangeSelectedDomains([
                              ...selectedDomains,
                              group.name,
                            ]);
                            onFocusGroupOnCanvas(group.name);
                          }
                        }}
                        title={
                          !isFiltering
                            ? 'Show only this domain'
                            : isDomainSelected
                            ? 'Hide from selected domains'
                            : 'Include in selected domains'
                        }
                        className={`p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700/70 ${
                          isDomainSelected
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {isDomainVisible ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onAutoLayoutGroup(group.name)}
                        title="Auto-layout tables inside this domain"
                        className="p-1 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                      >
                        <Sparkles className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditGroup(group)}
                        title="Edit domain settings"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteGroup(group.name)}
                        title="Delete domain grouping (keeps tables)"
                        className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {group.note && expanded && (
                    <p className="px-3 pb-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                      {group.note}
                    </p>
                  )}

                  {/* Member Tables */}
                  {expanded && (
                    <div className="px-1.5 pb-1.5 space-y-0.5">
                      {matchingTables.length === 0 ? (
                        <div className="px-2 py-2 text-[11px] text-slate-400 italic text-center">
                          Drag tables here to assign
                        </div>
                      ) : (
                        matchingTables.map((tableId) => {
                          const tableObj = schema.tables.find((t) => t.id === tableId);
                          const isSelected = selectedTableId === tableId;
                          const domCount = tableDomainCount.get(tableId) || 1;
                          return (
                            <div
                              key={tableId}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDraggedTable({ tableId, sourceGroup: group.name });
                                e.dataTransfer.effectAllowed = 'copyMove';
                              }}
                              onDragEnd={() => {
                                setDraggedTable(null);
                                setDropHoverGroup(null);
                              }}
                              onDragOver={(e) => {
                                if (draggedTable && draggedTable.sourceGroup === group.name) {
                                  e.preventDefault();
                                }
                              }}
                              onDrop={(e) => {
                                if (
                                  draggedTable &&
                                  draggedTable.sourceGroup === group.name &&
                                  draggedTable.tableId !== tableId
                                ) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const next = [...group.tables];
                                  const fromIdx = next.indexOf(draggedTable.tableId);
                                  const toIdx = next.indexOf(tableId);
                                  if (fromIdx >= 0 && toIdx >= 0) {
                                    const [moved] = next.splice(fromIdx, 1);
                                    next.splice(toIdx, 0, moved);
                                    onReorderTableInGroup(group.name, next);
                                  }
                                  setDraggedTable(null);
                                }
                              }}
                              onClick={() => onSelectTable(tableId)}
                              className={`group/item flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <Table2
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isSelected ? 'text-blue-100' : 'text-slate-400'
                                }`}
                              />
                              <span className="flex-1 truncate font-medium">
                                {tableId}
                              </span>
                              {domCount > 1 && (
                                <span
                                  title={`Shared across ${domCount} domains`}
                                  className={`text-[10px] font-mono tabular-nums shrink-0 ${
                                    isSelected
                                      ? 'text-blue-100'
                                      : 'text-blue-600 dark:text-blue-400'
                                  }`}
                                >
                                  {domCount}×
                                </span>
                              )}
                              <span
                                className={`text-[10px] tabular-nums ${
                                  isSelected
                                    ? 'text-blue-100'
                                    : 'text-slate-400'
                                }`}
                              >
                                {tableObj?.columns.length ?? 0}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveTableFromGroup(tableId, group.name);
                                }}
                                title={`Remove ${tableId} from ${group.name}`}
                                className={`p-0.5 rounded opacity-0 group-hover/item:opacity-100 transition-opacity ${
                                  isSelected
                                    ? 'text-blue-100 hover:text-white'
                                    : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
                                }`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ungrouped Tables Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDropHoverGroup('__ungrouped__');
              }}
              onDragLeave={() => {
                if (dropHoverGroup === '__ungrouped__') setDropHoverGroup(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropHoverGroup(null);
                if (draggedTable) {
                  onMoveTableToGroup(
                    draggedTable.tableId,
                    null,
                    draggedTable.sourceGroup
                  );
                  setDraggedTable(null);
                }
              }}
              className={`rounded-lg border border-dashed p-2 transition-colors ${
                dropHoverGroup === '__ungrouped__'
                  ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between px-1 pb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Ungrouped Tables</span>
                </span>
                <span className="tabular-nums">{ungroupedTables.length}</span>
              </div>
              {ungroupedTables.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-1">
                  All tables belong to a domain
                </p>
              ) : (
                <div className="space-y-0.5">
                  {ungroupedTables
                    .filter((t) =>
                      !query ? true : t.id.toLowerCase().includes(query)
                    )
                    .map((t) => {
                      const isSelected = selectedTableId === t.id;
                      return (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={() =>
                            setDraggedTable({ tableId: t.id, sourceGroup: null })
                          }
                          onDragEnd={() => {
                            setDraggedTable(null);
                            setDropHoverGroup(null);
                          }}
                          onClick={() => onSelectTable(t.id)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Table2 className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          <span className="flex-1 truncate font-medium">
                            {t.id}
                          </span>
                          <span className="text-[10px] opacity-70 tabular-nums">
                            {t.columns.length}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VERSION HISTORY */}
      {activeTab === 'versions' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Version Snapshots
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Stored locally in IndexedDB
              </p>
            </div>
            <button
              type="button"
              onClick={onSaveVersion}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Snapshot</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {versions.length === 0 ? (
              <div className="text-center py-8 px-4 text-xs text-slate-500 dark:text-slate-400">
                No snapshots yet. Save a version to track schema evolution and
                revert anytime.
              </div>
            ) : (
              versions.map((ver) => (
                <div
                  key={ver.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {ver.tag}
                    </span>
                    <button
                      type="button"
                      onClick={() => onTogglePublishVersion(ver.id)}
                      className={`text-[11px] font-medium transition-colors ${
                        ver.isPublished
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                      }`}
                    >
                      {ver.isPublished ? 'Published' : 'Draft · Publish'}
                    </button>
                  </div>
                  <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    {ver.title}
                  </div>
                  {ver.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {ver.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {new Date(ver.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRestoreVersion(ver)}
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Revert to this</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SCHEMA CHANGELOG */}
      {activeTab === 'changelog' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Base Version
                </label>
                <select
                  value={compareFromId}
                  onChange={(e) => setCompareFromId(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.tag} {v.isPublished ? '(Pub)' : ''}
                    </option>
                  ))}
                  <option value="working">Working Draft</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Target Version
                </label>
                <select
                  value={compareToId}
                  onChange={(e) => setCompareToId(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="working">Working Draft</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.tag} {v.isPublished ? '(Pub)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Diff Filters */}
            <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
              {(['all', 'added', 'modified', 'removed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDiffFilter(f)}
                  className={`flex-1 py-1 text-[11px] font-medium rounded capitalize transition-colors ${
                    diffFilter === f
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <select
                value={diffDomainFilter}
                onChange={(e) => setDiffDomainFilter(e.target.value)}
                className="flex-1 px-2 py-1 text-[11px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                <option value="all">All Domains</option>
                {schema.tableGroups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
                <option value="Ungrouped">Ungrouped</option>
              </select>

              <button
                type="button"
                onClick={() => setShowLineDiff((p) => !p)}
                className="px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                {showLineDiff ? 'Semantic' : 'Raw Diff'}
              </button>
            </div>

            {/* Summary counts */}
            <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                +{diffResult.summary.tablesAdded} tables
              </span>
              <span>·</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                ~{diffResult.summary.tablesModified} modified
              </span>
              <span>·</span>
              <span className="text-rose-600 dark:text-rose-400 font-medium">
                -{diffResult.summary.tablesRemoved} removed
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {showLineDiff ? (
              <div className="font-mono text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                {diffResult.lineDiff
                  .filter((l) => l.type !== 'context')
                  .slice(0, 250)
                  .map((l, idx) => (
                    <div
                      key={idx}
                      className={`px-2 py-0.5 whitespace-pre-wrap break-all ${
                        l.type === 'added'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
                      }`}
                    >
                      {l.type === 'added' ? '+ ' : '- '}
                      {l.text}
                    </div>
                  ))}
                {diffResult.lineDiff.filter((l) => l.type !== 'context').length === 0 && (
                  <div className="p-4 text-center text-slate-400 font-sans">
                    No textual differences between selected versions.
                  </div>
                )}
              </div>
            ) : (
              <>
                {filteredTableDiffs.length === 0 &&
                diffResult.groups.length === 0 &&
                diffResult.refs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400">
                    No schema differences found for the selected comparison.
                  </div>
                ) : (
                  <>
                    {/* Domain / TableGroup Diffs */}
                    {diffResult.groups.length > 0 && diffDomainFilter === 'all' && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Domain Group Changes
                        </div>
                        {diffResult.groups.map((gd) => (
                          <div
                            key={gd.name}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-800 dark:text-slate-100">
                                {gd.name}
                              </span>
                              <span
                                className={`text-[11px] font-medium capitalize ${
                                  gd.status === 'added'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : gd.status === 'removed'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {gd.status}
                              </span>
                            </div>
                            {gd.addedTables.length > 0 && (
                              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                                + {gd.addedTables.join(', ')}
                              </div>
                            )}
                            {gd.removedTables.length > 0 && (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono">
                                - {gd.removedTables.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Table & Column Diffs */}
                    {filteredTableDiffs.map((td) => (
                      <div
                        key={td.tableId}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectTable(td.tableId)}
                            className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                          >
                            {td.tableId}
                          </button>
                          <span
                            className={`text-[11px] font-medium capitalize shrink-0 ${
                              td.status === 'added'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : td.status === 'removed'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {td.status}
                          </span>
                        </div>
                        {td.groupNames && td.groupNames.length > 0 && (
                          <div className="text-[11px] text-slate-400">
                            Domains: {td.groupNames.join(', ')}
                          </div>
                        )}
                        <div className="space-y-1 pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
                          {td.columnDiffs.map((cd) => (
                            <div
                              key={cd.name}
                              className="text-[11px] flex items-start justify-between gap-2 font-mono"
                            >
                              <span
                                className={
                                  cd.status === 'added'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : cd.status === 'removed'
                                    ? 'text-rose-600 dark:text-rose-400 line-through'
                                    : 'text-amber-600 dark:text-amber-400'
                                }
                              >
                                {cd.status === 'added'
                                  ? '+'
                                  : cd.status === 'removed'
                                  ? '-'
                                  : '~'}{' '}
                                {cd.name}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400 text-right truncate">
                                {cd.changes.join('; ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Relationship Diffs */}
                    {diffResult.refs.length > 0 && diffDomainFilter === 'all' && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Relationship Changes
                        </div>
                        {diffResult.refs.map((rd, i) => (
                          <div
                            key={i}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-mono"
                          >
                            <span
                              className={
                                rd.status === 'added'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : rd.status === 'removed'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              {rd.status === 'added'
                                ? '+ '
                                : rd.status === 'removed'
                                ? '- '
                                : '~ '}
                              {rd.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
