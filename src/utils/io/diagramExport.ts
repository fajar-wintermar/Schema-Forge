import {
  DetailLevel,
  ParsedSchema,
  StickyNote,
  TableDef,
  TablePosition,
  UNGROUPED_DOMAIN_ID,
} from '@shared/domain/schemaTypes';
import {
  buildTableInstances,
  computeGroupBoundingBoxes,
  getTableHeight,
  resolveSchemaEdges,
  TABLE_WIDTH,
} from '../autoLayout';
import {
  buildEdgePath,
  computeEdgeRoutingAndBundles,
  EdgeRoutingMode,
  EdgeVisibilityMode,
  getBoxToBoxAnchors,
  getEdgeAnchorPoints,
} from './edgeGeometry';

export interface DiagramExportParams {
  schema: ParsedSchema;
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  stickyNotes?: StickyNote[];
  darkMode: boolean;
  title?: string;
  edgeRouting?: EdgeRoutingMode;
  selectedDomains?: string[];
  showCardinality?: boolean;
  crossDomainMode?: EdgeVisibilityMode;
  collapsedGroups?: string[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSvgColor(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-zA-Z]{3,20}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

export function getContrastTextColor(hex?: string): string {
  if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return '#ffffff';
  let c = hex.slice(1);
  if (c.length === 3) {
    c = c
      .split('')
      .map((x) => x + x)
      .join('');
  }
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#0f172a' : '#ffffff';
}

export function buildDiagramSvg(
  params: DiagramExportParams
): { svg: string; width: number; height: number } {
  const {
    schema,
    positions,
    detailLevel,
    darkMode,
    title,
    edgeRouting = 'bezier',
    selectedDomains = [],
    showCardinality = true,
    crossDomainMode = 'show',
    collapsedGroups = [],
  } = params;

  const collapsedGroupSet = new Set(collapsedGroups);

  const fkColsByTable = new Map<string, Set<string>>();
  for (const r of schema.refs) {
    if (!fkColsByTable.has(r.fromTable)) fkColsByTable.set(r.fromTable, new Set());
    for (const c of r.fromColumns) fkColsByTable.get(r.fromTable)!.add(c);
    if (!fkColsByTable.has(r.toTable)) fkColsByTable.set(r.toTable, new Set());
    for (const c of r.toColumns) fkColsByTable.get(r.toTable)!.add(c);
  }

  const allGroupBoxes = computeGroupBoundingBoxes(
    schema,
    positions,
    detailLevel,
    fkColsByTable,
    collapsedGroupSet
  );

  const { instances: allInstances } = buildTableInstances(schema);
  const allResolvedEdges = resolveSchemaEdges(schema, allInstances, positions);

  const isFilteringDomains = selectedDomains.length > 0;
  const selectedDomainSet = new Set(selectedDomains);
  const isInstInDomain = (inst: (typeof allInstances)[number]) =>
    !isFilteringDomains ||
    (inst.groupName === null
      ? selectedDomainSet.has(UNGROUPED_DOMAIN_ID)
      : selectedDomainSet.has(inst.groupName));

  const groupBoxes = isFilteringDomains
    ? allGroupBoxes.filter((gb) => selectedDomainSet.has(gb.name))
    : allGroupBoxes;

  const domainInstances = isFilteringDomains
    ? allInstances.filter(isInstInDomain)
    : allInstances;

  // Hide individual table cards for collapsed groups (still available via domainInstances for edge resolution)
  const visibleInstances = domainInstances.filter(
    (inst) => !(inst.groupName !== null && collapsedGroupSet.has(inst.groupName))
  );
  const domainTableIds = new Set(domainInstances.map((i) => i.table.id));

  const domainEdges = isFilteringDomains
    ? allResolvedEdges.filter(
        (e) => isInstInDomain(e.fromInst) && isInstInDomain(e.toInst)
      )
    : allResolvedEdges;

  const { renderedEdges, crossDomainBundles, anchorBoxByDomain } =
    computeEdgeRoutingAndBundles({
      edges: domainEdges,
      visibleGroupBoxes: groupBoxes,
      visibleInstances,
      positions,
      detailLevel,
      fkColsByTable,
      crossDomainMode,
      collapsedGroups: collapsedGroupSet,
      tableGroups: schema.tableGroups,
    });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const inst of visibleInstances) {
    const pos = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
    const h = getTableHeight(
      inst.table,
      detailLevel,
      fkColsByTable.get(inst.table.id),
      inst.sharedGroups.length > 1
    );
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
    maxY = Math.max(maxY, pos.y + h);
  }

  for (const gb of groupBoxes) {
    minX = Math.min(minX, gb.x);
    minY = Math.min(minY, gb.y);
    maxX = Math.max(maxX, gb.x + gb.width);
    maxY = Math.max(maxY, gb.y + gb.height);
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1000;
    maxY = 700;
  }

  const margin = 64;
  const headerBanner = title ? 56 : 0;
  const offsetX = -minX + margin;
  const offsetY = -minY + margin + headerBanner;
  const width = Math.ceil(maxX - minX + margin * 2);
  const height = Math.ceil(maxY - minY + margin * 2 + headerBanner);

  const bg = darkMode ? '#0b1120' : '#f8fafc';
  const cardBg = darkMode ? '#151e2e' : '#ffffff';
  const cardBorder = darkMode ? '#334155' : '#cbd5e1';
  const rowDivider = darkMode ? '#1e293b' : '#f1f5f9';
  const textPrimary = darkMode ? '#f1f5f9' : '#0f172a';
  const textSecondary = darkMode ? '#94a3b8' : '#64748b';
  const edgeStroke = darkMode ? '#64748b' : '#94a3b8';

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<defs>
    <style>
      .sans { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
    <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="${darkMode ? '#1e293b' : '#cbd5e1'}" />
    </pattern>
  </defs>`);

  parts.push(`<rect width="${width}" height="${height}" fill="${bg}" />`);
  parts.push(`<rect width="${width}" height="${height}" fill="url(#dotgrid)" />`);

  if (title) {
    parts.push(
      `<text x="${margin}" y="${42}" class="sans" font-size="18" font-weight="700" fill="${textPrimary}">${escapeXml(
        title
      )}</text>`
    );
    const domainCountLabel = isFilteringDomains
      ? groupBoxes.length
      : schema.tableGroups.length;
    const totalVisibleEdges =
      renderedEdges.length +
      crossDomainBundles.reduce((acc, b) => acc + b.edges.length, 0);
    parts.push(
      `<text x="${width - margin}" y="${42}" text-anchor="end" class="sans" font-size="12" fill="${textSecondary}">${domainTableIds.size} tables · ${domainCountLabel} domains · ${totalVisibleEdges} relationships</text>`
    );
  }

  parts.push(`<g transform="translate(${offsetX}, ${offsetY})">`);

  // 1. TableGroup containers (expanded dashed boxes or collapsed summary cards)
  for (const gb of groupBoxes) {
    const gColor = sanitizeSvgColor(gb.color, '#2563eb');
    if (gb.collapsed) {
      parts.push(
        `<rect x="${gb.x}" y="${gb.y}" width="${gb.width}" height="${gb.height}" rx="12" fill="${cardBg}" stroke="${gColor}" stroke-width="2" />`
      );
      parts.push(
        `<rect x="${gb.x}" y="${gb.y}" width="${gb.width}" height="${gb.height}" rx="12" fill="${gColor}" fill-opacity="${
          darkMode ? '0.14' : '0.08'
        }" />`
      );
      parts.push(
        `<rect x="${gb.x + 14}" y="${gb.y + 16}" width="11" height="11" rx="3" fill="${gColor}" />`
      );
      parts.push(
        `<text x="${gb.x + 33}" y="${gb.y + 26}" class="sans" font-size="13" font-weight="700" fill="${textPrimary}">${escapeXml(
          gb.name
        )}</text>`
      );
      parts.push(
        `<text x="${gb.x + gb.width - 14}" y="${gb.y + 26}" text-anchor="end" class="mono" font-size="11" font-weight="600" fill="${textSecondary}">${
          gb.tables.length
        } tables</text>`
      );
      const summary = gb.note
        ? gb.note.replace(/\s+/g, ' ').trim().slice(0, 44)
        : `Collapsed domain (${gb.tables.length} tables)`;
      parts.push(
        `<text x="${gb.x + 14}" y="${gb.y + 54}" class="sans" font-size="11" fill="${textSecondary}">${escapeXml(
          summary
        )}</text>`
      );
      parts.push(
        `<text x="${gb.x + 14}" y="${gb.y + 74}" class="mono" font-size="10" fill="${gColor}">Collapsed TableGroup</text>`
      );
      continue;
    }

    parts.push(
      `<rect x="${gb.x}" y="${gb.y}" width="${gb.width}" height="${gb.height}" rx="12" fill="${gColor}" fill-opacity="${
        darkMode ? '0.09' : '0.06'
      }" stroke="${gColor}" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="6 4" />`
    );
    parts.push(
      `<rect x="${gb.x + 14}" y="${gb.y + 12}" width="10" height="10" rx="3" fill="${gColor}" />`
    );
    parts.push(
      `<text x="${gb.x + 32}" y="${gb.y + 22}" class="sans" font-size="13" font-weight="700" fill="${textPrimary}">${escapeXml(
        gb.name
      )}</text>`
    );
    if (gb.note) {
      parts.push(
        `<text x="${gb.x + 32}" y="${gb.y + 39}" class="sans" font-size="11" fill="${textSecondary}">${escapeXml(
          gb.note.slice(0, 80)
        )}</text>`
      );
    }
  }

  // 2a. Cross-domain & collapsed-group relationship bundles
  crossDomainBundles.forEach((bundle, bIdx) => {
    const boxA = anchorBoxByDomain.get(bundle.domainA);
    const boxB = anchorBoxByDomain.get(bundle.domainB);
    if (!boxA || !boxB) return;

    const anchors = getBoxToBoxAnchors(boxA, boxB);
    const { pathD, midX, midY } = buildEdgePath({
      ...anchors,
      isSelfRef: false,
      routing: edgeRouting,
      laneOffset: ((bIdx % 5) - 2) * 14,
    });

    const strokeColor = sanitizeSvgColor(
      bundle.color,
      darkMode ? '#64748b' : '#475569'
    );
    const pillLabel = `${bundle.edges.length} ref${
      bundle.edges.length > 1 ? 's' : ''
    }`;
    const pillWidth = Math.max(46, pillLabel.length * 6.5 + 16);

    parts.push(
      `<path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-dasharray="6 4" />`
    );
    parts.push(
      `<circle cx="${anchors.x1}" cy="${anchors.y1}" r="4" fill="${strokeColor}" />`
    );
    parts.push(
      `<circle cx="${anchors.x2}" cy="${anchors.y2}" r="4" fill="${strokeColor}" />`
    );
    parts.push(
      `<rect x="${midX - pillWidth / 2}" y="${midY - 11}" width="${pillWidth}" height="22" rx="11" fill="${
        darkMode ? '#0f172a' : '#ffffff'
      }" stroke="${strokeColor}" stroke-width="1.4" />`
    );
    parts.push(
      `<text x="${midX}" y="${midY + 3.5}" text-anchor="middle" class="mono" font-size="10" font-weight="600" fill="${
        darkMode ? '#e2e8f0' : '#334155'
      }">${escapeXml(pillLabel)}</text>`
    );
  });

  // 2b. Direct relationship edges
  const getAnchorY = (table: TableDef, posKey: string, colName: string) => {
    const pos = positions[posKey] || positions[table.id] || { x: 0, y: 0 };
    if (detailLevel === 'names') return pos.y + 20;
    const fkSet = fkColsByTable.get(table.id);
    const cols =
      detailLevel === 'keys'
        ? table.columns.filter(
            (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
          )
        : table.columns;
    const rowH = detailLevel === 'full' ? 30 : 26;
    const idx = cols.findIndex((c) => c.name === colName);
    if (idx === -1) return pos.y + 20;
    return pos.y + 40 + idx * rowH + rowH / 2;
  };

  renderedEdges.forEach((edge, idx) => {
    const { ref: r, fromInst, toInst } = edge;
    const pA = positions[fromInst.posKey] || positions[fromInst.table.id] || { x: 0, y: 0 };
    const pB = positions[toInst.posKey] || positions[toInst.table.id] || { x: 0, y: 0 };
    const y1 = getAnchorY(fromInst.table, fromInst.posKey, r.fromColumns[0]);
    const y2 = getAnchorY(toInst.table, toInst.posKey, r.toColumns[0]);

    const isSelfRef = fromInst.posKey === toInst.posKey;
    const anchors = getEdgeAnchorPoints(pA, pB, y1, y2, isSelfRef);
    const { pathD } = buildEdgePath({
      ...anchors,
      isSelfRef,
      routing: edgeRouting,
      laneOffset: ((idx % 5) - 2) * 8,
    });

    const safeRefColor = r.color ? sanitizeSvgColor(r.color, '') : '';
    const edgeColor = safeRefColor || edgeStroke;
    parts.push(
      `<path d="${pathD}" fill="none" stroke="${edgeColor}" stroke-width="1.6" />`
    );
    parts.push(`<circle cx="${anchors.x1}" cy="${anchors.y1}" r="3.5" fill="${edgeColor}" />`);
    parts.push(`<circle cx="${anchors.x2}" cy="${anchors.y2}" r="3.5" fill="${safeRefColor || '#2563eb'}" />`);

    if (showCardinality) {
      const fromCard = r.relation === '>' || r.relation === '<>' ? 'N' : '1';
      const toCard = r.relation === '<' || r.relation === '<>' ? 'N' : '1';
      const labelFill = darkMode ? '#cbd5e1' : '#475569';
      parts.push(
        `<text x="${anchors.x1 + anchors.dir1 * 14}" y="${
          anchors.y1 - 6
        }" text-anchor="middle" class="mono" font-size="10" font-weight="700" fill="${labelFill}" stroke="${bg}" stroke-width="3" paint-order="stroke">${fromCard}</text>`
      );
      parts.push(
        `<text x="${anchors.x2 + anchors.dir2 * 14}" y="${
          anchors.y2 - 6
        }" text-anchor="middle" class="mono" font-size="10" font-weight="700" fill="${labelFill}" stroke="${bg}" stroke-width="3" paint-order="stroke">${toCard}</text>`
      );
    }
  });

  // 3. Table cards
  for (const inst of visibleInstances) {
    const table = inst.table;
    const pos = positions[inst.posKey] || positions[table.id] || { x: 0, y: 0 };
    const isShared = inst.sharedGroups.length > 1;
    const h = getTableHeight(table, detailLevel, fkColsByTable.get(table.id), isShared);
    const headerBg = sanitizeSvgColor(
      table.headerColor,
      darkMode ? '#1e293b' : '#0f172a'
    );
    const headerText = getContrastTextColor(headerBg);
    const fkSet = fkColsByTable.get(table.id);

    parts.push(
      `<rect x="${pos.x}" y="${pos.y}" width="${TABLE_WIDTH}" height="${h}" rx="8" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.2" />`
    );
    parts.push(
      `<path d="M ${pos.x} ${pos.y + 8} Q ${pos.x} ${pos.y} ${pos.x + 8} ${pos.y} L ${
        pos.x + TABLE_WIDTH - 8
      } ${pos.y} Q ${pos.x + TABLE_WIDTH} ${pos.y} ${pos.x + TABLE_WIDTH} ${
        pos.y + 8
      } L ${pos.x + TABLE_WIDTH} ${pos.y + 40} L ${pos.x} ${pos.y + 40} Z" fill="${headerBg}" />`
    );
    parts.push(
      `<text x="${pos.x + 12}" y="${pos.y + 25}" class="sans" font-size="13" font-weight="600" fill="${headerText}">${escapeXml(
        table.id
      )}</text>`
    );

    if (detailLevel !== 'names') {
      const cols =
        detailLevel === 'keys'
          ? table.columns.filter(
              (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
            )
          : table.columns;
      const rowH = detailLevel === 'full' ? 30 : 26;
      cols.forEach((col, i) => {
        const ry = pos.y + 40 + i * rowH;
        if (i > 0) {
          parts.push(
            `<line x1="${pos.x}" y1="${ry}" x2="${pos.x + TABLE_WIDTH}" y2="${ry}" stroke="${rowDivider}" stroke-width="1" />`
          );
        }
        const isFk = fkSet?.has(col.name);
        const keyTag = col.pk ? 'PK' : isFk ? 'FK' : col.unique ? 'UQ' : '';
        if (keyTag) {
          parts.push(
            `<text x="${pos.x + 12}" y="${ry + rowH / 2 + 4}" class="mono" font-size="10" font-weight="600" fill="${
              col.pk ? '#d97706' : '#2563eb'
            }">${keyTag}</text>`
          );
        }
        const nameX = keyTag ? pos.x + 36 : pos.x + 12;
        parts.push(
          `<text x="${nameX}" y="${ry + rowH / 2 + 4}" class="sans" font-size="12" font-weight="${
            col.pk ? '600' : '400'
          }" fill="${textPrimary}">${escapeXml(col.name)}</text>`
        );
        parts.push(
          `<text x="${pos.x + TABLE_WIDTH - 12}" y="${ry + rowH / 2 + 4}" text-anchor="end" class="mono" font-size="11" fill="${textSecondary}">${escapeXml(
            col.type
          )}</text>`
        );
      });
    }

    if (isShared) {
      parts.push(
        `<text x="${pos.x + 12}" y="${pos.y + h - 8}" class="sans" font-size="10" fill="#2563eb">Shared across ${inst.sharedGroups.length} domains</text>`
      );
    }
  }

  parts.push('</g></svg>');
  return { svg: parts.join('\n'), width, height };
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8'
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportDiagramAsPng(
  params: DiagramExportParams & {
    filename: string;
    scale?: number;
  }
): Promise<void> {
  const scale = params.scale || 2;
  const { svg, width, height } = buildDiagramSvg(params);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not acquire 2D canvas context.'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG serialization failed.'));
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = params.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG image for PNG export.'));
    };
    img.src = url;
  });
}
