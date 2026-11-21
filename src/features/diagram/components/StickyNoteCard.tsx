import React from 'react';
import { Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { StickyNote, StickyNoteColor } from '../../../types/schema';
import { CursorMode, NOTE_STYLES } from '../types';

export interface StickyNoteCardProps {
  note: StickyNote;
  cursorMode: CursorMode;
  isDimmed?: boolean;
  readOnly?: boolean;
  onStartDrag: (e: React.PointerEvent) => void;
  onUpdate: (patch: Partial<StickyNote>) => void;
  onDelete: () => void;
}

export const StickyNoteCard: React.FC<StickyNoteCardProps> = ({
  note,
  cursorMode,
  isDimmed = false,
  readOnly = false,
  onStartDrag,
  onUpdate,
  onDelete,
}) => {
  const style = NOTE_STYLES[note.color] || NOTE_STYLES.amber;
  return (
    <div
      style={{ left: note.x, top: note.y, width: note.width }}
      className={`absolute rounded-lg border shadow-sm transition-opacity ${
        cursorMode === 'pan' ? 'pointer-events-none' : 'pointer-events-auto'
      } ${isDimmed ? 'opacity-30' : ''} ${style.bg} ${style.border} ${style.text}`}
    >
      <div
        onPointerDown={(e) => {
          if (cursorMode === 'pan' || readOnly) return;
          e.stopPropagation();
          onStartDrag(e);
        }}
        className={`px-2.5 py-1.5 rounded-t-[7px] flex items-center justify-between gap-1.5 ${
          readOnly ? '' : 'cursor-move'
        } ${style.header}`}
      >
        {readOnly ? (
          <div className="text-xs font-bold flex-1 min-w-0 truncate">
            {note.title || 'Architecture Note'}
          </div>
        ) : (
          <input
            type="text"
            value={note.title}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Note title..."
            className="bg-transparent text-xs font-bold focus:outline-none flex-1 min-w-0"
          />
        )}
        <div
          className="flex items-center gap-1 shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!readOnly &&
            (
              ['amber', 'sky', 'emerald', 'rose', 'slate'] as StickyNoteColor[]
            ).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onUpdate({ color: c })}
                className={`w-2.5 h-2.5 rounded-full border border-black/20 ${
                  c === 'amber'
                    ? 'bg-amber-400'
                    : c === 'sky'
                    ? 'bg-sky-400'
                    : c === 'emerald'
                    ? 'bg-emerald-400'
                    : c === 'rose'
                    ? 'bg-rose-400'
                    : 'bg-slate-400'
                } ${note.color === c ? 'ring-1 ring-offset-1 ring-slate-700' : ''}`}
                title={`Color: ${c}`}
              />
            ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onUpdate({ collapsed: !note.collapsed })}
              className="p-0.5 opacity-70 hover:opacity-100"
              title={note.collapsed ? 'Expand note' : 'Collapse note'}
            >
              {note.collapsed ? (
                <Maximize2 className="w-3 h-3" />
              ) : (
                <Minimize2 className="w-3 h-3" />
              )}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={onDelete}
              className="p-0.5 opacity-70 hover:opacity-100 hover:text-rose-600"
              title="Delete sticky note"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {!note.collapsed && (
        <div className="p-2.5 space-y-1.5">
          {readOnly ? (
            <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">
              {note.content}
            </div>
          ) : (
            <textarea
              value={note.content}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                onUpdate({
                  content: e.target.value,
                  updatedAt: new Date().toISOString(),
                })
              }
              rows={4}
              placeholder="Write architecture notes, edge cases, or review comments..."
              className="w-full bg-transparent text-xs leading-relaxed resize-none focus:outline-none"
            />
          )}
          {note.linkedTarget && (
            <div className="text-[10px] opacity-70 font-mono truncate">
              Linked: {note.linkedTarget}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
