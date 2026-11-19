import React from 'react';
import { GitCompare, History, Layers } from 'lucide-react';
import { ChangelogTab } from './components/ChangelogTab';
import { DomainsTab } from './components/DomainsTab';
import { VersionsTab } from './components/VersionsTab';
import { SidebarProps } from './types';

export type { SidebarTab, SidebarProps } from './types';

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
}) => (
  <aside className="w-[300px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full select-none z-10">
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

    {activeTab === 'domains' && (
      <DomainsTab
        schema={schema}
        selectedDomains={selectedDomains}
        selectedTableId={selectedTableId}
        onChangeSelectedDomains={onChangeSelectedDomains}
        onSelectTable={onSelectTable}
        onFocusGroupOnCanvas={onFocusGroupOnCanvas}
        onCreateGroup={onCreateGroup}
        onEditGroup={onEditGroup}
        onDeleteGroup={onDeleteGroup}
        onAutoLayoutGroup={onAutoLayoutGroup}
        onMoveTableToGroup={onMoveTableToGroup}
        onRemoveTableFromGroup={onRemoveTableFromGroup}
        onReorderGroups={onReorderGroups}
        onReorderTableInGroup={onReorderTableInGroup}
      />
    )}

    {activeTab === 'versions' && (
      <VersionsTab
        versions={versions}
        onSaveVersion={onSaveVersion}
        onRestoreVersion={onRestoreVersion}
        onTogglePublishVersion={onTogglePublishVersion}
      />
    )}

    {activeTab === 'changelog' && (
      <ChangelogTab
        schema={schema}
        currentDbml={currentDbml}
        versions={versions}
        onSelectTable={onSelectTable}
      />
    )}
  </aside>
);
