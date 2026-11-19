export type HighlightTokenType =
  | 'plain'
  | 'comment'
  | 'keyword'
  | 'type'
  | 'string'
  | 'number'
  | 'boolean'
  | 'property'
  | 'identifier'
  | 'operator'
  | 'punctuation'
  | 'variable'
  | 'decorator'
  | 'added'
  | 'removed'
  | 'meta';

export interface HighlightToken {
  type: HighlightTokenType;
  text: string;
}

export interface HighlightResult {
  language: string;
  autoDetected: boolean;
  lines: HighlightToken[][];
}

export const TOKEN_CLASS_MAP: Record<HighlightTokenType, string> = {
  plain: 'text-slate-100',
  comment: 'text-slate-500 italic',
  keyword: 'text-violet-400 font-medium',
  type: 'text-emerald-300',
  string: 'text-amber-300',
  number: 'text-orange-300',
  boolean: 'text-orange-300 font-medium',
  property: 'text-sky-300',
  identifier: 'text-cyan-300',
  operator: 'text-sky-400',
  punctuation: 'text-slate-400',
  variable: 'text-teal-300',
  decorator: 'text-pink-400',
  added: 'text-emerald-300',
  removed: 'text-rose-300',
  meta: 'text-cyan-400 font-semibold',
};

export function pushToken(
  tokens: HighlightToken[],
  type: HighlightTokenType,
  text: string
) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    tokens.push({ type, text });
  }
}
