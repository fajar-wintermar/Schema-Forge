import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  modKey: string;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  modKey,
  onClose,
}) => {
  const shortcuts = [
    { label: 'Toggle left sidebar', keys: [`${modKey}`, 'B'] },
    { label: 'Toggle Docs table navigation tree', keys: [`${modKey}`, 'J'] },
    { label: 'Toggle code editor (minimize / restore)', keys: [`${modKey}`, '\\'] },
    { label: 'Find text in code editor', keys: [`${modKey}`, 'F'] },
    { label: 'Find & replace in code editor', keys: [`${modKey}`, 'H'] },
    { label: 'Go to line in code editor', keys: [`${modKey}`, 'G'] },
    { label: 'Toggle maximize / restore code editor', keys: [`${modKey}`, '⇧', 'E'] },
    { label: 'Open Import / Export studio', keys: [`${modKey}`, 'I'] },
    { label: 'Save version snapshot', keys: [`${modKey}`, 'S'] },
    { label: 'Global search (tables, columns, domains)', keys: [`${modKey}`, 'K'] },
    { label: 'Close active modal', keys: ['Esc'] },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 divide-y divide-slate-100 dark:divide-slate-800">
          {shortcuts.map((item) => (
            <div
              key={item.label}
              className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs"
            >
              <span className="text-slate-700 dark:text-slate-200">
                {item.label}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {item.keys.map((k, idx) => (
                  <kbd
                    key={idx}
                    className="px-1.5 py-0.5 min-w-[22px] text-center font-mono text-[11px] font-semibold rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
