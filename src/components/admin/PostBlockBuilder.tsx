import {
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  Code2,
  CopyPlus,
  ExternalLink,
  Eye,
  GripVertical,
  Heading2,
  Heading3,
  Headphones,
  Highlighter,
  Image as ImageIcon,
  Italic,
  LayoutPanelTop,
  Link2,
  List,
  MousePointerClick,
  PenLine,
  Quote,
  Trash2,
  Type,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import {
  createEmptyBlock,
  moveBlock,
  parseVideoEmbed,
  reorderArray,
  sanitizeMediaUrl,
} from '../../lib/blocks.ts';
import type { BlockType, ContentBlock, SiteLanguage } from '../../types/cms.ts';
import { BlockRenderer } from '../BlockRenderer.tsx';

interface PostBlockBuilderProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  onUploadFile: (file: File) => Promise<string | null>;
  adminLang?: SiteLanguage;
  contentLang?: SiteLanguage;
}

const BLOCK_PALETTE_FA: Array<{ type: BlockType; label: string; icon: typeof Type }> = [
  { type: 'paragraph', label: 'پاراگراف', icon: Type },
  { type: 'h2', label: 'تیتر اصلی', icon: Heading2 },
  { type: 'h3', label: 'تیتر فرعی', icon: Heading3 },
  { type: 'card', label: 'کارت نکته', icon: LayoutPanelTop },
  { type: 'button', label: 'دکمه لینک', icon: MousePointerClick },
  { type: 'embed', label: 'لینک خارجی', icon: ExternalLink },
  { type: 'quote', label: 'نقل‌قول', icon: Quote },
  { type: 'list', label: 'فهرست', icon: List },
  { type: 'code', label: 'کد', icon: Code2 },
  { type: 'image', label: 'تصویر', icon: ImageIcon },
  { type: 'video', label: 'ویدیو', icon: Video },
  { type: 'audio', label: 'صوت', icon: Headphones },
];

const BLOCK_PALETTE_EN: Array<{ type: BlockType; label: string; icon: typeof Type }> = [
  { type: 'paragraph', label: 'Paragraph', icon: Type },
  { type: 'h2', label: 'Heading H2', icon: Heading2 },
  { type: 'h3', label: 'Heading H3', icon: Heading3 },
  { type: 'card', label: 'Callout Card', icon: LayoutPanelTop },
  { type: 'button', label: 'Link Button', icon: MousePointerClick },
  { type: 'embed', label: 'Link Card', icon: ExternalLink },
  { type: 'quote', label: 'Quote', icon: Quote },
  { type: 'list', label: 'List', icon: List },
  { type: 'code', label: 'Code', icon: Code2 },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'audio', label: 'Audio', icon: Headphones },
];

const BLOCK_LABELS_FA: Record<BlockType, string> = {
  paragraph: 'پاراگراف',
  h2: 'تیتر H2',
  h3: 'تیتر H3',
  card: 'کارت نکته',
  button: 'دکمه لینک',
  embed: 'کارت لینک خارجی',
  quote: 'نقل‌قول',
  list: 'فهرست',
  code: 'کد',
  image: 'تصویر',
  video: 'ویدیو',
  audio: 'صوت',
};

