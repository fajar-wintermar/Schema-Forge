import { ParsedSchema, RefRelation, StickyNote } from '../../types/schema';

export interface DocsViewProps {
  schema: ParsedSchema;
  stickyNotes?: StickyNote[];
  navOpen: boolean;
  onToggleNav: () => void;
  modKey?: string;
  selectedDomains?: string[];
  onClearDomainFilter?: () => void;
  sectionRequest?: { section: DocsSection; nonce: number } | null;
  onSelectTable: (tableId: string) => void;
}

export type TreeFilterMode = 'all' | 'domain';

export type NoteCategory =
  | 'all'
  | 'project'
  | 'group'
  | 'standalone'
  | 'table'
  | 'column'
  | 'enum'
  | 'sticky';

export interface DocsNoteEntry {
  id: string;
  category: Exclude<NoteCategory, 'all'>;
  categoryLabel: string;
  title: string;
  subtitle?: string;
  content: string;
  accentColor?: string;
  line?: number;
  target?:
    | { kind: 'overview' }
    | { kind: 'group'; groupName: string }
    | { kind: 'note'; noteId: string }
    | { kind: 'table'; tableId: string }
    | { kind: 'enums' };
}

export type DocsSection =
  | { kind: 'overview' }
  | { kind: 'groups' }
  | { kind: 'notes' }
  | { kind: 'enums' }
  | { kind: 'partials' }
  | { kind: 'relationships' }
  | { kind: 'note'; noteId: string }
  | { kind: 'noteDetail'; entryId: string }
  | { kind: 'group'; groupName: string }
  | { kind: 'table'; tableId: string };

export const CARDINALITY_META: Record<
  RefRelation,
  {
    symbol: RefRelation;
    title: string;
    ratio: string;
    description: string;
    badgeCls: string;
  }
> = {
  '>': {
    symbol: '>',
    title: 'Many-to-One',
    ratio: 'N : 1',
    description: 'Many rows in source reference one row in target',
    badgeCls:
      'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
  },
  '<': {
    symbol: '<',
    title: 'One-to-Many',
    ratio: '1 : N',
    description: 'One row in source referenced by many rows in target',
    badgeCls:
      'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
  },
  '-': {
    symbol: '-',
    title: 'One-to-One',
    ratio: '1 : 1',
    description: 'Single row maps uniquely to a single row',
    badgeCls:
      'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300',
  },
  '<>': {
    symbol: '<>',
    title: 'Many-to-Many',
    ratio: 'N : M',
    description: 'Multiple rows on both sides are associated',
    badgeCls:
      'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
  },
};
