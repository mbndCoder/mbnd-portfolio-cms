import type { BlockType, ContentBlock } from '../types/cms.ts';

export function sanitizeMediaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  // Block dangerous schemes explicitly
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return '';
  }

  // Allow bare domains like github.com/mbndCoder or aparat.com/v/abc by normalizing to https://
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : /^[^\s/]+\.[^\s/]+/.test(trimmed)
      ? `https://${trimmed}`
      : '';

  if (!candidate) return '';

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    ) {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

export type ParsedVideoSource =
  | { kind: 'youtube'; embedUrl: string; videoId: string }
  | { kind: 'aparat'; embedUrl: string; videoId: string }
  | { kind: 'direct'; url: string }
  | { kind: 'invalid' };

export function parseVideoEmbed(rawUrl: string): ParsedVideoSource {
  const safe = sanitizeMediaUrl(rawUrl);
  if (!safe) return { kind: 'invalid' };

  if (safe.startsWith('/')) {
    return { kind: 'direct', url: safe };
  }

  try {
    const parsed = new URL(safe);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, youtube.com/embed/ID
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
        return {
          kind: 'youtube',
          videoId: id,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        };
      }
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      let id = parsed.searchParams.get('v') || '';
      if (!id) {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) {
          id = parts[1];
        }
      }
      if (/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
        return {
          kind: 'youtube',
          videoId: id,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        };
      }
    }

    // Aparat: aparat.com/v/HASH or aparat.com/video/video/embed/videohash/HASH/vt/frame
    if (host === 'aparat.com' || host === 'm.aparat.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      let hash = '';
      if (parts[0] === 'v' && parts[1]) {
        hash = parts[1];
      } else {
        const hashIdx = parts.indexOf('videohash');
        if (hashIdx !== -1 && parts[hashIdx + 1]) {
          hash = parts[hashIdx + 1];
        }
      }
      if (/^[a-zA-Z0-9_-]{3,32}$/.test(hash)) {
        return {
          kind: 'aparat',
          videoId: hash,
          embedUrl: `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame`,
        };
      }
    }

    return { kind: 'direct', url: safe };
  } catch {
    return { kind: 'invalid' };
  }
}