const BLOCK_LABELS_EN: Record<BlockType, string> = {
  paragraph: 'Paragraph',
  h2: 'Heading H2',
  h3: 'Heading H3',
  card: 'Callout Card',
  button: 'Link Button',
  embed: 'External Link Card',
  quote: 'Quote',
  list: 'List',
  code: 'Code Block',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

interface InlineFormatBarProps {
  isEn: boolean;
  onWrap: (prefix: string, suffix: string, fallback: string) => void;
  onInsertLink: (label: string, url: string) => void;
  getSelectedText: () => string;
}

function InlineFormatBar({ isEn, onWrap, onInsertLink, getSelectedText }: InlineFormatBarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');

  const keepSelection = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const openLinkPopover = () => {
    const sel = getSelectedText();
    setLinkLabel(sel);
    setLinkUrl('');
    setLinkError('');
    setLinkOpen((prev) => !prev);
  };

  const confirmLink = () => {
    const cleanUrl = sanitizeMediaUrl(linkUrl);
    if (!cleanUrl) {
      setLinkError(
        isEn
          ? 'Invalid link URL (e.g. https://example.com or /projects).'
          : 'نشانی لینک معتبر نیست (مثلاً https://example.com یا /projects).',
      );
      return;
    }
    const cleanLabel = linkLabel.trim() || cleanUrl;
    onInsertLink(cleanLabel, cleanUrl);
    setLinkOpen(false);
    setLinkLabel('');
    setLinkUrl('');
    setLinkError('');
  };

  return (
    <div className="mb-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] p-1">
        <button
          type="button"
          onMouseDown={keepSelection}
          onClick={() => onWrap('**', '**', isEn ? 'bold text' : 'متن بولد')}
          title={isEn ? 'Bold' : 'بولد'}
          aria-label={isEn ? 'Bold text' : 'بولد کردن متن'}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <Bold className="h-3.5 w-3.5" />
          <span>{isEn ? 'Bold' : 'بولد'}</span>
        </button>
        <button
          type="button"
          onMouseDown={keepSelection}
          onClick={() => onWrap('*', '*', isEn ? 'italic text' : 'متن کج')}
          title={isEn ? 'Italic' : 'ایتالیک'}
          aria-label={isEn ? 'Italic text' : 'کج کردن متن'}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <Italic className="h-3.5 w-3.5" />
          <span>{isEn ? 'Italic' : 'کج'}</span>
        </button>
        <button
          type="button"
          onMouseDown={keepSelection}
          onClick={() => onWrap('==', '==', isEn ? 'highlighted text' : 'متن مهم')}
          title={isEn ? 'Highlight' : 'هایلایت'}
          aria-label={isEn ? 'Highlight text' : 'هایلایت کردن متن'}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <Highlighter className="h-3.5 w-3.5 text-[var(--flame)]" />
          <span>{isEn ? 'Highlight' : 'هایلایت'}</span>
        </button>
        <button
          type="button"
          onMouseDown={keepSelection}
          onClick={() => onWrap('`', '`', 'code')}
          title={isEn ? 'Inline code' : 'کد درون‌خطی'}
          aria-label={isEn ? 'Inline code' : 'افزودن کد درون‌خطی'}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>{isEn ? 'Code' : 'کد'}</span>
        </button>
        <button
          type="button"
          onMouseDown={keepSelection}
          onClick={openLinkPopover}
          title={isEn ? 'Insert link' : 'افزودن لینک'}
          aria-label={isEn ? 'Insert link' : 'افزودن لینک درون متن'}
          className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] transition-colors ${
            linkOpen
              ? 'bg-[var(--flame-tint)] text-[var(--flame)]'
              : 'text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
          }`}
        >
          <Link2 className="h-3.5 w-3.5 text-[var(--flame)]" />
          <span>{isEn ? 'Link' : 'لینک'}</span>
        </button>
      </div>

      {linkOpen && (
        <div className="rounded-xl border border-[var(--flame-border)] bg-[var(--ground-deep)] p-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <input
              type="text"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder={isEn ? 'Link display text' : 'متن نمایشی لینک'}
              aria-label={isEn ? 'Link display text' : 'متن نمایشی لینک'}
              className="rounded-lg border border-[var(--hair-strong)] bg-[var(--ground)] px-2.5 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none sm:col-span-4"
            />
            <input
              type="text"
              dir="ltr"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                if (linkError) setLinkError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmLink();
                }
              }}
              placeholder={isEn ? 'https://example.com or /projects' : 'https://example.com یا /projects'}
              aria-label={isEn ? 'Link URL' : 'نشانی لینک'}
              className="rounded-lg border border-[var(--hair-strong)] bg-[var(--ground)] px-2.5 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none sm:col-span-5"
            />
            <div className="flex items-center gap-1.5 sm:col-span-3">
              <button
                type="button"
                onClick={confirmLink}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-[var(--flame)] px-2.5 py-1.5 text-xs font-bold text-[var(--flame-ink)] hover:bg-[var(--flame-lit)]"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isEn ? 'Insert' : 'درج'}</span>
              </button>
              <button
                type="button"
                onClick={() => setLinkOpen(false)}
                aria-label={isEn ? 'Close link popover' : 'بستن درج لینک'}
                className="cursor-pointer rounded-lg border border-[var(--hair-strong)] p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {linkError && <p className="mt-1.5 text-[11px] text-[var(--status-error-ink)]">{linkError}</p>}
        </div>
      )}
    </div>
  );
}

export function PostBlockBuilder({
  blocks,
  onChange,
  onUploadFile,
  adminLang = 'fa',
  contentLang = 'fa',
}: PostBlockBuilderProps) {
  const isEn = adminLang === 'en';
  const contentDir = contentLang === 'en' ? 'ltr' : 'rtl';
  const palette = isEn ? BLOCK_PALETTE_EN : BLOCK_PALETTE_FA;
  const blockLabels = isEn ? BLOCK_LABELS_EN : BLOCK_LABELS_FA;

  const [previewMode, setPreviewMode] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const selectionMemory = useRef<Record<string, { start: number; end: number }>>({});

  const rememberSelection = (refKey: string, el: HTMLTextAreaElement) => {
    selectionMemory.current[refKey] = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  };

  const addBlock = (type: BlockType) => {
    setPreviewMode(false);
    onChange([...blocks, createEmptyBlock(type)]);
  };

  const updateBlock = (index: number, next: ContentBlock) => {
    const copy = [...blocks];
    copy[index] = next;
    onChange(copy);
  };

  const duplicateBlock = (index: number) => {
    const original = blocks[index];
    const cloned = {
      ...original,
      id: `blk_${Math.random().toString(36).slice(2, 10)}`,
    } as ContentBlock;
    const copy = [...blocks];
    copy.splice(index + 1, 0, cloned);
    onChange(copy);
  };

  const removeBlock = (index: number) => {
    onChange(blocks.filter((_, idx) => idx !== index));
  };

  const getSelectionRange = (refKey: string, currentValue: string) => {
    const el = textareaRefs.current[refKey];
    if (el && document.activeElement === el) {
      return {
        start: el.selectionStart ?? currentValue.length,
        end: el.selectionEnd ?? currentValue.length,
      };
    }
    const mem = selectionMemory.current[refKey];
    if (mem) {
      return {
        start: Math.min(mem.start, currentValue.length),
        end: Math.min(mem.end, currentValue.length),
      };
    }
    return { start: currentValue.length, end: currentValue.length };
  };

  const applyInlineWrap = (
    refKey: string,
    currentValue: string,
    onApply: (nextValue: string) => void,
    prefix: string,
    suffix: string,
    fallback: string,
  ) => {
    const el = textareaRefs.current[refKey];
    const { start, end } = getSelectionRange(refKey, currentValue);
    const selected = currentValue.slice(start, end) || fallback;
    const nextValue =
      currentValue.slice(0, start) + prefix + selected + suffix + currentValue.slice(end);
    onApply(nextValue);

    const nextStart = start + prefix.length;
    const nextEnd = nextStart + selected.length;
    selectionMemory.current[refKey] = { start: nextStart, end: nextEnd };

    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        try {
          el.setSelectionRange(nextStart, nextEnd);
        } catch {
          // ignore on unsupported inputs
        }
      }
    });
  };

  const applyInlineLink = (
    refKey: string,
    currentValue: string,
    onApply: (nextValue: string) => void,
    label: string,
    url: string,
  ) => {
    const el = textareaRefs.current[refKey];
    const { start, end } = getSelectionRange(refKey, currentValue);
    const inserted = `[${label}](${url})`;
    const nextValue = currentValue.slice(0, start) + inserted + currentValue.slice(end);
    onApply(nextValue);

    const cursorPos = start + inserted.length;
    selectionMemory.current[refKey] = { start: cursorPos, end: cursorPos };

    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        try {
          el.setSelectionRange(cursorPos, cursorPos);
        } catch {
          // ignore
        }
      }
    });
  };

  const handleMediaUpload = async (
    index: number,
    block: ContentBlock,
    file: File | undefined,
  ) => {
    if (!file) return;
    setUploadingId(block.id);
    try {
      const url = await onUploadFile(file);
      if (url && (block.type === 'image' || block.type === 'video' || block.type === 'audio')) {
        updateBlock(index, { ...block, url });
      }
    } finally {
      setUploadingId(null);
    }
  };

  const handleDropBlock = (targetIndex: number) => {
    if (dragIndex !== null && dragIndex !== targetIndex) {
      onChange(reorderArray(blocks, dragIndex, targetIndex));
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const inputBase =
    'rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-[var(--ink)]">
            {isEn ? `Content Blocks (${blocks.length})` : `بلوک‌های محتوا (${blocks.length})`}
          </span>
          <span className="ms-2 text-[11px] text-[var(--ink-faint)]">
            {isEn ? '(Drag the handle to reorder blocks)' : '(با کشیدن دستگیره می‌توانید ترتیب را تغییر دهید)'}
          </span>
        </div>
        <div className="inline-flex rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] p-1">
          <button
            type="button"
            onClick={() => setPreviewMode(false)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              !previewMode
                ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <PenLine className="h-3.5 w-3.5" />
            <span>{isEn ? 'Editor' : 'ویرایشگر'}</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode(true)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              previewMode
                ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{isEn ? 'Live Preview' : 'پیش‌نمایش زنده'}</span>
          </button>
        </div>
      </div>

      {previewMode ? (
        <div
          dir={contentDir}
          className="rounded-2xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] p-6"
        >
          <BlockRenderer blocks={blocks} lang={contentLang} />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {blocks.map((block, index) => {
              const isDropTarget =
                dragOverIndex === index && dragIndex !== null && dragIndex !== index;
              const videoParsed = block.type === 'video' ? parseVideoEmbed(block.url) : null;

              return (
                <div
                  key={block.id}
                  draggable
                  onDragStart={(e) => {
                    const tag = (e.target as HTMLElement)?.tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                      e.preventDefault();
                      return;
                    }
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(index));
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIndex !== index) setDragOverIndex(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropBlock(index);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`rounded-2xl border bg-[var(--ground)] p-4 transition-all ${
                    isDropTarget
                      ? 'border-[var(--flame)] ring-2 ring-[var(--flame-border)]'
                      : dragIndex === index
                        ? 'border-[var(--flame-border)] opacity-60'
                        : 'border-[var(--hair)]'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--hair)] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        title={isEn ? 'Drag to reorder' : 'بکشید برای جابه‌جایی'}
                        className="inline-flex cursor-grab items-center rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)] active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-bold text-[var(--flame)]">
                        {blockLabels[block.type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onChange(moveBlock(blocks, index, -1))}
                        disabled={index === 0}
                        aria-label={isEn ? 'Move block up' : 'انتقال بلوک به بالا'}
                        className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange(moveBlock(blocks, index, 1))}
                        disabled={index === blocks.length - 1}
                        aria-label={isEn ? 'Move block down' : 'انتقال بلوک به پایین'}
                        className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateBlock(index)}
                        aria-label={isEn ? 'Duplicate block' : 'تکرار بلوک'}
                        className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                      >
                        <CopyPlus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(index)}
                        aria-label={isEn ? 'Delete block' : 'حذف بلوک'}
                        className="rounded-lg p-1.5 text-[var(--status-error-ink)] hover:bg-red-500/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {(block.type === 'h2' || block.type === 'h3') && (
                    <input
                      type="text"
                      dir={contentDir}
                      value={block.text}
                      onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                      placeholder={
                        block.type === 'h2'
                          ? isEn
                            ? 'Main Heading...'
                            : 'تیتر اصلی...'
                          : isEn
                            ? 'Subheading...'
                            : 'تیتر فرعی...'
                      }
                      className={`w-full px-3.5 py-2.5 text-sm font-bold ${inputBase}`}
                    />
                  )}

                  {block.type === 'paragraph' && (
                    <div>
                      <InlineFormatBar
                        isEn={isEn}
                        getSelectedText={() => {
                          const { start, end } = getSelectionRange(`${block.id}_p`, block.text);
                          return block.text.slice(start, end);
                        }}
                        onWrap={(prefix, suffix, fallback) =>
                          applyInlineWrap(
                            `${block.id}_p`,
                            block.text,
                            (text) => updateBlock(index, { ...block, text }),
                            prefix,
                            suffix,
                            fallback,
                          )
                        }
                        onInsertLink={(label, url) =>
                          applyInlineLink(
                            `${block.id}_p`,
                            block.text,
                            (text) => updateBlock(index, { ...block, text }),
                            label,
                            url,
                          )
                        }
                      />
                      <textarea
                        ref={(el) => {
                          textareaRefs.current[`${block.id}_p`] = el;
                        }}
                        dir={contentDir}
                        rows={4}
                        value={block.text}
                        onSelect={(e) => rememberSelection(`${block.id}_p`, e.currentTarget)}
                        onKeyUp={(e) => rememberSelection(`${block.id}_p`, e.currentTarget)}
                        onMouseUp={(e) => rememberSelection(`${block.id}_p`, e.currentTarget)}
                        onChange={(e) => {
                          rememberSelection(`${block.id}_p`, e.currentTarget);
                          updateBlock(index, { ...block, text: e.target.value });
                        }}
                        placeholder={isEn ? 'Write paragraph text...' : 'متن پاراگراف...'}
                        className={`w-full px-3.5 py-2.5 text-sm leading-7 ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'card' && (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.title}
                          onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                          placeholder={isEn ? 'Card title' : 'عنوان کارت'}
                          className={`flex-1 px-3.5 py-2 text-sm font-semibold ${inputBase}`}
                        />
                        <select
                          value={block.accent || 'flame'}
                          onChange={(e) =>
                            updateBlock(index, {
                              ...block,
                              accent: e.target.value === 'neutral' ? 'neutral' : 'flame',
                            })
                          }
                          aria-label={isEn ? 'Card accent style' : 'رنگ کارت'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        >
                          <option value="flame">{isEn ? 'Highlighted (Accent)' : 'برجسته (رنگ اصلی)'}</option>
                          <option value="neutral">{isEn ? 'Neutral' : 'ساده'}</option>
                        </select>
                      </div>
                      <InlineFormatBar
                        isEn={isEn}
                        getSelectedText={() => {
                          const { start, end } = getSelectionRange(`${block.id}_card`, block.body);
                          return block.body.slice(start, end);
                        }}
                        onWrap={(prefix, suffix, fallback) =>
                          applyInlineWrap(
                            `${block.id}_card`,
                            block.body,
                            (body) => updateBlock(index, { ...block, body }),
                            prefix,
                            suffix,
                            fallback,
                          )
                        }
                        onInsertLink={(label, url) =>
                          applyInlineLink(
                            `${block.id}_card`,
                            block.body,
                            (body) => updateBlock(index, { ...block, body }),
                            label,
                            url,
                          )
                        }
                      />
                      <textarea
                        ref={(el) => {
                          textareaRefs.current[`${block.id}_card`] = el;
                        }}
                        dir={contentDir}
                        rows={3}
                        value={block.body}
                        onSelect={(e) => rememberSelection(`${block.id}_card`, e.currentTarget)}
                        onKeyUp={(e) => rememberSelection(`${block.id}_card`, e.currentTarget)}
                        onMouseUp={(e) => rememberSelection(`${block.id}_card`, e.currentTarget)}
                        onChange={(e) => {
                          rememberSelection(`${block.id}_card`, e.currentTarget);
                          updateBlock(index, { ...block, body: e.target.value });
                        }}
                        placeholder={isEn ? 'Card body text...' : 'متن کارت...'}
                        className={`w-full px-3.5 py-2 text-sm leading-7 ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'button' && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <input
                        type="text"
                        dir={contentDir}
                        value={block.label}
                        onChange={(e) => updateBlock(index, { ...block, label: e.target.value })}
                        placeholder={isEn ? 'Button label' : 'عنوان دکمه'}
                        className={`px-3.5 py-2 text-sm ${inputBase}`}
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={block.url}
                        onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                        placeholder={isEn ? 'https://... or /projects' : 'https://... یا /projects'}
                        className={`px-3.5 py-2 text-sm ${inputBase}`}
                      />
                      <select
                        value={block.variant || 'primary'}
                        onChange={(e) =>
                          updateBlock(index, {
                            ...block,
                            variant: e.target.value === 'secondary' ? 'secondary' : 'primary',
                          })
                        }
                        aria-label={isEn ? 'Button style' : 'استایل دکمه'}
                        className={`px-3 py-2 text-xs ${inputBase}`}
                      >
                        <option value="primary">{isEn ? 'Primary (Accent)' : 'اصلی (رنگ تاکید)'}</option>
                        <option value="secondary">{isEn ? 'Secondary (Subtle)' : 'ثانویه (ساده)'}</option>
                      </select>
                    </div>
                  )}

                  {block.type === 'embed' && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.title}
                          onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                          placeholder={isEn ? 'Link title' : 'عنوان لینک'}
                          className={`px-3.5 py-2 text-sm ${inputBase}`}
                        />
                        <input
                          type="text"
                          dir="ltr"
                          value={block.url}
                          onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                          placeholder="https://..."
                          className={`px-3.5 py-2 text-sm ${inputBase}`}
                        />
                      </div>
                      <input
                        type="text"
                        dir={contentDir}
                        value={block.description || ''}
                        onChange={(e) =>
                          updateBlock(index, { ...block, description: e.target.value })
                        }
                        placeholder={isEn ? 'Short description (optional)' : 'توضیح کوتاه (اختیاری)'}
                        className={`w-full px-3.5 py-2 text-xs ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'quote' && (
                    <div className="space-y-2.5">
                      <InlineFormatBar
                        isEn={isEn}
                        getSelectedText={() => {
                          const { start, end } = getSelectionRange(`${block.id}_q`, block.text);
                          return block.text.slice(start, end);
                        }}
                        onWrap={(prefix, suffix, fallback) =>
                          applyInlineWrap(
                            `${block.id}_q`,
                            block.text,
                            (text) => updateBlock(index, { ...block, text }),
                            prefix,
                            suffix,
                            fallback,
                          )
                        }
                        onInsertLink={(label, url) =>
                          applyInlineLink(
                            `${block.id}_q`,
                            block.text,
                            (text) => updateBlock(index, { ...block, text }),
                            label,
                            url,
                          )
                        }
                      />
                      <textarea
                        ref={(el) => {
                          textareaRefs.current[`${block.id}_q`] = el;
                        }}
                        dir={contentDir}
                        rows={2}
                        value={block.text}
                        onSelect={(e) => rememberSelection(`${block.id}_q`, e.currentTarget)}
                        onKeyUp={(e) => rememberSelection(`${block.id}_q`, e.currentTarget)}
                        onMouseUp={(e) => rememberSelection(`${block.id}_q`, e.currentTarget)}
                        onChange={(e) => {
                          rememberSelection(`${block.id}_q`, e.currentTarget);
                          updateBlock(index, { ...block, text: e.target.value });
                        }}
                        placeholder={isEn ? 'Quote text...' : 'متن نقل‌قول...'}
                        className={`w-full px-3.5 py-2 text-sm leading-7 ${inputBase}`}
                      />
                      <input
                        type="text"
                        dir={contentDir}
                        value={block.author || ''}
                        onChange={(e) => updateBlock(index, { ...block, author: e.target.value })}
                        placeholder={isEn ? 'Source / Author (optional)' : 'منبع / گوینده (اختیاری)'}
                        className={`w-full px-3.5 py-2 text-xs ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'code' && (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        dir="ltr"
                        value={block.language}
                        onChange={(e) => updateBlock(index, { ...block, language: e.target.value })}
                        placeholder="bash / ts / python"
                        className={`w-40 px-3 py-1.5 font-mono text-xs ${inputBase}`}
                      />
                      <textarea
                        rows={5}
                        dir="ltr"
                        value={block.code}
                        onChange={(e) => updateBlock(index, { ...block, code: e.target.value })}
                        placeholder="// code..."
                        className={`w-full px-3.5 py-2.5 font-mono text-xs leading-6 ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'list' && (
                    <div className="space-y-2.5">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-muted)]">
                        <input
                          type="checkbox"
                          checked={block.ordered}
                          onChange={(e) =>
                            updateBlock(index, { ...block, ordered: e.target.checked })
                          }
                          className="accent-[var(--flame)]"
                        />
                        <span>{isEn ? 'Numbered list' : 'فهرست شماره‌دار'}</span>
                      </label>
                      <textarea
                        dir={contentDir}
                        rows={4}
                        value={block.items.join('\n')}
                        onChange={(e) =>
                          updateBlock(index, { ...block, items: e.target.value.split('\n') })
                        }
                        placeholder={isEn ? 'One item per line...' : 'هر خط یک مورد...'}
                        className={`w-full px-3.5 py-2 text-sm leading-7 ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'image' && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] text-[var(--ink-faint)]">
                        {isEn
                          ? 'Upload directly from device (auto-optimized to WebP) or paste an external URL:'
                          : 'می‌توانی تصویر را مستقیم از دستگاه آپلود کنی (تبدیل خودکار به WebP) یا لینک خارجی بدهی:'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={block.url}
                          onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                          placeholder="https://res.cloudinary.com/... or https://..."
                          className={`min-w-0 flex-1 px-3.5 py-2 text-xs ${inputBase}`}
                        />
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-xs font-medium text-[var(--ink)] hover:opacity-90">
                          <Upload className="h-3.5 w-3.5 text-[var(--flame)]" />
                          <span>
                            {uploadingId === block.id
                              ? isEn
                                ? 'Uploading...'
                                : 'در حال آپلود...'
                              : isEn
                                ? 'Upload File'
                                : 'آپلود از دستگاه'}
                          </span>
                          <input
                            type="file"
                            accept="image/*,.webp,.png,.jpg,.jpeg,.gif"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.currentTarget.value = '';
                              void handleMediaUpload(index, block, file);
                            }}
                          />
                        </label>
                      </div>
                      {block.url.trim() && (
                        <div className="overflow-hidden rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] p-2">
                          <img
                            src={sanitizeMediaUrl(block.url)}
                            alt={block.alt || 'Preview'}
                            className="max-h-44 w-full rounded-lg object-contain"
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.alt || ''}
                          onChange={(e) => updateBlock(index, { ...block, alt: e.target.value })}
                          placeholder={isEn ? 'Alt text' : 'متن جایگزین (Alt)'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        />
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.caption || ''}
                          onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                          placeholder={isEn ? 'Caption (optional)' : 'زیرنویس (اختیاری)'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        />
                      </div>
                    </div>
                  )}

                  {block.type === 'video' && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] text-[var(--ink-faint)]">
                        {isEn
                          ? 'Supports direct Cloudinary uploads (MP4/WebM/MOV) plus YouTube & Aparat links:'
                          : 'پشتیبانی از آپلود مستقیم روی Cloudinary (MP4/WebM/MOV) و لینک مستقیم یوتیوب و آپارات:'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={block.url}
                          onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                          placeholder="https://youtube.com/watch?v=... or aparat.com/v/... or https://..."
                          className={`min-w-0 flex-1 px-3.5 py-2 text-xs ${inputBase}`}
                        />
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-xs font-medium text-[var(--ink)] hover:opacity-90">
                          <Upload className="h-3.5 w-3.5 text-[var(--flame)]" />
                          <span>
                            {uploadingId === block.id
                              ? isEn
                                ? 'Uploading...'
                                : 'در حال آپلود...'
                              : isEn
                                ? 'Upload File'
                                : 'آپلود از دستگاه'}
                          </span>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.currentTarget.value = '';
                              void handleMediaUpload(index, block, file);
                            }}
                          />
                        </label>
                      </div>
                      {videoParsed && videoParsed.kind !== 'invalid' && (
                        <div className="rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] p-2.5">
                          <div className="mb-2 flex items-center justify-between text-[11px]">
                            <span className="font-medium text-[var(--flame)]">
                              {videoParsed.kind === 'youtube'
                                ? isEn
                                  ? 'Detected: YouTube embed'
                                  : 'شناسایی شد: ویدیوی یوتیوب (پخش تعبیه‌شده)'
                                : videoParsed.kind === 'aparat'
                                  ? isEn
                                    ? 'Detected: Aparat embed'
                                    : 'شناسایی شد: ویدیوی آپارات (پخش تعبیه‌شده)'
                                  : isEn
                                    ? 'Direct / Local video'
                                    : 'ویدیوی مستقیم / محلی'}
                            </span>
                          </div>
                          {videoParsed.kind === 'direct' ? (
                            <video
                              src={videoParsed.url}
                              controls
                              preload="metadata"
                              className="max-h-48 w-full rounded-lg bg-black"
                            />
                          ) : (
                            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                              <iframe
                                src={videoParsed.embedUrl}
                                title="Video preview"
                                loading="lazy"
                                className="absolute inset-0 h-full w-full border-0"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      <input
                        type="text"
                        dir={contentDir}
                        value={block.caption || ''}
                        onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                        placeholder={isEn ? 'Video caption (optional)' : 'زیرنویس ویدیو (اختیاری)'}
                        className={`w-full px-3 py-2 text-xs ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'audio' && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] text-[var(--ink-faint)]">
                        {isEn
                          ? 'Supports direct Cloudinary uploads (MP3, WAV, OGG, M4A) or direct audio links:'
                          : 'پشتیبانی از آپلود مستقیم روی Cloudinary (MP3, WAV, OGG, M4A) یا لینک مستقیم فایل صوتی:'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={block.url}
                          onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                          placeholder="https://res.cloudinary.com/... or https://..."
                          className={`min-w-0 flex-1 px-3.5 py-2 text-xs ${inputBase}`}
                        />
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-xs font-medium text-[var(--ink)] hover:opacity-90">
                          <Upload className="h-3.5 w-3.5 text-[var(--flame)]" />
                          <span>
                            {uploadingId === block.id
                              ? isEn
                                ? 'Uploading...'
                                : 'در حال آپلود...'
                              : isEn
                                ? 'Upload File'
                                : 'آپلود از دستگاه'}
                          </span>
                          <input
                            type="file"
                            accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.ogg,.m4a,.aac"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.currentTarget.value = '';
                              void handleMediaUpload(index, block, file);
                            }}
                          />
                        </label>
                      </div>
                      {block.url.trim() && (
                        <div className="rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] p-2.5">
                          <audio
                            src={sanitizeMediaUrl(block.url)}
                            controls
                            preload="metadata"
                            className="w-full"
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.title || ''}
                          onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                          placeholder={isEn ? 'Audio title' : 'عنوان فایل صوتی'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        />
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.caption || ''}
                          onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                          placeholder={isEn ? 'Caption (optional)' : 'توضیح (اختیاری)'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-3">
            <p className="mb-2.5 text-[11px] font-medium text-[var(--ink-faint)]">
              {isEn ? 'Add a new block:' : 'افزودن بلوک جدید:'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {palette.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addBlock(type)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-3 py-2 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--flame)] hover:text-[var(--ink)]"
                >
                  <Icon className="h-3.5 w-3.5 text-[var(--flame)]" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
