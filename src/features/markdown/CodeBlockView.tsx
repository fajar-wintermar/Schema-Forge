import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { highlightCode, TOKEN_CLASS_MAP } from '../../utils/codeHighlight';

export interface CodeBlockViewProps {
  code: string;
  language?: string;
}

export const CodeBlockView: React.FC<CodeBlockViewProps> = ({
  code,
  language,
}) => {
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo(
    () => highlightCode(code, language),
    [code, language]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const showLineNumbers = highlighted.lines.length > 1;
  const displayLang = language?.trim() || highlighted.language || 'text';

  return (
    <div className="my-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 overflow-hidden shadow-sm">
      <div className="px-3.5 py-1.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="font-mono uppercase tracking-wider text-[10px] text-slate-300">
            {displayLang}
          </span>
          {highlighted.autoDetected && highlighted.language !== 'text' && (
            <span className="text-[9px] font-mono text-slate-500">auto</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="py-3 px-3.5 overflow-x-auto text-xs leading-relaxed font-mono text-slate-100">
        <code className="block min-w-max">
          {highlighted.lines.map((tokens, lineIdx) => {
            const isDiffAdded =
              tokens.length === 1 && tokens[0].type === 'added';
            const isDiffRemoved =
              tokens.length === 1 && tokens[0].type === 'removed';
            const rowTint = isDiffAdded
              ? 'bg-emerald-500/12 -mx-3.5 px-3.5'
              : isDiffRemoved
              ? 'bg-rose-500/12 -mx-3.5 px-3.5'
              : '';
            return (
              <div key={lineIdx} className={`flex min-h-[1.625em] ${rowTint}`}>
                {showLineNumbers && (
                  <span
                    aria-hidden="true"
                    className="select-none w-7 pr-3 text-right text-slate-600 shrink-0 tabular-nums"
                  >
                    {lineIdx + 1}
                  </span>
                )}
                <span className="flex-1 whitespace-pre">
                  {tokens.map((tok, tokIdx) => (
                    <span key={tokIdx} className={TOKEN_CLASS_MAP[tok.type]}>
                      {tok.text}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
};
