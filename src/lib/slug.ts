import type { ContentBlock } from '../types/cms.ts';

const ARABIC_TO_PERSIAN_CHAR_MAP: Record<string, string> = {
  'ي': 'ی',
  'ك': 'ک',
  'ة': 'ه',
  'أ': 'ا',
  'إ': 'ا',
  'آ': 'آ',
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDigitsToAscii(input: string): string {
  let out = '';
  for (const ch of input) {
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    out += ch;
  }
  return out;
}

export function slugifyPersian(input: string): string {
  const normalized = normalizeDigitsToAscii(input.trim())
    .replace(/[يكةأإآ]/g, (ch) => ARABIC_TO_PERSIAN_CHAR_MAP[ch] ?? ch)
    .toLowerCase();

  const cleaned = normalized
    .replace(/[\u200c\s_]+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06ff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || `post-${Date.now().toString(36)}`;
}

export function formatPersianNumber(value: number | string): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

function countWords(text?: string): number {
  if (!text) return 0;
  const cleaned = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`=~_#>-]+/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingMinutes(blocks: ContentBlock[]): number {
  let words = 0;

  for (const block of blocks) {
    if (block.type === 'h2' || block.type === 'h3' || block.type === 'paragraph') {
      words += countWords(block.text);
    } else if (block.type === 'card') {
      words += countWords(block.title) + countWords(block.body);
    } else if (block.type === 'button') {
      words += countWords(block.label);
    } else if (block.type === 'embed') {
      words += countWords(block.title) + countWords(block.description);
    } else if (block.type === 'quote') {
      words += countWords(block.text) + countWords(block.author);
    } else if (block.type === 'list') {
      for (const item of block.items) {
        words += countWords(item);
      }
    } else if (block.type === 'code') {
      words += Math.ceil(block.code.trim().split(/\s+/).filter(Boolean).length * 0.5);
    } else if (block.type === 'image') {
      words += countWords(block.caption);
    } else if (block.type === 'video') {
      words += countWords(block.caption);
    } else if (block.type === 'audio') {
      words += countWords(block.title) + countWords(block.caption);
    }
  }

  return Math.max(1, Math.ceil(words / 180));
}

export function formatPersianDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return isoDate.slice(0, 10);
  }
}
