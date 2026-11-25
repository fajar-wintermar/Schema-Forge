import { ParseError, SchemaModuleFile } from '@shared/domain/schemaTypes';
import {
  SchemaTreeFileNode,
  SchemaTreeFolderNode,
  SchemaTreeNode,
} from './types';

export function extractDefinedTableNames(content: string): string[] {
  const names: string[] = [];
  const regex = /^\s*Table\s+(?:"([^"]+)"|`([^`]+)`|([a-zA-Z0-9_.]+))/gim;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const name = (m[1] || m[2] || m[3] || '').trim();
    if (name) names.push(name);
  }
  return names;
}

export function buildSchemaFileTree(
  files: SchemaModuleFile[],
  searchQuery: string,
  allErrorsByFile?: Record<string, ParseError[]>
): { nodes: SchemaTreeNode[]; matchCount: number } {
  const q = searchQuery.trim().toLowerCase();

  interface MutableFolder {
    name: string;
    path: string;
    folders: Map<string, MutableFolder>;
    files: SchemaTreeFileNode[];
  }

  const root: MutableFolder = {
    name: '',
    path: '',
    folders: new Map(),
    files: [],
  };

  let matchCount = 0;

  for (const file of files) {
    const tableNames = extractDefinedTableNames(file.content);
    const matchingTables = q
      ? tableNames.filter((t) => t.toLowerCase().includes(q))
      : [];
    const pathMatch = !q || file.path.toLowerCase().includes(q);
    if (!pathMatch && matchingTables.length === 0) {
      continue;
    }

    matchCount++;
    const parts = file.path.split('/').filter(Boolean);
    const fileName = parts.pop() || file.path;
    let cursor = root;
    let accumPath = '';

    for (const seg of parts) {
      accumPath = accumPath ? `${accumPath}/${seg}` : seg;
      let next = cursor.folders.get(seg);
      if (!next) {
        next = {
          name: seg,
          path: accumPath,
          folders: new Map(),
          files: [],
        };
        cursor.folders.set(seg, next);
      }
      cursor = next;
    }

    cursor.files.push({
      kind: 'file',
      name: fileName,
      path: file.path,
      file,
      matchedTables: pathMatch ? [] : matchingTables,
    });
  }

  const finalize = (folder: MutableFolder): SchemaTreeNode[] => {
    const folderNodes: SchemaTreeFolderNode[] = Array.from(
      folder.folders.values()
    )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((sub) => {
        const children = finalize(sub);
        let fileCount = 0;
        let errorCount = 0;
        for (const child of children) {
          if (child.kind === 'folder') {
            fileCount += child.fileCount;
            errorCount += child.errorCount;
          } else {
            fileCount += 1;
            errorCount += allErrorsByFile?.[child.path]?.length || 0;
          }
        }
        return {
          kind: 'folder',
          name: sub.name,
          path: sub.path,
          children,
          fileCount,
          errorCount,
        };
      });

    const fileNodes = [...folder.files].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return [...folderNodes, ...fileNodes];
  };

  return { nodes: finalize(root), matchCount };
}
