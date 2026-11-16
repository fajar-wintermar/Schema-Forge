import React, { useState } from 'react';
import {
  Check,
  Database,
  Download,
  FileCode2,
  FileSpreadsheet,
  FolderPlus,
  Image as ImageIcon,
  Keyboard,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DetailLevel,
  ParsedSchema,
  StickyNote,
  TableGroupDef,
  TablePosition,
  WorkspaceProject,
} from '../types/schema';
import {
  buildDiagramSvg,
  downloadTextFile,
  exportDiagramAsPng,
  exportSchemaToCsv,
  exportSchemaToSql,
  importCsvToDbml,
  importSqlToDbml,
} from '../utils/importExport';

// ---------- 1. TableGroup Editor Modal ----------

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

// ---------- 2. Save Version Modal ----------

interface SaveVersionModalProps {
  suggestedTag: string;
  onClose: () => void;
  onSave: (data: {
    tag: string;
    title: string;
    description: string;
    isPublished: boolean;
  }) => void;
}

export const SaveVersionModal: React.FC<SaveVersionModalProps> = ({
  suggestedTag,
  onClose,
  onSave,
}) => {
  const [tag, setTag] = useState(suggestedTag);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tag.trim() || !title.trim()) return;
    onSave({
      tag: tag.trim(),
      title: title.trim(),
      description: description.trim(),
      isPublished,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
            Save Schema Snapshot
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Version Tag
              </label>
              <input
                type="text"
                required
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="v1.2.0"
                className="w-full px-3 py-2 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Snapshot Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Added Returns & Refunds domain"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Changelog Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summarize breaking changes, new tables, or domain reorganizations..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Mark as Published Schema Release</span>
          </label>
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
            Save Snapshot
          </button>
        </div>
      </form>
    </div>
  );
};

// ---------- 3. Import / Export Modal ----------

