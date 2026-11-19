import { HighlightResult, HighlightToken } from './highlight/types';
import {
  detectCodeLanguage,
  normalizeCodeLanguage,
} from './highlight/detectLanguage';
import { highlightDbml, highlightSql } from './highlight/dbmlAndSql';
import {
  highlightBash,
  highlightDiff,
  highlightJson,
  highlightMarkdownBlock,
  highlightXml,
  highlightYamlOrToml,
} from './highlight/dataAndShell';
import { highlightGeneric, LANG_CONFIGS } from './highlight/genericLangs';

export {
  TOKEN_CLASS_MAP,
  type HighlightResult,
  type HighlightToken,
  type HighlightTokenType,
} from './highlight/types';
export {
  detectCodeLanguage,
  normalizeCodeLanguage,
} from './highlight/detectLanguage';

export function highlightCode(code: string, rawLanguage?: string): HighlightResult {
  const normalized = normalizeCodeLanguage(rawLanguage);
  const autoDetected = !normalized;
  const language = normalized || detectCodeLanguage(code);
  const rawLines = code.replace(/\r\n?/g, '\n').split('\n');

  let lines: HighlightToken[][];
  switch (language) {
    case 'dbml':
      lines = highlightDbml(rawLines);
      break;
    case 'sql':
      lines = highlightSql(rawLines);
      break;
    case 'json':
      lines = highlightJson(rawLines);
      break;
    case 'bash':
      lines = highlightBash(rawLines);
      break;
    case 'yaml':
      lines = highlightYamlOrToml(rawLines, false);
      break;
    case 'toml':
      lines = highlightYamlOrToml(rawLines, true);
      break;
    case 'xml':
      lines = highlightXml(rawLines);
      break;
    case 'diff':
      lines = highlightDiff(rawLines);
      break;
    case 'markdown':
      lines = highlightMarkdownBlock(rawLines);
      break;
    default: {
      const cfg = LANG_CONFIGS[language];
      if (cfg) {
        lines = highlightGeneric(rawLines, cfg);
      } else {
        lines = rawLines.map((line) => (line ? [{ type: 'plain', text: line }] : []));
      }
      break;
    }
  }

  return {
    language,
    autoDetected,
    lines,
  };
}
