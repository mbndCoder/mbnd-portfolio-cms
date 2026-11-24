import type { SiteLanguage } from '../types/cms.ts';

export type InlineFormatKind = 'bold' | 'italic' | 'highlight' | 'code';

export interface ActiveInlineFormats {
  bold: boolean;
  italic: boolean;
  highlight: boolean;
  code: boolean;
  any: boolean;
}

export interface InlineFormatResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  action: 'wrapped' | 'unwrapped' | 'exited' | 'inserted';
}

interface FormatSpec {
  prefix: string;
  suffix: string;
  placeholderFa: string;
  placeholderEn: string;
}

const FORMAT_SPECS: Record<InlineFormatKind, FormatSpec> = {
  bold: {
    prefix: '**',
    suffix: '**',
    placeholderFa: 'متن بولد',
    placeholderEn: 'bold text',
  },
  italic: {
    prefix: '*',
    suffix: '*',
    placeholderFa: 'متن کج',
    placeholderEn: 'italic text',
  },
  highlight: {
    prefix: '==',
    suffix: '==',
    placeholderFa: 'نکته مهم',
    placeholderEn: 'highlighted text',
  },
  code: {
    prefix: '`',
    suffix: '`',
    placeholderFa: 'code',
    placeholderEn: 'code',
  },
};

interface SpanRange {
  outerStart: number;
  innerStart: number;
  innerEnd: number;
  outerEnd: number;
  kind: InlineFormatKind | 'link';
}

/**
 * Finds all non-overlapping inline markdown spans in `text` (same priority order as BlockRenderer).
 */
