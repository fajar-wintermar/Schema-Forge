import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { TableGroupDef } from '@shared/domain/schemaTypes';

interface GroupModalProps {
  initialGroup: TableGroupDef | null;
  allTableIds: string[];
  onClose: () => void;
  onSave: (data: {
    name: string;
    color: string;
    note: string;
    tables: string[];
    oldName?: string;
  }) => void;
}

const DOMAIN_COLORS = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DC2626',
  '#0284C7',
  '#DB2777',
  '#475569',
];

export const TableGroupModal: React.FC<GroupModalProps> = ({
  initialGroup,
  allTableIds,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialGroup?.name || '');
  const [color, setColor] = useState(initialGroup?.color || '#2563EB');
  const [note, setNote] = useState(initialGroup?.note || '');
  const [selectedTables, setSelectedTables] = useState<Set<string>>(
    new Set(initialGroup?.tables || [])
  );

  const toggleTable = (id: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      color,
      note: note.trim(),
      tables: Array.from(selectedTables),
      oldName: initialGroup?.name,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
            {initialGroup
              ? `Edit Business Domain: ${initialGroup.name}`
              : 'Create Business Domain (TableGroup)'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Domain Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Order Fulfillment, Identity & Access"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Domain Color
            </label>
            <div className="flex items-center gap-2">
              {DOMAIN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-md border border-black/15 flex items-center justify-center ${
                    color.toLowerCase() === c.toLowerCase()
                      ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-900'
                      : ''
                  }`}
                >
                  {color.toLowerCase() === c.toLowerCase() && (
                    <Check className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-7 rounded cursor-pointer border-0 bg-transparent ml-1"
                title="Custom domain color"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Business Logic Description
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain what business domain capabilities this group owns..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Assign Tables
              </span>
              <span className="text-slate-400 tabular-nums">
                {selectedTables.size} selected
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
              {allTableIds.map((id) => {
                const checked = selectedTables.has(id);
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-xs font-mono transition-colors ${
                      checked
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTable(id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate">{id}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
          >
            {initialGroup ? 'Save Changes' : 'Create Domain'}
          </button>
        </div>
      </form>
    </div>
  );
};
