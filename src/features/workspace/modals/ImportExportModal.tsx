import React, { useMemo, useState } from 'react';
import {
  Check,
  Database,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  Printer,
  Upload,
  X,
} from 'lucide-react';
import {
  type DetailLevel,
  formatDomainLabel,
  type ParsedSchema,
  type StickyNote,
  type TablePosition,
  UNGROUPED_DOMAIN_ID,
} from '@shared/domain/schemaTypes';
import { useFetchRemoteDbml } from '../../../hooks/useFetchRemoteDbml';
import type { RemoteFetchResult } from '../../../services/api/remoteService';
import { readDiagramPreferences } from '../../diagram/hooks/useDiagramPreferences';
import type {
  EdgeRoutingMode,
  EdgeVisibilityMode,
} from '../../../utils/io/edgeGeometry';
import {
  buildDiagramSvg,
  downloadTextFile,
  exportDiagramAsPng,
  exportSchemaToCsv,
  exportSchemaToDbml,
  exportSchemaToDrizzle,
  exportSchemaToHtml,
  exportSchemaToMarkdown,
  exportSchemaToMermaid,
  exportSchemaToOpenApi,
  exportSchemaToPrisma,
  exportSchemaToSql,
  exportSchemaToSqlAlchemy,
  filterSchemaByDomains,
  importCsvToDbml,
  importDrizzleToDbml,
  importOpenApiToDbml,
  importPrismaToDbml,
  importSqlToDbml,
  printSchemaDocs,
} from '../../../utils/importExport';
import type { DiagramSlice } from '../../../utils/io/docsExport';

interface ImportExportModalProps {
  projectName: string;
  dbml: string;
  schema: ParsedSchema;
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  stickyNotes: StickyNote[];
  selectedDomains?: string[];
  collapsedGroups?: string[];
  darkMode: boolean;
  onImportDbml: (nextDbml: string) => void;
  onImportUrlResult?: (result: RemoteFetchResult) => void;
  onClose: () => void;
}

