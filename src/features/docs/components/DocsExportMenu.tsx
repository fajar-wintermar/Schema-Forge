import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileCode,
  FileText,
  GitBranch,
  Printer,
} from 'lucide-react';
import {
  ParsedSchema,
  StickyNote,
  TablePosition,
} from '@shared/domain/schemaTypes';
import { computeAutoLayout } from '../../../utils/autoLayout';
import {
  buildDiagramSvg,
  downloadTextFile,
  exportSchemaToHtml,
  exportSchemaToMarkdown,
  exportSchemaToMermaid,
  filterSchemaByDomains,
  printSchemaDocs,
} from '../../../utils/importExport';
import type { DiagramSlice } from '../../../utils/io/docsExport';
import { readDiagramPreferences } from '../../diagram/hooks/useDiagramPreferences';

interface DocsExportMenuProps {
  schema: ParsedSchema;
  stickyNotes: StickyNote[];
  projectName?: string;
  selectedDomains?: string[];
  positions?: Record<string, TablePosition>;
  collapsedGroups?: string[];
  darkMode?: boolean;
}

function slugifyName(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'schema-docs'
  );
}

export const DocsExportMenu: React.FC<DocsExportMenuProps> = ({
  schema,
  stickyNotes: _stickyNotes,
  projectName,
  selectedDomains = [],
  positions,
  collapsedGroups = [],
  darkMode = false,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        menuRef.current &&
        e.target instanceof Node &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const title =
    projectName?.trim() || schema.project.name || 'Database Schema Documentation';
  const fileBase = slugifyName(title);

  const getScopedDocsInputs = (lightSvgForPrint = false) => {
    const isFiltered = selectedDomains.length > 0;
    const scopedSchema = isFiltered
      ? filterSchemaByDomains(schema, selectedDomains)
      : schema;

    const prefs = readDiagramPreferences();
    const effectivePositions =
      positions && Object.keys(positions).length > 0
        ? positions
        : computeAutoLayout(schema, 'full');
    const svgDark = lightSvgForPrint ? false : darkMode;

    const { svg } = buildDiagramSvg({
      schema,
      positions: effectivePositions,
      detailLevel: 'full',
      stickyNotes: [],
      darkMode: svgDark,
      title,
      edgeRouting: prefs.routingMode,
      selectedDomains,
      showCardinality: prefs.showCardinality,
      crossDomainMode: prefs.crossDomainMode,
      collapsedGroups,
    });

    const groupsForSlices = isFiltered
      ? schema.tableGroups.filter((g) => selectedDomains.includes(g.name))
      : schema.tableGroups;

    const domainDiagrams: DiagramSlice[] = [];
    if (groupsForSlices.length > 1 || (!isFiltered && groupsForSlices.length > 0)) {
      domainDiagrams.push({
        id: 'all',
        label: isFiltered ? 'Filtered View' : 'All Domains',
        svg,
      });
      for (const g of groupsForSlices) {
        const sliceSvg = buildDiagramSvg({
          schema,
          positions: effectivePositions,
          detailLevel: 'full',
          stickyNotes: [],
          darkMode: svgDark,
          title: `${title} — ${g.name}`,
          edgeRouting: prefs.routingMode,
          selectedDomains: [g.name],
          showCardinality: prefs.showCardinality,
          crossDomainMode: 'hide',
          collapsedGroups: [],
        }).svg;
        domainDiagrams.push({
          id: `domain-${slugifyName(g.name)}`,
          label: `${g.name} (${g.tables.length})`,
          svg: sliceSvg,
        });
      }
    }

    return { scopedSchema, svg, domainDiagrams };
  };

  const handleExportMarkdown = () => {
    const { scopedSchema } = getScopedDocsInputs();
    const md = exportSchemaToMarkdown(scopedSchema, {
      title,
    });
    downloadTextFile(`${fileBase}.docs.md`, md, 'text/markdown;charset=utf-8');
    setOpen(false);
  };

  const handleExportHtml = () => {
    const { scopedSchema, svg, domainDiagrams } = getScopedDocsInputs(false);
    const html = exportSchemaToHtml(scopedSchema, {
      title,
      svgDiagram: svg,
      domainDiagrams,
      darkMode,
    });
    downloadTextFile(`${fileBase}.docs.html`, html, 'text/html;charset=utf-8');
    setOpen(false);
  };

  const handleExportMermaid = () => {
    const { scopedSchema } = getScopedDocsInputs();
    const mmd = exportSchemaToMermaid(scopedSchema, { title });
    downloadTextFile(`${fileBase}.erd.mmd`, mmd, 'text/plain;charset=utf-8');
    setOpen(false);
  };

  const handlePrintPdf = () => {
    const { scopedSchema, svg } = getScopedDocsInputs(true);
    setOpen(false);
    printSchemaDocs(scopedSchema, {
      title,
      svgDiagram: svg,
    });
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span>Export Docs</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-40">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {selectedDomains.length > 0
              ? `Docs Export (${selectedDomains.length} filtered)`
              : 'Documentation Export'}
          </div>
          <button
            type="button"
            onClick={handleExportMarkdown}
            className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Markdown (.md)</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">Git / Wiki</span>
          </button>
          <button
            type="button"
            onClick={handleExportHtml}
            className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Interactive HTML (.html)</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">Atlas + SVG</span>
          </button>
          <button
            type="button"
            onClick={handleExportMermaid}
            className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span>Mermaid ERD (.mmd)</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">Notion / Docs</span>
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            type="button"
            onClick={handlePrintPdf}
            className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <Printer className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
              <span>Print / Save as PDF</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">PDF</span>
          </button>
        </div>
      )}
    </div>
  );
};
