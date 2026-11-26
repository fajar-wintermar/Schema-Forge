import React from 'react';
import type { MetadataTag, MetadataTagTone } from '../../../utils/metadataTags';

const TONE_CLASSES: Record<MetadataTagTone, string> = {
  pii: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  deprecated:
    'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  owner:
    'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  sla: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  default:
    'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

export function getTagToneBadgeClass(tone: MetadataTagTone): string {
  return TONE_CLASSES[tone] || TONE_CLASSES.default;
}

interface MetadataTagPillsProps {
  tags: MetadataTag[];
  className?: string;
}

export const MetadataTagPills: React.FC<MetadataTagPillsProps> = ({
  tags,
  className = '',
}) => {
  if (tags.length === 0) return null;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {tags.map((tag) => (
        <span
          key={`${tag.key}-${tag.value || ''}`}
          className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold leading-none ${getTagToneBadgeClass(
            tag.tone
          )}`}
        >
          {tag.label}
        </span>
      ))}
    </span>
  );
};