function findInlineSpans(text: string): SpanRange[] {
  const spans: SpanRange[] = [];
  const pattern =
    /(\*\*([^\n*]+?)\*\*)|(==([^\n=]+?)==)|(`([^\n`]+?)`)|(\[([^\]\n]+)\]\(([^)\s]+)\))|((?<!\*)\*([^\n*]+?)\*(?!\*))/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const outerStart = match.index;
    const outerEnd = outerStart + match[0].length;
    if (match[1] !== undefined) {
      spans.push({
        outerStart,
        innerStart: outerStart + 2,
        innerEnd: outerEnd - 2,
        outerEnd,
        kind: 'bold',
      });
    } else if (match[3] !== undefined) {
      spans.push({
        outerStart,
        innerStart: outerStart + 2,
        innerEnd: outerEnd - 2,
        outerEnd,
        kind: 'highlight',
      });
    } else if (match[5] !== undefined) {
      spans.push({
        outerStart,
        innerStart: outerStart + 1,
        innerEnd: outerEnd - 1,
        outerEnd,
        kind: 'code',
      });
    } else if (match[7] !== undefined) {
      spans.push({
        outerStart,
        innerStart: outerStart + 1,
        innerEnd: outerStart + 1 + match[8].length,
        outerEnd,
        kind: 'link',
      });
    } else if (match[10] !== undefined) {
      spans.push({
        outerStart,
        innerStart: outerStart + 1,
        innerEnd: outerEnd - 1,
        outerEnd,
        kind: 'italic',
      });
    }
  }

  return spans;
}

/**
 * Detects an empty marker pair right around a collapsed cursor (e.g. `**|**`, `==|==`, `` `|` ``, `*|*`).
 */
function findEmptyPairAroundCursor(
  text: string,
  cursor: number,
  kind: InlineFormatKind,
): SpanRange | null {
  const { prefix, suffix } = FORMAT_SPECS[kind];
  const before = text.slice(Math.max(0, cursor - prefix.length), cursor);
  const after = text.slice(cursor, cursor + suffix.length);
  if (before !== prefix || after !== suffix) return null;

  if (kind === 'italic') {
    const charBefore = text[cursor - 2];
    const charAfter = text[cursor + 1];
    if (charBefore === '*' || charAfter === '*') return null;
  }

  return {
    outerStart: cursor - prefix.length,
    innerStart: cursor,
    innerEnd: cursor,
    outerEnd: cursor + suffix.length,
    kind,
  };
}

function findEnclosingSpan(
  text: string,
  start: number,
  end: number,
  kind?: InlineFormatKind,
): SpanRange | null {
  const spans = findInlineSpans(text);
  for (const span of spans) {
    if (kind && span.kind !== kind) continue;
    if (start === end) {
      // Collapsed cursor is inside the span if strictly after outerStart and at or before innerEnd
      if (start >= span.innerStart && start <= span.innerEnd) {
        return span;
      }
    } else {
      // Non-empty selection lies inside or matches the span
      if (start >= span.outerStart && end <= span.outerEnd) {
        return span;
      }
    }
  }

  if (start === end && kind) {
    return findEmptyPairAroundCursor(text, start, kind);
  }
  return null;
}

export function detectActiveFormats(
  text: string,
  start: number,
  end: number,
): ActiveInlineFormats {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const bold = Boolean(findEnclosingSpan(text, safeStart, safeEnd, 'bold'));
  const italic = Boolean(findEnclosingSpan(text, safeStart, safeEnd, 'italic'));
  const highlight = Boolean(findEnclosingSpan(text, safeStart, safeEnd, 'highlight'));
  const code = Boolean(findEnclosingSpan(text, safeStart, safeEnd, 'code'));
  return {
    bold,
    italic,
    highlight,
    code,
    any: bold || italic || highlight || code,
  };
}

/**
 * Toggles inline formatting cleanly without ever trapping the cursor inside markers:
 * - If selection is already formatted (either wrapped or including delimiters): unwraps it.
 * - If cursor is collapsed inside an existing formatted span:
 *   - Empty pair (`**|**`): removes the empty delimiters.
 *   - Non-empty span (`**hello|**`): exits immediately AFTER the closing delimiter so normal typing continues outside.
 * - If selection has unformatted text: wraps it and places cursor immediately AFTER the closing delimiter (so typing continues outside format cleanly!).
 * - If cursor is collapsed outside any span: inserts placeholder wrapped in markers with placeholder selected, ready to overwrite, and one click or Esc exits cleanly.
 */
export function toggleInlineFormat(
  text: string,
  start: number,
  end: number,
  kind: InlineFormatKind,
  contentLang: SiteLanguage = 'fa',
): InlineFormatResult {
  const spec = FORMAT_SPECS[kind];
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const { prefix, suffix } = spec;

  // 1. Check if selection or cursor is already inside an enclosing span of the same kind
  const enclosing = findEnclosingSpan(text, safeStart, safeEnd, kind);

  if (enclosing) {
    // Collapsed cursor inside span -> exit cleanly (or remove if empty)
    if (safeStart === safeEnd) {
      if (enclosing.innerStart === enclosing.innerEnd) {
        const nextVal = text.slice(0, enclosing.outerStart) + text.slice(enclosing.outerEnd);
        return {
          value: nextVal,
          selectionStart: enclosing.outerStart,
          selectionEnd: enclosing.outerStart,
          action: 'unwrapped',
        };
      }
      // Jump cursor right past closing delimiter so user can keep typing outside the format
      return {
        value: text,
        selectionStart: enclosing.outerEnd,
        selectionEnd: enclosing.outerEnd,
        action: 'exited',
      };
    }

    // Non-empty selection covering the full inner text or full outer span -> unwrap cleanly
    if (
      (safeStart === enclosing.innerStart && safeEnd === enclosing.innerEnd) ||
      (safeStart === enclosing.outerStart && safeEnd === enclosing.outerEnd)
    ) {
      const innerText = text.slice(enclosing.innerStart, enclosing.innerEnd);
      const nextVal =
        text.slice(0, enclosing.outerStart) + innerText + text.slice(enclosing.outerEnd);
      return {
        value: nextVal,
        selectionStart: enclosing.outerStart,
        selectionEnd: enclosing.outerStart + innerText.length,
        action: 'unwrapped',
      };
    }

    // Partial selection strictly inside an enclosing span -> split out the selected substring as unformatted
    const leftInner = text.slice(enclosing.innerStart, safeStart);
    const middle = text.slice(safeStart, safeEnd);
    const rightInner = text.slice(safeEnd, enclosing.innerEnd);
    const leftPart = leftInner ? `${prefix}${leftInner}${suffix}` : '';
    const rightPart = rightInner ? `${prefix}${rightInner}${suffix}` : '';
    const nextVal =
      text.slice(0, enclosing.outerStart) +
      leftPart +
      middle +
      rightPart +
      text.slice(enclosing.outerEnd);
    const newStart = enclosing.outerStart + leftPart.length;
    return {
      value: nextVal,
      selectionStart: newStart,
      selectionEnd: newStart + middle.length,
      action: 'unwrapped',
    };
  }

  // 2. Non-empty unformatted selection -> wrap and move cursor right AFTER closing delimiter
  // Preserve leading/trailing whitespace outside the markers so markdown always parses cleanly
  if (safeStart < safeEnd) {
    const rawSelected = text.slice(safeStart, safeEnd);
    const leadMatch = rawSelected.match(/^\s*/)?.[0] || '';
    const trailMatch = rawSelected.match(/\s*$/)?.[0] || '';
    const core = rawSelected.slice(leadMatch.length, rawSelected.length - trailMatch.length);

    if (core.length > 0) {
      // If selected text itself starts/ends with markers, unwrap instead of double-wrapping
      if (
        core.startsWith(prefix) &&
        core.endsWith(suffix) &&
        core.length > prefix.length + suffix.length
      ) {
        const unwrapped = core.slice(prefix.length, core.length - suffix.length);
        const nextVal =
          text.slice(0, safeStart) + leadMatch + unwrapped + trailMatch + text.slice(safeEnd);
        const selStart = safeStart + leadMatch.length;
        return {
          value: nextVal,
          selectionStart: selStart,
          selectionEnd: selStart + unwrapped.length,
          action: 'unwrapped',
        };
      }

      const wrapped = `${leadMatch}${prefix}${core}${suffix}${trailMatch}`;
      const nextVal = text.slice(0, safeStart) + wrapped + text.slice(safeEnd);
      const afterClosing = safeStart + leadMatch.length + prefix.length + core.length + suffix.length;
      return {
        value: nextVal,
        selectionStart: afterClosing,
        selectionEnd: afterClosing,
        action: 'wrapped',
      };
    }
  }

  // 3. Collapsed cursor outside any span -> insert localized placeholder & select inner placeholder
  const placeholder = contentLang === 'en' ? spec.placeholderEn : spec.placeholderFa;
  const inserted = `${prefix}${placeholder}${suffix}`;
  const nextVal = text.slice(0, safeStart) + inserted + text.slice(safeEnd);
  return {
    value: nextVal,
    selectionStart: safeStart + prefix.length,
    selectionEnd: safeStart + prefix.length + placeholder.length,
    action: 'inserted',
  };
}

/**
 * Exits any enclosing inline format (bold, italic, highlight, code, or link) by placing
 * the cursor immediately AFTER the closing delimiter (plus a space if at end and needed).
 */
export function exitInlineFormat(
  text: string,
  cursor: number,
): { exited: boolean; cursor: number } {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const spans = findInlineSpans(text);
  for (const span of spans) {
    if (safeCursor >= span.innerStart && safeCursor <= span.outerEnd && safeCursor < span.outerEnd) {
      return { exited: true, cursor: span.outerEnd };
    }
  }
  for (const kind of ['bold', 'highlight', 'code', 'italic'] as InlineFormatKind[]) {
    const empty = findEmptyPairAroundCursor(text, safeCursor, kind);
    if (empty) {
      return { exited: true, cursor: empty.outerEnd };
    }
  }
  return { exited: false, cursor: safeCursor };
}

/**
 * Inserts a markdown link `[label](url)` and places the cursor immediately AFTER `)`.
 */
export function insertInlineLink(
  text: string,
  start: number,
  end: number,
  label: string,
  url: string,
): { value: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const cleanLabel = label.trim() || url.trim();
  const cleanUrl = url.trim();
  const token = `[${cleanLabel}](${cleanUrl})`;
  const nextVal = text.slice(0, safeStart) + token + text.slice(safeEnd);
  return {
    value: nextVal,
    cursor: safeStart + token.length,
  };
}