interface ImportExportModalProps {
  projectName: string;
  dbml: string;
  schema: ParsedSchema;
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  stickyNotes: StickyNote[];
  darkMode: boolean;
  onImportDbml: (nextDbml: string) => void;
  onClose: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  projectName,
  dbml,
  schema,
  positions,
  detailLevel,
  stickyNotes,
  darkMode,
  onImportDbml,
  onClose,
}) => {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [pngScale, setPngScale] = useState<number>(2);
  const [exportingPng, setExportingPng] = useState(false);
  const [importFormat, setImportFormat] = useState<'dbml' | 'sql' | 'csv'>('sql');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const safeFileBase = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'schema';

  const handleExportPng = async () => {
    setExportingPng(true);
    try {
      await exportDiagramAsPng({
        filename: `${safeFileBase}-${pngScale}x.png`,
        schema,
        positions,
        detailLevel,
        stickyNotes,
        darkMode,
        title: projectName,
        scale: pngScale,
      });
      setFeedback(`Exported ${pngScale}x high-resolution PNG`);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to export PNG.'
      );
    } finally {
      setExportingPng(false);
    }
  };

  const handleExportSvg = () => {
    const { svg } = buildDiagramSvg({
      schema,
      positions,
      detailLevel,
      stickyNotes,
      darkMode,
      title: projectName,
    });
    downloadTextFile(`${safeFileBase}.svg`, svg, 'image/svg+xml;charset=utf-8');
    setFeedback('Exported standalone vector SVG');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
      if (file.name.endsWith('.csv')) setImportFormat('csv');
      else if (file.name.endsWith('.sql')) setImportFormat('sql');
      else if (file.name.endsWith('.dbml')) setImportFormat('dbml');
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = () => {
    setImportError(null);
    if (!importText.trim()) {
      setImportError('Paste schema content or upload a file first.');
      return;
    }
    try {
      let nextDbml = importText;
      if (importFormat === 'sql') {
        nextDbml = importSqlToDbml(importText);
      } else if (importFormat === 'csv') {
        nextDbml = importCsvToDbml(importText);
      }
      onImportDbml(nextDbml);
      onClose();
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to parse input.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              Import &amp; Export Studio
            </h2>
            <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setTab('export')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  tab === 'export'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Export
              </button>
              <button
                type="button"
                onClick={() => setTab('import')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  tab === 'import'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Import
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {tab === 'export' ? (
          <div className="p-5 space-y-5">
            {feedback && (
              <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                {feedback}
              </div>
            )}

            {/* Diagram Vector & High-Res PNG */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Diagram Image &amp; Vector Exports
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <ImageIcon className="w-4 h-4 text-blue-600" />
                      <span>High-Resolution PNG</span>
                    </div>
                    <select
                      value={pngScale}
                      onChange={(e) => setPngScale(Number(e.target.value))}
                      className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option value={1}>1x Standard</option>
                      <option value={2}>2x Retina</option>
                      <option value={3}>3x Print Ultra</option>
                    </select>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Includes all TableGroups, header colors, relationships, and sticky notes.
                  </p>
                  <button
                    type="button"
                    disabled={exportingPng}
                    onClick={handleExportPng}
                    className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportingPng ? 'Rendering PNG...' : `Download PNG (${pngScale}x)`}</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <span>Standalone SVG</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Crisp infinite-zoom vector file editable in Figma or Illustrator.
                  </p>
                  <button
                    type="button"
                    onClick={handleExportSvg}
                    className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download SVG</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Schema Formats */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Schema &amp; Data Dictionary Formats
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.postgres.sql`,
                      exportSchemaToSql(schema, 'postgres')
                    );
                    setFeedback('Exported PostgreSQL DDL');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-blue-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    PostgreSQL
                  </div>
                  <div className="text-[11px] text-slate-400">.sql DDL</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.mysql.sql`,
                      exportSchemaToSql(schema, 'mysql')
                    );
                    setFeedback('Exported MySQL DDL');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-amber-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    MySQL
                  </div>
                  <div className="text-[11px] text-slate-400">.sql DDL</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.csv`,
                      exportSchemaToCsv(schema),
                      'text/csv;charset=utf-8'
                    );
                    setFeedback('Exported CSV Schema Dictionary');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left space-y-1"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    CSV Dictionary
                  </div>
                  <div className="text-[11px] text-slate-400">.csv tabular</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    downloadTextFile(`${safeFileBase}.dbml`, dbml);
                    setFeedback('Exported DBML Source');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left space-y-1"
                >
                  <Database className="w-4 h-4 text-violet-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    DBML Source
                  </div>
                  <div className="text-[11px] text-slate-400">.dbml file</div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {(['sql', 'csv', 'dbml'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      setImportFormat(fmt);
                      setImportError(null);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md uppercase transition-colors ${
                      importFormat === fmt
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Load File</span>
                <input
                  type="file"
                  accept=".sql,.csv,.dbml,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {importFormat === 'sql' &&
                'Supports CREATE TABLE, CREATE TYPE AS ENUM, PRIMARY KEY, UNIQUE, NOT NULL, DEFAULT, and FOREIGN KEY / ALTER TABLE references.'}
              {importFormat === 'csv' &&
                'Expected CSV headers: table_name, table_group, column_name, data_type, primary_key, unique, not_null, default_value, reference, column_note'}
              {importFormat === 'dbml' &&
                'Paste standard DBML code including Table, TableGroup, Ref, Enum, and Note blocks.'}
            </div>

            <textarea
              rows={10}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                importFormat === 'sql'
                  ? 'CREATE TABLE accounts (\n  id uuid PRIMARY KEY,\n  email varchar(255) UNIQUE NOT NULL\n);'
                  : importFormat === 'csv'
                  ? 'table_name,table_group,column_name,data_type,primary_key,reference\nusers,Identity,id,uuid,true,\norders,Commerce,user_id,uuid,false,> users.id'
                  : 'Table users {\n  id uuid [pk]\n}'
              }
              className="w-full p-3 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {importError && (
              <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {importError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
              >
                Convert &amp; Load Schema
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- 4. Workspaces Modal ----------

interface WorkspacesModalProps {
  workspaces: WorkspaceProject[];
  activeId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateBlank: (name: string) => void;
  onLoadSampleTelemetry: () => void;
  onDeleteWorkspace: (id: string) => void;
  onClose: () => void;
}

export const WorkspacesModal: React.FC<WorkspacesModalProps> = ({
  workspaces,
  activeId,
  onSelectWorkspace,
  onCreateBlank,
  onLoadSampleTelemetry,
  onDeleteWorkspace,
  onClose,
}) => {
  const [newName, setNewName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateBlank(newName.trim());
    setNewName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              Local Schema Workspaces
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Persisted automatically in browser IndexedDB
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New project name..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
          </form>

          <button
            type="button"
            onClick={onLoadSampleTelemetry}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
          >
            <span className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-blue-600" />
              <span>Create from Template: Multi-Tenant SaaS Telemetry</span>
            </span>
            <span className="text-blue-600 dark:text-blue-400">Load</span>
          </button>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {workspaces.map((ws) => {
              const isActive = ws.id === activeId;
              return (
                <div
                  key={ws.id}
                  className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWorkspace(ws.id);
                      onClose();
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {ws.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {ws.versions.length} versions · Updated{' '}
                      {new Date(ws.updatedAt).toLocaleDateString()}
                    </div>
                  </button>

                  {workspaces.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteWorkspace(ws.id)}
                      title="Delete workspace"
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- 5. Keyboard Shortcuts Modal ----------

interface ShortcutsModalProps {
  modKey: string;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  modKey,
  onClose,
}) => {
  const shortcuts = [
    {
      label: 'Toggle left sidebar',
      keys: [`${modKey}`, 'B'],
    },
    {
      label: 'Toggle Docs table navigation tree',
      keys: [`${modKey}`, 'J'],
    },
    {
      label: 'Toggle code editor (minimize / restore)',
      keys: [`${modKey}`, '\\'],
    },
    {
      label: 'Find text in code editor',
      keys: [`${modKey}`, 'F'],
    },
    {
      label: 'Find & replace in code editor',
      keys: [`${modKey}`, 'H'],
    },
    {
      label: 'Go to line in code editor',
      keys: [`${modKey}`, 'G'],
    },
    {
      label: 'Toggle maximize / restore code editor',
      keys: [`${modKey}`, '⇧', 'E'],
    },
    {
      label: 'Open Import / Export studio',
      keys: [`${modKey}`, 'I'],
    },
    {
      label: 'Save version snapshot',
      keys: [`${modKey}`, 'S'],
    },
    {
      label: 'Global search (tables, columns, domains)',
      keys: [`${modKey}`, 'K'],
    },
    {
      label: 'Close active modal',
      keys: ['Esc'],
    },
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
