import { useCallback, useMemo } from 'react';
import {
  ParsedSchema,
  SchemaModuleFile,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import {
  cleanFolderPrefix,
  detectSchemaFolder,
  mapMergedErrorsToModules,
  mapMergedLineToModule,
  MERGED_SCHEMA_VIEW_ID,
  mergeSchemaFiles,
  normalizeModulePath,
  splitDbmlIntoModuleFiles,
} from '../../../utils/schemaModules';

interface UseModularSchemaFilesOptions {
  activeWorkspace: WorkspaceProject | null;
  parsedSchema: ParsedSchema;
  updateActiveWorkspace: (
    updater: (prev: WorkspaceProject) => WorkspaceProject
  ) => void;
  setScrollToLine: React.Dispatch<React.SetStateAction<number | null>>;
  setEditorWidth: React.Dispatch<React.SetStateAction<number>>;
  showToast: (msg: string) => void;
}

export function useModularSchemaFiles({
  activeWorkspace,
  parsedSchema,
  updateActiveWorkspace,
  setScrollToLine,
  setEditorWidth,
  showToast,
}: UseModularSchemaFilesOptions) {
  const isModular = Boolean(
    activeWorkspace?.schemaFiles && activeWorkspace.schemaFiles.length > 0
  );

  const activeSchemaFolder = useMemo(() => {
    if (!activeWorkspace?.schemaFiles || activeWorkspace.schemaFiles.length === 0) {
      return 'schema';
    }
    return cleanFolderPrefix(
      activeWorkspace.schemaFolder ||
        detectSchemaFolder(activeWorkspace.schemaFiles)
    );
  }, [activeWorkspace?.schemaFiles, activeWorkspace?.schemaFolder]);

  const mergeResult = useMemo(() => {
    if (!activeWorkspace?.schemaFiles || activeWorkspace.schemaFiles.length === 0) {
      return null;
    }
    return mergeSchemaFiles(activeWorkspace.schemaFiles, {
      schemaFolder: activeSchemaFolder,
    });
  }, [activeWorkspace?.schemaFiles, activeSchemaFolder]);

  const moduleErrors = useMemo(() => {
    if (!mergeResult) return null;
    return mapMergedErrorsToModules(parsedSchema.errors, mergeResult.segments);
  }, [mergeResult, parsedSchema.errors]);

  const activeSchemaFilePath = useMemo(() => {
    if (!isModular || !activeWorkspace?.schemaFiles) return '';
    const current = activeWorkspace.activeSchemaFile;
    if (current === MERGED_SCHEMA_VIEW_ID) return MERGED_SCHEMA_VIEW_ID;
    if (current && activeWorkspace.schemaFiles.some((f) => f.path === current)) {
      return current;
    }
    const sorted = [...activeWorkspace.schemaFiles].sort((a, b) =>
      a.path.localeCompare(b.path)
    );
    return sorted[0]?.path || '';
  }, [isModular, activeWorkspace?.schemaFiles, activeWorkspace?.activeSchemaFile]);

  const editorValue = useMemo(() => {
    if (!activeWorkspace) return '';
    if (!isModular || !activeWorkspace.schemaFiles) return activeWorkspace.dbml;
    if (activeSchemaFilePath === MERGED_SCHEMA_VIEW_ID) {
      return mergeResult?.mergedDbml || activeWorkspace.dbml;
    }
    return (
      activeWorkspace.schemaFiles.find((f) => f.path === activeSchemaFilePath)
        ?.content || ''
    );
  }, [activeWorkspace, isModular, activeSchemaFilePath, mergeResult]);

  const editorErrors = useMemo(() => {
    if (!isModular) return parsedSchema.errors;
    if (activeSchemaFilePath === MERGED_SCHEMA_VIEW_ID) {
      return parsedSchema.errors;
    }
    return moduleErrors?.byFile[activeSchemaFilePath] || [];
  }, [isModular, activeSchemaFilePath, parsedSchema.errors, moduleErrors]);

  const jumpToMergedLine = useCallback(
    (mergedLine?: number) => {
      if (!mergedLine) return;
      if (!isModular || !mergeResult) {
        setScrollToLine(mergedLine);
        return;
      }
      const mapped = mapMergedLineToModule(mergedLine, mergeResult.segments);
      if (mapped) {
        updateActiveWorkspace((ws) => ({
          ...ws,
          activeSchemaFile: mapped.path,
        }));
        setScrollToLine(mapped.localLine);
      } else {
        setScrollToLine(mergedLine);
      }
    },
    [isModular, mergeResult, updateActiveWorkspace, setScrollToLine]
  );

  const updateModularFiles = useCallback(
    (
      updater: (
        files: SchemaModuleFile[],
        ws: WorkspaceProject
      ) => {
        files: SchemaModuleFile[];
        activeSchemaFile?: string;
        schemaFolder?: string;
      }
    ) => {
      updateActiveWorkspace((ws) => {
        const currentFiles = ws.schemaFiles || [];
        const next = updater(currentFiles, ws);
        const folder = cleanFolderPrefix(
          next.schemaFolder ||
            ws.schemaFolder ||
            detectSchemaFolder(next.files)
        );
        const merged = mergeSchemaFiles(next.files, { schemaFolder: folder });
        return {
          ...ws,
          schemaFiles: next.files,
          schemaFolder: folder,
          activeSchemaFile:
            next.activeSchemaFile !== undefined
              ? next.activeSchemaFile
              : ws.activeSchemaFile,
          dbml: merged.mergedDbml,
        };
      });
    },
    [updateActiveWorkspace]
  );

  const handleDbmlChange = (nextDbml: string) => {
    if (isModular) {
      if (activeSchemaFilePath === MERGED_SCHEMA_VIEW_ID) return;
      updateModularFiles((files) => ({
        files: files.map((f) =>
          f.path === activeSchemaFilePath ? { ...f, content: nextDbml } : f
        ),
      }));
      return;
    }
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleSelectSchemaFile = (path: string) => {
    setScrollToLine(null);
    updateActiveWorkspace((ws) => ({
      ...ws,
      activeSchemaFile: path,
    }));
  };

  const handleCreateSchemaFile = (rawPath: string, content: string) => {
    if (!activeWorkspace) return;
    const normalizedPath = normalizeModulePath(rawPath, activeSchemaFolder);
    const existing = activeWorkspace.schemaFiles?.find(
      (f) => f.path === normalizedPath
    );
    if (existing) {
      handleSelectSchemaFile(existing.path);
      showToast(`${normalizedPath} already exists`);
      return;
    }
    const created: SchemaModuleFile = {
      id: `mod_${Date.now()}`,
      path: normalizedPath,
      content,
    };
    updateModularFiles((files) => ({
      files: [...files, created],
      activeSchemaFile: normalizedPath,
    }));
    showToast(`Created ${normalizedPath}`);
  };

  const handleRenameSchemaFile = (oldPath: string, rawNewPath: string) => {
    if (!activeWorkspace) return;
    const nextPath = normalizeModulePath(rawNewPath, activeSchemaFolder);
    if (!nextPath || nextPath === oldPath) return;
    if (activeWorkspace.schemaFiles?.some((f) => f.path === nextPath)) {
      showToast(`${nextPath} already exists`);
      return;
    }
    updateModularFiles((files) => ({
      files: files.map((f) =>
        f.path === oldPath
          ? {
              ...f,
              path: nextPath,
              sha: undefined,
              lastSyncedContent: undefined,
              lastSyncedAt: undefined,
            }
          : f
      ),
      activeSchemaFile: nextPath,
    }));
    showToast(`Renamed ${oldPath} → ${nextPath}`);
  };

  const handleDeleteSchemaFile = (path: string) => {
    if (!activeWorkspace?.schemaFiles || activeWorkspace.schemaFiles.length <= 1) {
      return;
    }
    const remaining = activeWorkspace.schemaFiles
      .filter((f) => f.path !== path)
      .sort((a, b) => a.path.localeCompare(b.path));
    const nextActive = remaining[0]?.path || MERGED_SCHEMA_VIEW_ID;
    updateModularFiles(() => ({
      files: remaining,
      activeSchemaFile: nextActive,
    }));
    showToast(`Deleted ${path}`);
  };

  const handleEnableModularMode = () => {
    if (!activeWorkspace) return;
    const folder = activeWorkspace.schemaFolder || 'schema';
    const splitFiles = splitDbmlIntoModuleFiles(activeWorkspace.dbml, folder);
    const merged = mergeSchemaFiles(splitFiles, { schemaFolder: folder });
    const defaultActive =
      splitFiles.find((f) => !/_project\.dbml$/i.test(f.path))?.path ||
      splitFiles[0]?.path;
    updateActiveWorkspace((ws) => ({
      ...ws,
      schemaFiles: splitFiles,
      schemaFolder: folder,
      activeSchemaFile: defaultActive,
      githubLink: undefined,
      dbml: merged.mergedDbml,
    }));
    setEditorWidth((w) => Math.max(w, 580));
    showToast(`Split into ${splitFiles.length} modular files in ${folder}/`);
  };

  const handleFlattenToSingleFile = () => {
    if (!activeWorkspace) return;
    const flattened = mergeResult?.mergedDbml || activeWorkspace.dbml;
    updateActiveWorkspace((ws) => ({
      ...ws,
      dbml: flattened,
      schemaFiles: undefined,
      activeSchemaFile: undefined,
      githubRepoLink: undefined,
    }));
    showToast('Flattened modular files back into a single schema.dbml');
  };

  return {
    isModular,
    activeSchemaFolder,
    mergeResult,
    moduleErrors,
    activeSchemaFilePath,
    editorValue,
    editorErrors,
    jumpToMergedLine,
    updateModularFiles,
    handleDbmlChange,
    handleSelectSchemaFile,
    handleCreateSchemaFile,
    handleRenameSchemaFile,
    handleDeleteSchemaFile,
    handleEnableModularMode,
    handleFlattenToSingleFile,
  };
}