export function generateBlockId(): string {
  return `blk_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyBlock(type: BlockType): ContentBlock {
  const id = generateBlockId();
  switch (type) {
    case 'h2':
      return { id, type: 'h2', text: '' };
    case 'h3':
      return { id, type: 'h3', text: '' };
    case 'paragraph':
      return { id, type: 'paragraph', text: '' };
    case 'card':
      return { id, type: 'card', title: '', body: '', accent: 'flame' };
    case 'button':
      return { id, type: 'button', label: '', url: '', variant: 'primary' };
    case 'embed':
      return { id, type: 'embed', title: '', url: '', description: '' };
    case 'quote':
      return { id, type: 'quote', text: '', author: '' };
    case 'code':
      return { id, type: 'code', language: 'typescript', code: '' };
    case 'list':
      return { id, type: 'list', ordered: false, items: [''] };
    case 'image':
      return { id, type: 'image', url: '', alt: '', caption: '' };
    case 'video':
      return { id, type: 'video', url: '', caption: '' };
    case 'audio':
      return { id, type: 'audio', url: '', title: '', caption: '' };
  }
}

export function normalizeBlocks(input: unknown): ContentBlock[] {
  if (!Array.isArray(input)) return [];
  const result: ContentBlock[] = [];

  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generateBlockId();

    switch (raw.type) {
      case 'h2':
      case 'h3':
      case 'paragraph': {
        const text = typeof raw.text === 'string' ? raw.text : '';
        result.push({ id, type: raw.type, text });
        break;
      }
      case 'card': {
        const title = typeof raw.title === 'string' ? raw.title : '';
        const body = typeof raw.body === 'string' ? raw.body : '';
        const accent = raw.accent === 'neutral' ? 'neutral' : 'flame';
        result.push({ id, type: 'card', title, body, accent });
        break;
      }
      case 'button': {
        const label = typeof raw.label === 'string' ? raw.label : '';
        const url = typeof raw.url === 'string' ? sanitizeMediaUrl(raw.url) : '';
        const variant = raw.variant === 'secondary' ? 'secondary' : 'primary';
        result.push({ id, type: 'button', label, url, variant });
        break;
      }
      case 'embed': {
        const title = typeof raw.title === 'string' ? raw.title : '';
        const url = typeof raw.url === 'string' ? sanitizeMediaUrl(raw.url) : '';
        const description = typeof raw.description === 'string' ? raw.description : '';
        result.push({ id, type: 'embed', title, url, description });
        break;
      }
      case 'quote': {
        const text = typeof raw.text === 'string' ? raw.text : '';
        const author = typeof raw.author === 'string' ? raw.author : '';
        result.push({ id, type: 'quote', text, author });
        break;
      }
      case 'code': {
        const language =
          typeof raw.language === 'string' && raw.language.trim() ? raw.language.trim() : 'text';
        const code = typeof raw.code === 'string' ? raw.code : '';
        result.push({ id, type: 'code', language, code });
        break;
      }
      case 'list': {
        const ordered = Boolean(raw.ordered);
        const items = Array.isArray(raw.items)
          ? raw.items.filter((v): v is string => typeof v === 'string')
          : [];
        result.push({ id, type: 'list', ordered, items });
        break;
      }
      case 'image': {
        const url = typeof raw.url === 'string' ? sanitizeMediaUrl(raw.url) : '';
        const alt = typeof raw.alt === 'string' ? raw.alt : '';
        const caption = typeof raw.caption === 'string' ? raw.caption : '';
        result.push({ id, type: 'image', url, alt, caption });
        break;
      }
      case 'video': {
        const url = typeof raw.url === 'string' ? sanitizeMediaUrl(raw.url) : '';
        const caption = typeof raw.caption === 'string' ? raw.caption : '';
        result.push({ id, type: 'video', url, caption });
        break;
      }
      case 'audio': {
        const url = typeof raw.url === 'string' ? sanitizeMediaUrl(raw.url) : '';
        const title = typeof raw.title === 'string' ? raw.title : '';
        const caption = typeof raw.caption === 'string' ? raw.caption : '';
        result.push({ id, type: 'audio', url, title, caption });
        break;
      }
      default:
        break;
    }
  }

  return result;
}

export function parseBlocksJson(raw: string): ContentBlock[] {
  try {
    return normalizeBlocks(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

export function moveBlock(
  blocks: ContentBlock[],
  index: number,
  direction: -1 | 1,
): ContentBlock[] {
  return reorderArray(blocks, index, index + direction);
}

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'highlight'; value: string }
  | { type: 'link'; label: string; url: string };

const INLINE_PATTERN =
  /(\*\*([^*\n]+?)\*\*|==([^=\n]+?)==|`([^`\n]+?)`|\[([^\]\n]+?)\]\(([^)\n]+?)\)|\*([^*\n]+?)\*)/g;

export function parseInlineRichText(input: string): InlineToken[] {
  if (!input) return [];
  const tokens: InlineToken[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(INLINE_PATTERN)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      tokens.push({ type: 'text', value: input.slice(lastIndex, idx) });
    }

    if (match[2] !== undefined) {
      tokens.push({ type: 'bold', value: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'highlight', value: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'code', value: match[4] });
    } else if (match[5] !== undefined && match[6] !== undefined) {
      const safeUrl = sanitizeMediaUrl(match[6]);
      if (safeUrl) {
        tokens.push({ type: 'link', label: match[5], url: safeUrl });
      } else {
        tokens.push({ type: 'text', value: match[5] });
      }
    } else if (match[7] !== undefined) {
      tokens.push({ type: 'italic', value: match[7] });
    }

    lastIndex = idx + match[0].length;
  }

  if (lastIndex < input.length) {
    tokens.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return tokens;
}