function slugifyPart(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'schema'
  );
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  projectName,
  dbml,
  schema,
  positions,
  detailLevel,
  stickyNotes: _stickyNotes,
  selectedDomains = [],
  collapsedGroups = [],
  darkMode,
  onImportDbml,
  onImportUrlResult,
  onClose,
}) => {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [exportScope, setExportScope] = useState<'all' | 'selected'>(() =>
    selectedDomains.length > 0 ? 'selected' : 'all'
  );
  const [exportSelectedDomains, setExportSelectedDomains] = useState<string[]>(
    () => [...selectedDomains]
  );
  const [pngScale, setPngScale] = useState<number>(2);
  const [exportingPng, setExportingPng] = useState(false);
  const [exportRouting, setExportRouting] = useState<EdgeRoutingMode>(
    () => readDiagramPreferences().routingMode
  );
  const [exportCrossDomainMode, setExportCrossDomainMode] =
    useState<EdgeVisibilityMode>(() => readDiagramPreferences().crossDomainMode);
  const [exportShowCardinality, setExportShowCardinality] = useState<boolean>(
    () => readDiagramPreferences().showCardinality
  );
  const [respectCollapsedGroups, setRespectCollapsedGroups] = useState<boolean>(
    () => collapsedGroups.length > 0
  );
  const [embedSvgInDocs, setEmbedSvgInDocs] = useState<boolean>(true);
  const [importFormat, setImportFormat] = useState<
    'sql' | 'prisma' | 'drizzle' | 'openapi' | 'csv' | 'dbml' | 'url'
  >('sql');
  const [importText, setImportText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const {
    loading: importingUrl,
    error: urlImportError,
    clearError: clearUrlImportError,
    fetchUrl,
  } = useFetchRemoteDbml();
  const activeImportError = importError || urlImportError;

  const ungroupedCount = useMemo(() => {
    const grouped = new Set<string>();
    for (const g of schema.tableGroups) {
      for (const tId of g.tables) grouped.add(tId);
    }
    return schema.tables.filter((t) => !grouped.has(t.id)).length;
  }, [schema.tableGroups, schema.tables]);

  const hasScopeOptions = schema.tableGroups.length > 0 || ungroupedCount > 0;
  const isScopedExport = exportScope === 'selected';
  const activeExportDomains = isScopedExport ? exportSelectedDomains : [];
  const hasValidSelection = !isScopedExport || exportSelectedDomains.length > 0;

  const scopedSchema = useMemo(
    () =>
      isScopedExport && exportSelectedDomains.length > 0
        ? filterSchemaByDomains(schema, exportSelectedDomains)
        : schema,
    [isScopedExport, exportSelectedDomains, schema]
  );

  const activeCollapsedGroups = respectCollapsedGroups ? collapsedGroups : [];

  const baseSlug = slugifyPart(projectName);
  const scopeSlugSuffix = useMemo(() => {
    if (!isScopedExport || exportSelectedDomains.length === 0) return '';
    if (exportSelectedDomains.length === 1) {
      return `-${slugifyPart(formatDomainLabel(exportSelectedDomains[0]))}`;
    }
    return '-filtered';
  }, [isScopedExport, exportSelectedDomains]);

  const safeFileBase = `${baseSlug}${scopeSlugSuffix}`;

  const exportDiagramTitle = useMemo(() => {
    if (!isScopedExport || exportSelectedDomains.length === 0) {
      return projectName;
    }
    const labels = exportSelectedDomains.map(formatDomainLabel);
    const labelSummary =
      labels.length <= 2
        ? labels.join(', ')
        : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
    return `${projectName} (${labelSummary})`;
  }, [projectName, isScopedExport, exportSelectedDomains]);

  const toggleExportDomain = (domainId: string) => {
    setExportSelectedDomains((prev) =>
      prev.includes(domainId)
        ? prev.filter((d) => d !== domainId)
        : [...prev, domainId]
    );
  };

  const handleSelectScope = (nextScope: 'all' | 'selected') => {
    setExportScope(nextScope);
    if (nextScope === 'selected' && exportSelectedDomains.length === 0) {
      if (selectedDomains.length > 0) {
        setExportSelectedDomains([...selectedDomains]);
      } else if (schema.tableGroups[0]) {
        setExportSelectedDomains([schema.tableGroups[0].name]);
      } else if (ungroupedCount > 0) {
        setExportSelectedDomains([UNGROUPED_DOMAIN_ID]);
      }
    }
  };

  const handleSelectAllDomains = () => {
    const all = schema.tableGroups.map((g) => g.name);
    if (ungroupedCount > 0) all.push(UNGROUPED_DOMAIN_ID);
    setExportSelectedDomains(all);
  };

  const canvasDiffersFromModal =
    selectedDomains.length > 0 &&
    (selectedDomains.length !== exportSelectedDomains.length ||
      selectedDomains.some((d) => !exportSelectedDomains.includes(d)));

  const handleExportPng = async () => {
    if (!hasValidSelection) return;
    setExportingPng(true);
    try {
      await exportDiagramAsPng({
        filename: `${safeFileBase}-${pngScale}x.png`,
        schema,
        positions,
        detailLevel,
        stickyNotes: [],
        darkMode,
        title: exportDiagramTitle,
        scale: pngScale,
        selectedDomains: activeExportDomains,
        edgeRouting: exportRouting,
        crossDomainMode: exportCrossDomainMode,
        showCardinality: exportShowCardinality,
        collapsedGroups: activeCollapsedGroups,
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
    if (!hasValidSelection) return;
    const { svg } = buildDiagramSvg({
      schema,
      positions,
      detailLevel,
      stickyNotes: [],
      darkMode,
      title: exportDiagramTitle,
      selectedDomains: activeExportDomains,
      edgeRouting: exportRouting,
      crossDomainMode: exportCrossDomainMode,
      showCardinality: exportShowCardinality,
      collapsedGroups: activeCollapsedGroups,
    });
    downloadTextFile(`${safeFileBase}.svg`, svg, 'image/svg+xml;charset=utf-8');
    setFeedback('Exported standalone vector SVG');
  };

  const handleExportDocsMarkdown = () => {
    if (!hasValidSelection) return;
    const md = exportSchemaToMarkdown(scopedSchema, {
      title: exportDiagramTitle,
    });
    downloadTextFile(`${safeFileBase}.docs.md`, md, 'text/markdown;charset=utf-8');
    setFeedback('Exported Markdown documentation');
  };

  const handleExportDocsHtml = () => {
    if (!hasValidSelection) return;
    const svgDiagram = embedSvgInDocs
      ? buildDiagramSvg({
          schema,
          positions,
          detailLevel,
          stickyNotes: [],
          darkMode,
          title: exportDiagramTitle,
          selectedDomains: activeExportDomains,
          edgeRouting: exportRouting,
          crossDomainMode: exportCrossDomainMode,
          showCardinality: exportShowCardinality,
          collapsedGroups: activeCollapsedGroups,
        }).svg
      : undefined;

    const groupsForSlices = isScopedExport
      ? schema.tableGroups.filter((g) => activeExportDomains.includes(g.name))
      : schema.tableGroups;
    const domainDiagrams: DiagramSlice[] = [];
    if (
      embedSvgInDocs &&
      svgDiagram &&
      (groupsForSlices.length > 1 || (!isScopedExport && groupsForSlices.length > 0))
    ) {
      domainDiagrams.push({
        id: 'all',
        label: isScopedExport ? 'Filtered View' : 'All Domains',
        svg: svgDiagram,
      });
      for (const g of groupsForSlices) {
        const sliceSvg = buildDiagramSvg({
          schema,
          positions,
          detailLevel,
          stickyNotes: [],
          darkMode,
          title: `${exportDiagramTitle} — ${g.name}`,
          selectedDomains: [g.name],
          edgeRouting: exportRouting,
          crossDomainMode: 'hide',
          showCardinality: exportShowCardinality,
          collapsedGroups: [],
        }).svg;
        domainDiagrams.push({
          id: `domain-${slugifyPart(g.name)}`,
          label: `${g.name} (${g.tables.length})`,
          svg: sliceSvg,
        });
      }
    }

    const html = exportSchemaToHtml(scopedSchema, {
      title: exportDiagramTitle,
      svgDiagram,
      domainDiagrams,
      darkMode,
    });
    downloadTextFile(`${safeFileBase}.docs.html`, html, 'text/html;charset=utf-8');
    setFeedback('Exported interactive HTML documentation atlas');
  };

  const handlePrintDocsPdf = () => {
    if (!hasValidSelection) return;
    const svgDiagram = embedSvgInDocs
      ? buildDiagramSvg({
          schema,
          positions,
          detailLevel,
          stickyNotes: [],
          darkMode: false,
          title: exportDiagramTitle,
          selectedDomains: activeExportDomains,
          edgeRouting: exportRouting,
          crossDomainMode: exportCrossDomainMode,
          showCardinality: exportShowCardinality,
          collapsedGroups: activeCollapsedGroups,
        }).svg
      : undefined;
    printSchemaDocs(scopedSchema, {
      title: exportDiagramTitle,
      svgDiagram,
    });
    setFeedback('Opened print dialog for PDF export');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.csv')) setImportFormat('csv');
      else if (lower.endsWith('.sql')) setImportFormat('sql');
      else if (lower.endsWith('.prisma')) setImportFormat('prisma');
      else if (lower.endsWith('.ts') || lower.endsWith('.js')) setImportFormat('drizzle');
      else if (lower.endsWith('.json')) setImportFormat('openapi');
      else if (lower.endsWith('.dbml')) setImportFormat('dbml');
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    setImportError(null);
    clearUrlImportError();
    if (importFormat === 'url') {
      const res = await fetchUrl(importUrl);
      if (!res) return;
      if (onImportUrlResult) {
        onImportUrlResult(res);
      } else {
        onImportDbml(res.content);
      }
      onClose();
      return;
    }

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
      } else if (importFormat === 'prisma') {
        nextDbml = importPrismaToDbml(importText);
      } else if (importFormat === 'drizzle') {
        nextDbml = importDrizzleToDbml(importText);
      } else if (importFormat === 'openapi') {
        nextDbml = importOpenApiToDbml(importText);
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
      <div className="w-full max-w-2xl max-h-[88vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
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
          <div className="p-5 space-y-5 overflow-y-auto">
            {feedback && (
              <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                {feedback}
              </div>
            )}

            {hasScopeOptions && (
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Export Scope</span>
                  </div>
                  <div className="flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => handleSelectScope('all')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        exportScope === 'all'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      All Domains &amp; Tables
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectScope('selected')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        exportScope === 'selected'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Selected Domains
                      {exportScope === 'selected' &&
                      exportSelectedDomains.length > 0
                        ? ` (${exportSelectedDomains.length})`
                        : ''}
                    </button>
                  </div>
                </div>

                {exportScope === 'selected' && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto">
                      {schema.tableGroups.map((g) => {
                        const checked = exportSelectedDomains.includes(g.name);
                        return (
                          <button
                            key={g.name}
                            type="button"
                            onClick={() => toggleExportDomain(g.name)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                              checked
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100 font-medium'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
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
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: g.color || '#2563EB' }}
                            />
                            <span className="truncate max-w-[160px]">
                              {g.name}
                            </span>
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {g.tables.length}
                            </span>
                          </button>
                        );
                      })}

                      {ungroupedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExportDomain(UNGROUPED_DOMAIN_ID)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                            exportSelectedDomains.includes(UNGROUPED_DOMAIN_ID)
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100 font-medium'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                              exportSelectedDomains.includes(UNGROUPED_DOMAIN_ID)
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {exportSelectedDomains.includes(
                              UNGROUPED_DOMAIN_ID
                            ) && <Check className="w-2.5 h-2.5" />}
                          </span>
                          <span className="w-2 h-2 rounded-xs border border-dashed border-slate-400 dark:border-slate-500 bg-slate-200/80 dark:bg-slate-700 shrink-0" />
                          <span>Ungrouped</span>
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {ungroupedCount}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      {hasValidSelection ? (
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          Exporting {scopedSchema.tables.length} table
                          {scopedSchema.tables.length === 1 ? '' : 's'} ·{' '}
                          {scopedSchema.refs.length} relationship
                          {scopedSchema.refs.length === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Select at least one domain or Ungrouped to export.
                        </span>
                      )}

                      <div className="flex items-center gap-2.5 font-medium">
                        {canvasDiffersFromModal && (
                          <button
                            type="button"
                            onClick={() =>
                              setExportSelectedDomains([...selectedDomains])
                            }
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Match Canvas Filter
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleSelectAllDomains}
                          className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:underline"
                        >
                          Select All
                        </button>
                        {exportSelectedDomains.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExportSelectedDomains([])}
                            className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Diagram Image &amp; Vector Exports
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 text-[11px] text-slate-600 dark:text-slate-300">
                <label className="inline-flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Routing:</span>
                  <select
                    value={exportRouting}
                    onChange={(e) =>
                      setExportRouting(e.target.value as EdgeRoutingMode)
                    }
                    className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                  >
                    <option value="bezier">Curved Bezier</option>
                    <option value="orthogonal">Orthogonal</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-slate-400">
                    Cross-domain:
                  </span>
                  <select
                    value={exportCrossDomainMode}
                    onChange={(e) =>
                      setExportCrossDomainMode(e.target.value as EdgeVisibilityMode)
                    }
                    className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                  >
                    <option value="show">Show All</option>
                    <option value="bundle">Bundle</option>
                    <option value="hide">Hide</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={exportShowCardinality}
                    onChange={(e) => setExportShowCardinality(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Cardinality labels</span>
                </label>

                {collapsedGroups.length > 0 && (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={respectCollapsedGroups}
                      onChange={(e) => setRespectCollapsedGroups(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Collapsed groups ({collapsedGroups.length})</span>
                  </label>
                )}
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
                    {isScopedExport
                      ? 'Includes only the selected domains, ungrouped tables, and relationships.'
                      : 'Includes all TableGroups, header colors, and relationships.'}
                  </p>
                  <button
                    type="button"
                    disabled={exportingPng || !hasValidSelection}
                    onClick={handleExportPng}
                    className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
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
                    disabled={!hasValidSelection}
                    onClick={handleExportSvg}
                    className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download SVG</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Documentation Exports
                </div>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={embedSvgInDocs}
                    onChange={(e) => setEmbedSvgInDocs(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Embed ER diagram SVG in HTML / Print</span>
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={handleExportDocsMarkdown}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Markdown (.md)
                  </div>
                  <div className="text-[11px] text-slate-400">GitHub / Wiki docs</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={handleExportDocsHtml}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-emerald-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    HTML Atlas (.html)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Domain slices + nav
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    const mmd = exportSchemaToMermaid(scopedSchema, {
                      title: exportDiagramTitle,
                    });
                    downloadTextFile(
                      `${safeFileBase}.erd.mmd`,
                      mmd,
                      'text/plain;charset=utf-8'
                    );
                    setFeedback('Exported Mermaid ERD (.mmd)');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-cyan-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Mermaid ERD
                  </div>
                  <div className="text-[11px] text-slate-400">Notion / Confluence</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={handlePrintDocsPdf}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <Printer className="w-4 h-4 text-violet-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Print / Save as PDF
                  </div>
                  <div className="text-[11px] text-slate-400">Clean print layout</div>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Schema, DDL &amp; ORM Formats
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.postgres.sql`,
                      exportSchemaToSql(scopedSchema, 'postgres')
                    );
                    setFeedback('Exported PostgreSQL DDL');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-blue-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    PostgreSQL
                  </div>
                  <div className="text-[11px] text-slate-400">.sql DDL</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.mysql.sql`,
                      exportSchemaToSql(scopedSchema, 'mysql')
                    );
                    setFeedback('Exported MySQL DDL');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-amber-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    MySQL
                  </div>
                  <div className="text-[11px] text-slate-400">.sql DDL</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.csv`,
                      exportSchemaToCsv(scopedSchema),
                      'text/csv;charset=utf-8'
                    );
                    setFeedback('Exported CSV Schema Dictionary');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    CSV Dictionary
                  </div>
                  <div className="text-[11px] text-slate-400">.csv tabular</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    const dbmlContent = isScopedExport
                      ? exportSchemaToDbml(scopedSchema)
                      : dbml;
                    downloadTextFile(`${safeFileBase}.dbml`, dbmlContent);
                    setFeedback('Exported DBML Source');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <Database className="w-4 h-4 text-violet-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    DBML Source
                  </div>
                  <div className="text-[11px] text-slate-400">.dbml file</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.prisma`,
                      exportSchemaToPrisma(scopedSchema)
                    );
                    setFeedback('Exported Prisma schema (.prisma)');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-indigo-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Prisma Schema
                  </div>
                  <div className="text-[11px] text-slate-400">schema.prisma</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.drizzle.ts`,
                      exportSchemaToDrizzle(scopedSchema)
                    );
                    setFeedback('Exported Drizzle ORM schema (.ts)');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-lime-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Drizzle ORM
                  </div>
                  <div className="text-[11px] text-slate-400">pgTable (.ts)</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.models.py`,
                      exportSchemaToSqlAlchemy(scopedSchema)
                    );
                    setFeedback('Exported SQLAlchemy models (.py)');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-rose-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    SQLAlchemy
                  </div>
                  <div className="text-[11px] text-slate-400">Python ORM</div>
                </button>

                <button
                  type="button"
                  disabled={!hasValidSelection}
                  onClick={() => {
                    downloadTextFile(
                      `${safeFileBase}.openapi.json`,
                      exportSchemaToOpenApi(scopedSchema),
                      'application/json;charset=utf-8'
                    );
                    setFeedback('Exported OpenAPI 3.1 JSON schemas');
                  }}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-left space-y-1"
                >
                  <FileCode2 className="w-4 h-4 text-sky-600" />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    OpenAPI 3.1
                  </div>
                  <div className="text-[11px] text-slate-400">.openapi.json</div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    'sql',
                    'prisma',
                    'drizzle',
                    'openapi',
                    'csv',
                    'dbml',
                    'url',
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      setImportFormat(fmt);
                      setImportError(null);
                      clearUrlImportError();
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md uppercase transition-colors ${
                      importFormat === fmt
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>

              {importFormat !== 'url' && (
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Load File</span>
                  <input
                    type="file"
                    accept=".sql,.csv,.dbml,.prisma,.ts,.js,.json,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {importFormat === 'sql' &&
                'Supports CREATE TABLE, CREATE TYPE AS ENUM, PRIMARY KEY, UNIQUE, NOT NULL, DEFAULT, and FOREIGN KEY / ALTER TABLE references.'}
              {importFormat === 'prisma' &&
                'Supports Prisma schema.prisma models, enums, @id, @unique, @default, @relation, and /// doc comments.'}
              {importFormat === 'drizzle' &&
                'Supports Drizzle ORM pgTable / mysqlTable / sqliteTable TypeScript schema definitions, .primaryKey(), .notNull(), and .references().'}
              {importFormat === 'openapi' &&
                'Supports OpenAPI 3.x / JSON Schema components.schemas definitions with x-ref / $ref object links.'}
              {importFormat === 'csv' &&
                'Expected CSV headers: table_name, table_group, column_name, data_type, primary_key, unique, not_null, default_value, reference, column_note'}
              {importFormat === 'dbml' &&
                'Paste standard DBML code including Table, TableGroup, Ref, Enum, and Note blocks.'}
              {importFormat === 'url' &&
                'Enter any raw .dbml file URL, GitHub blob URL, or GitHub Gist URL to load into the current workspace.'}
            </div>

            {importFormat === 'url' ? (
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/blob/main/schema.dbml"
                className="w-full px-3 py-2.5 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <textarea
                rows={10}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={
                  importFormat === 'sql'
                    ? 'CREATE TABLE accounts (\n  id uuid PRIMARY KEY,\n  email varchar(255) UNIQUE NOT NULL\n);'
                    : importFormat === 'prisma'
                    ? 'model User {\n  id Int @id @default(autoincrement())\n  email String @unique\n}'
                    : importFormat === 'drizzle'
                    ? "export const users = pgTable('users', {\n  id: serial('id').primaryKey(),\n  email: varchar('email').notNull(),\n});"
                    : importFormat === 'openapi'
                    ? '{\n  "components": {\n    "schemas": {\n      "User": { "type": "object", "required": ["id"], "properties": { "id": { "type": "string", "format": "uuid" } } }\n    }\n  }\n}'
                    : importFormat === 'csv'
                    ? 'table_name,table_group,column_name,data_type,primary_key,reference\nusers,Identity,id,uuid,true,\norders,Commerce,user_id,uuid,false,> users.id'
                    : 'Table users {\n  id uuid [pk]\n}'
                }
                className="w-full p-3 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {activeImportError && (
              <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {activeImportError}
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
                disabled={importingUrl}
                onClick={handleImportSubmit}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white"
              >
                {importingUrl
                  ? 'Fetching URL...'
                  : importFormat === 'url'
                  ? 'Fetch & Load Schema'
                  : 'Convert & Load Schema'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
