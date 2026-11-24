import {
  ArrowDown,
  ArrowUp,
  Bold,
  Code,
  Code2,
  CornerDownRight,
  ExternalLink,
  Eye,
  GripVertical,
  Heading2,
  Heading3,
  Headphones,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  MousePointerClick,
  PenLine,
  Quote,
  SquareCode,
  Trash2,
  Type,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  createEmptyBlock,
  parseVideoEmbed,
  reorderArray,
  sanitizeMediaUrl,
} from '../../lib/blocks.ts';
import {
  detectActiveFormats,
  exitInlineFormat,
  insertInlineLink,
  toggleInlineFormat,
  type ActiveInlineFormats,
  type InlineFormatKind,
} from '../../lib/inlineFormat.ts';
import type { BlockType, ContentBlock, SiteLanguage } from '../../types/cms.ts';
import { BlockRenderer } from '../BlockRenderer.tsx';

interface PostBlockBuilderProps {
  blocks: ContentBlock[];
  onChange: (next: ContentBlock[]) => void;
  onUploadFile: (file: File) => Promise<string | null>;
  adminLang?: SiteLanguage;
  contentLang?: SiteLanguage;
}

function getBlockPalette(isUiEn: boolean): Array<{
  type: BlockType;
  label: string;
  icon: typeof Type;
}> {
  return [
    { type: 'paragraph', label: isUiEn ? 'Paragraph' : 'پاراگراف', icon: Type },
    { type: 'h2', label: isUiEn ? 'Heading H2' : 'تیتر اصلی', icon: Heading2 },
    { type: 'h3', label: isUiEn ? 'Heading H3' : 'زیرتیتر', icon: Heading3 },
    { type: 'card', label: isUiEn ? 'Info Card' : 'کارت توضیح', icon: SquareCode },
    { type: 'button', label: isUiEn ? 'CTA Button' : 'دکمه لینک', icon: MousePointerClick },
    { type: 'embed', label: isUiEn ? 'Link Card' : 'کارت لینک', icon: ExternalLink },
    { type: 'quote', label: isUiEn ? 'Quote' : 'نقل‌قول', icon: Quote },
    { type: 'list', label: isUiEn ? 'List' : 'فهرست', icon: List },
    { type: 'code', label: isUiEn ? 'Code' : 'کد', icon: Code2 },
    { type: 'image', label: isUiEn ? 'Image' : 'تصویر', icon: ImageIcon },
    { type: 'video', label: isUiEn ? 'Video' : 'ویدیو', icon: Video },
    { type: 'audio', label: isUiEn ? 'Audio' : 'صوت', icon: Headphones },
  ];
}

function getBlockLabel(type: BlockType, isUiEn: boolean): string {
  return getBlockPalette(isUiEn).find((p) => p.type === type)?.label || type;
}

const EMPTY_ACTIVE_FORMATS: ActiveInlineFormats = {
  bold: false,
  italic: false,
  highlight: false,
  code: false,
  any: false,
};

interface InlineFormatToolbarProps {
  onToggleFormat: (kind: InlineFormatKind) => void;
  onExitFormat: () => void;
  onInsertLink: (label: string, url: string) => void;
  getSelectedText: () => string;
  activeFormats: ActiveInlineFormats;
  isUiEn: boolean;
  isContentEn: boolean;
}

function InlineFormatToolbar({
  onToggleFormat,
  onExitFormat,
  onInsertLink,
  getSelectedText,
  activeFormats,
  isUiEn,
  isContentEn,
}: InlineFormatToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkErr, setLinkErr] = useState('');

  const openLinkPopover = () => {
    const selected = getSelectedText().trim();
    setLinkLabel(selected);
    setLinkUrl('https://');
    setLinkErr('');
    setLinkOpen(true);
  };

  const handleConfirmLink = () => {
    const cleanedUrl = sanitizeMediaUrl(linkUrl);
    if (
      !cleanedUrl ||
      cleanedUrl === 'https://' ||
      (!cleanedUrl.startsWith('http://') &&
        !cleanedUrl.startsWith('https://') &&
        !cleanedUrl.startsWith('/') &&
        !cleanedUrl.startsWith('mailto:'))
    ) {
      setLinkErr(
        isUiEn
          ? 'Please enter a valid URL (e.g. https://example.com or /projects).'
          : 'نشانی لینک معتبر نیست (مثلاً https://example.com یا /projects).',
      );
      return;
    }
    const finalLabel = linkLabel.trim() || cleanedUrl.replace(/^https?:\/\//, '');
    onInsertLink(finalLabel, cleanedUrl);
    setLinkOpen(false);
    setLinkErr('');
  };

  const btnCls = (active: boolean) =>
    `inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
      active
        ? 'border-[var(--flame)] bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
        : 'border-transparent text-[var(--ink-muted)] hover:border-[var(--hair-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] px-2 py-1.5">
        <span className="px-1.5 text-[10px] text-[var(--ink-faint)]">
          {isUiEn ? 'Style:' : 'قالب متن:'}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onToggleFormat('bold')}
          title={
            activeFormats.bold
              ? isUiEn
                ? 'Exit / Remove Bold (Ctrl+B)'
                : 'خروج یا حذف بولد (Ctrl+B)'
              : isUiEn
                ? 'Bold (Ctrl+B)'
                : 'بولد (Ctrl+B)'
          }
          aria-pressed={activeFormats.bold}
          className={btnCls(activeFormats.bold)}
        >
          <Bold className="h-3.5 w-3.5" />
          <span>{isUiEn ? 'Bold' : 'بولد'}</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onToggleFormat('italic')}
          title={
            activeFormats.italic
              ? isUiEn
                ? 'Exit / Remove Italic (Ctrl+I)'
                : 'خروج یا حذف کج (Ctrl+I)'
              : isUiEn
                ? 'Italic (Ctrl+I)'
                : 'کج (Ctrl+I)'
          }
          aria-pressed={activeFormats.italic}
          className={btnCls(activeFormats.italic)}
        >
          <Italic className="h-3.5 w-3.5" />
          <span>{isUiEn ? 'Italic' : 'کج'}</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onToggleFormat('highlight')}
          title={
            activeFormats.highlight
              ? isUiEn
                ? 'Exit / Remove Highlight (Ctrl+Shift+H)'
                : 'خروج یا حذف هایلایت (Ctrl+Shift+H)'
              : isUiEn
                ? 'Highlight (Ctrl+Shift+H)'
                : 'هایلایت (Ctrl+Shift+H)'
          }
          aria-pressed={activeFormats.highlight}
          className={btnCls(activeFormats.highlight)}
        >
          <Highlighter className="h-3.5 w-3.5" />
          <span>{isUiEn ? 'Highlight' : 'هایلایت'}</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onToggleFormat('code')}
          title={
            activeFormats.code
              ? isUiEn
                ? 'Exit / Remove Inline Code (Ctrl+E)'
                : 'خروج یا حذف کد (Ctrl+E)'
              : isUiEn
                ? 'Inline Code (Ctrl+E)'
                : 'کد درون‌خطی (Ctrl+E)'
          }
          aria-pressed={activeFormats.code}
          className={btnCls(activeFormats.code)}
        >
          <Code className="h-3.5 w-3.5" />
          <span>{isUiEn ? 'Code' : 'کد'}</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLinkPopover}
          title={isUiEn ? 'Insert inline link' : 'افزودن لینک روی متن'}
          className={btnCls(linkOpen)}
        >
          <Link2 className="h-3.5 w-3.5" />
          <span>{isUiEn ? 'Link' : 'لینک'}</span>
        </button>

        {activeFormats.any && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onExitFormat}
            title={
              isUiEn
                ? 'Jump cursor outside formatting (Esc)'
                : 'خروج مکان‌نما از حالت استایل و ادامه متن عادی (Esc)'
            }
            className="ms-auto inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--flame-border)] bg-[var(--flame-tint)] px-2 py-1 text-[11px] font-medium text-[var(--flame)] hover:opacity-90"
          >
            <CornerDownRight className="h-3 w-3" />
            <span>{isUiEn ? 'Exit style (Esc)' : 'خروج از استایل (Esc)'}</span>
          </button>
        )}
      </div>

      {linkOpen && (
        <div className="rounded-xl border border-[var(--flame-border)] bg-[var(--ground-deep)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--flame)]">
              {isUiEn ? 'Insert Inline Link' : 'افزودن لینک درون‌متنی'}
            </span>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              aria-label={isUiEn ? 'Close' : 'بستن'}
              className="cursor-pointer rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              dir={isContentEn ? 'ltr' : 'rtl'}
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder={isUiEn ? 'Link display text' : 'متن نمایشی لینک'}
              className="rounded-lg border border-[var(--hair-strong)] bg-[var(--ground)] px-2.5 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
            />
            <input
              type="text"
              dir="ltr"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                if (linkErr) setLinkErr('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmLink();
                }
              }}
              placeholder="https://example.com or /projects"
              className="rounded-lg border border-[var(--hair-strong)] bg-[var(--ground)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
            />
          </div>
          {linkErr && <p className="mt-1.5 text-[11px] text-[var(--status-error-ink)]">{linkErr}</p>}
          <div className="mt-2.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="cursor-pointer rounded-lg border border-[var(--hair-strong)] px-2.5 py-1 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              {isUiEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="button"
              onClick={handleConfirmLink}
              className="ember-btn-flame cursor-pointer rounded-lg px-3 py-1 text-[11px]"
            >
              {isUiEn ? 'Insert Link' : 'درج لینک'}
            </button>
          </div>
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
  const isUiEn = adminLang === 'en';
  const isContentEn = contentLang === 'en';
  const contentDir = isContentEn ? 'ltr' : 'rtl';
  const palette = getBlockPalette(isUiEn);

  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dragReadyIndex, setDragReadyIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [activeSelection, setActiveSelection] = useState<{
    key: string;
    start: number;
    end: number;
  } | null>(null);

  const fieldRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});

  // Reset dragReadyIndex whenever the user releases the mouse anywhere so text selection is never blocked
  useEffect(() => {
    if (dragReadyIndex === null) return;
    const clearReady = () => setDragReadyIndex(null);
    window.addEventListener('pointerup', clearReady);
    window.addEventListener('mouseup', clearReady);
    return () => {
      window.removeEventListener('pointerup', clearReady);
      window.removeEventListener('mouseup', clearReady);
    };
  }, [dragReadyIndex]);

  const registerFieldRef =
    (key: string) => (el: HTMLTextAreaElement | HTMLInputElement | null) => {
      fieldRefs.current[key] = el;
    };

  const syncSelection = (key: string, el: HTMLTextAreaElement | HTMLInputElement | null) => {
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setActiveSelection({ key, start, end });
  };

  const getActiveFormatsForField = (key: string, currentValue: string): ActiveInlineFormats => {
    if (!activeSelection || activeSelection.key !== key) return EMPTY_ACTIVE_FORMATS;
    return detectActiveFormats(currentValue, activeSelection.start, activeSelection.end);
  };

  const updateBlock = (index: number, nextBlock: ContentBlock) => {
    const copy = [...blocks];
    copy[index] = nextBlock;
    onChange(copy);
  };

  const addBlock = (type: BlockType) => {
    onChange([...blocks, createEmptyBlock(type)]);
  };

  const removeBlock = (index: number) => {
    const next = blocks.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [createEmptyBlock('paragraph')]);
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    onChange(reorderArray(blocks, index, target));
  };

  const restoreFocusAndSelection = (
    el: HTMLTextAreaElement | HTMLInputElement | null,
    key: string,
    start: number,
    end: number,
  ) => {
    setActiveSelection({ key, start, end });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(start, end);
      } catch {
        // ignore selection range errors on unsupported inputs
      }
    });
  };

  const applyInlineFormat = (
    fieldKey: string,
    currentValue: string,
    onUpdateValue: (val: string) => void,
    kind: InlineFormatKind,
  ) => {
    const el = fieldRefs.current[fieldKey];
    const start = el?.selectionStart ?? activeSelection?.start ?? currentValue.length;
    const end = el?.selectionEnd ?? activeSelection?.end ?? start;

    const result = toggleInlineFormat(currentValue, start, end, kind, contentLang);
    if (result.value !== currentValue) {
      onUpdateValue(result.value);
    }
    restoreFocusAndSelection(el, fieldKey, result.selectionStart, result.selectionEnd);
  };

  const applyExitFormat = (fieldKey: string, currentValue: string) => {
    const el = fieldRefs.current[fieldKey];
    const cursor = el?.selectionEnd ?? activeSelection?.end ?? currentValue.length;
    const res = exitInlineFormat(currentValue, cursor);
    if (res.exited) {
      restoreFocusAndSelection(el, fieldKey, res.cursor, res.cursor);
    } else if (el) {
      el.focus();
    }
  };

  const applyInlineLink = (
    fieldKey: string,
    currentValue: string,
    onUpdateValue: (val: string) => void,
    label: string,
    url: string,
  ) => {
    const el = fieldRefs.current[fieldKey];
    const start = el?.selectionStart ?? activeSelection?.start ?? currentValue.length;
    const end = el?.selectionEnd ?? activeSelection?.end ?? start;
    const result = insertInlineLink(currentValue, start, end, label, url);
    onUpdateValue(result.value);
    restoreFocusAndSelection(el, fieldKey, result.cursor, result.cursor);
  };

  const getFieldSelectedText = (fieldKey: string, currentValue: string): string => {
    const el = fieldRefs.current[fieldKey];
    if (!el) return '';
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    return currentValue.slice(start, end);
  };

  const handleFormattedKeyDown = (
    e: ReactKeyboardEvent<HTMLTextAreaElement>,
    fieldKey: string,
    currentValue: string,
    onUpdateValue: (val: string) => void,
  ) => {
    const mod = e.ctrlKey || e.metaKey;
    const lowerKey = e.key.toLowerCase();

    if (mod && !e.shiftKey && lowerKey === 'b') {
      e.preventDefault();
      applyInlineFormat(fieldKey, currentValue, onUpdateValue, 'bold');
      return;
    }
    if (mod && !e.shiftKey && lowerKey === 'i') {
      e.preventDefault();
      applyInlineFormat(fieldKey, currentValue, onUpdateValue, 'italic');
      return;
    }
    if (mod && e.shiftKey && lowerKey === 'h') {
      e.preventDefault();
      applyInlineFormat(fieldKey, currentValue, onUpdateValue, 'highlight');
      return;
    }
    if (mod && !e.shiftKey && lowerKey === 'e') {
      e.preventDefault();
      applyInlineFormat(fieldKey, currentValue, onUpdateValue, 'code');
      return;
    }
    if (e.key === 'Escape') {
      const el = e.currentTarget;
      const cursor = el.selectionEnd ?? currentValue.length;
      const res = exitInlineFormat(currentValue, cursor);
      if (res.exited) {
        e.preventDefault();
        restoreFocusAndSelection(el, fieldKey, res.cursor, res.cursor);
      }
    }
  };

  const handleMediaUpload = async (
    index: number,
    block: Extract<ContentBlock, { type: 'image' | 'video' | 'audio' }>,
    file?: File | null,
  ) => {
    if (!file) return;
    setUploadingId(block.id);
    try {
      const url = await onUploadFile(file);
      if (url) {
        updateBlock(index, { ...block, url });
      }
    } finally {
      setUploadingId(null);
    }
  };

  const inputBase =
    'rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none select-text';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-[var(--ink-muted)]">
            {isUiEn
              ? `Content Blocks (${blocks.length}) — Drag the grip icon to reorder`
              : `بلوک‌های محتوا (${blocks.length}) — برای جابه‌جایی دستگیره کنار هر بلوک را بکش`}
          </span>
        </div>

        <div className="inline-flex rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] p-1">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'edit'
                ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <PenLine className="h-3.5 w-3.5" />
            <span>{isUiEn ? 'Edit' : 'ویرایش'}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'preview'
                ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{isUiEn ? 'Live Preview' : 'پیش‌نمایش زنده'}</span>
          </button>
        </div>
      </div>

      {mode === 'preview' ? (
        <div
          dir={contentDir}
          className="min-h-48 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-5 sm:p-7"
        >
          <BlockRenderer blocks={blocks} lang={contentLang} />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {blocks.map((block, index) => {
              const isDropTarget =
                dragOverIndex === index && dragIndex !== null && dragIndex !== index;
              const isDragging = dragIndex === index;
              const videoParsed =
                block.type === 'video' && block.url.trim() ? parseVideoEmbed(block.url) : null;

              const paraKey = `${block.id}:paragraph`;
              const cardKey = `${block.id}:card`;
              const quoteKey = `${block.id}:quote`;
              const listKey = `${block.id}:list`;

              return (
                <div
                  key={block.id}
                  draggable={dragReadyIndex === index}
                  onDragStart={(e) => {
                    if (dragReadyIndex !== index) {
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
                  onDragLeave={() => {
                    if (dragOverIndex === index) setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== index) {
                      onChange(reorderArray(blocks, dragIndex, index));
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                    setDragReadyIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                    setDragReadyIndex(null);
                  }}
                  className={`rounded-2xl border bg-[var(--ground)] p-4 transition-all ${
                    isDropTarget
                      ? 'border-[var(--flame)] ring-2 ring-[var(--flame-border)]'
                      : isDragging
                        ? 'border-[var(--flame-border)] opacity-55'
                        : 'border-[var(--hair)]'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={() => setDragReadyIndex(index)}
                        onMouseDown={() => setDragReadyIndex(index)}
                        onPointerUp={() => setDragReadyIndex(null)}
                        onMouseUp={() => setDragReadyIndex(null)}
                        title={isUiEn ? 'Drag to reorder' : 'بکش و جابه‌جا کن'}
                        aria-label={isUiEn ? `Drag block ${index + 1}` : `جابه‌جایی بلوک ${index + 1}`}
                        className="inline-flex cursor-grab rounded-lg p-1 text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)] active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <span className="rounded-lg border border-[var(--flame-border)] bg-[var(--flame-tint)] px-2 py-0.5 text-[11px] font-bold text-[var(--flame)]">
                        {getBlockLabel(block.type, isUiEn)}
                      </span>
                      <span className="text-[11px] text-[var(--ink-faint)] tabular-nums">
                        #{index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveBlock(index, -1)}
                        disabled={index === 0}
                        aria-label={isUiEn ? 'Move block up' : 'انتقال به بالا'}
                        className="cursor-pointer rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(index, 1)}
                        disabled={index === blocks.length - 1}
                        aria-label={isUiEn ? 'Move block down' : 'انتقال به پایین'}
                        className="cursor-pointer rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(index)}
                        aria-label={isUiEn ? 'Delete block' : 'حذف بلوک'}
                        className="cursor-pointer rounded-lg p-1.5 text-[var(--status-error-ink)] hover:bg-red-500/15"
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
                          ? isUiEn
                            ? 'Main section heading (H2)'
                            : 'عنوان بخش اصلی (H2)'
                          : isUiEn
                            ? 'Subheading (H3)'
                            : 'زیرتیتر (H3)'
                      }
                      className={`w-full px-3.5 py-2.5 text-sm font-bold ${inputBase}`}
                    />
                  )}

                  {block.type === 'paragraph' && (
                    <div className="space-y-2">
                      <InlineFormatToolbar
                        isUiEn={isUiEn}
                        isContentEn={isContentEn}
                        activeFormats={getActiveFormatsForField(paraKey, block.text)}
                        onToggleFormat={(kind) =>
                          applyInlineFormat(
                            paraKey,
                            block.text,
                            (val) => updateBlock(index, { ...block, text: val }),
                            kind,
                          )
                        }
                        onExitFormat={() => applyExitFormat(paraKey, block.text)}
                        onInsertLink={(label, url) =>
                          applyInlineLink(
                            paraKey,
                            block.text,
                            (val) => updateBlock(index, { ...block, text: val }),
                            label,
                            url,
                          )
                        }
                        getSelectedText={() => getFieldSelectedText(paraKey, block.text)}
                      />
                      <textarea
                        ref={registerFieldRef(paraKey)}
                        rows={4}
                        dir={contentDir}
                        value={block.text}
                        onFocus={(e) => syncSelection(paraKey, e.currentTarget)}
                        onSelect={(e) => syncSelection(paraKey, e.currentTarget)}
                        onKeyUp={(e) => syncSelection(paraKey, e.currentTarget)}
                        onMouseUp={(e) => syncSelection(paraKey, e.currentTarget)}
                        onKeyDown={(e) =>
                          handleFormattedKeyDown(e, paraKey, block.text, (val) =>
                            updateBlock(index, { ...block, text: val }),
                          )
                        }
                        onChange={(e) => {
                          updateBlock(index, { ...block, text: e.target.value });
                          syncSelection(paraKey, e.currentTarget);
                        }}
                        placeholder={
                          isUiEn ? 'Write paragraph text' : 'متن پاراگراف...'
                        }
                        className={`w-full px-3.5 py-2.5 text-sm leading-7 ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'card' && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.title}
                          onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                          placeholder={isUiEn ? 'Card title' : 'عنوان کارت'}
                          className={`px-3.5 py-2 text-sm font-semibold sm:col-span-2 ${inputBase}`}
                        />
                        <select
                          value={block.accent || 'flame'}
                          onChange={(e) =>
                            updateBlock(index, {
                              ...block,
                              accent: e.target.value === 'neutral' ? 'neutral' : 'flame',
                            })
                          }
                          aria-label={isUiEn ? 'Card color' : 'رنگ کارت'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        >
                          <option value="flame">
                            {isUiEn ? 'Accent Card (Highlight)' : 'کارت نارنجی (تاکید)'}
                          </option>
                          <option value="neutral">
                            {isUiEn ? 'Neutral Card (Subtle)' : 'کارت خنثی (ساده)'}
                          </option>
                        </select>
                      </div>
                      <InlineFormatToolbar
                        isUiEn={isUiEn}
                        isContentEn={isContentEn}
                        activeFormats={getActiveFormatsForField(cardKey, block.body)}
                        onToggleFormat={(kind) =>
                          applyInlineFormat(
                            cardKey,
                            block.body,
                            (val) => updateBlock(index, { ...block, body: val }),
                            kind,
                          )
                        }
                        onExitFormat={() => applyExitFormat(cardKey, block.body)}
                        onInsertLink={(label, url) =>
                          applyInlineLink(
                            cardKey,
                            block.body,
                            (val) => updateBlock(index, { ...block, body: val }),
                            label,
                            url,
                          )
                        }
                        getSelectedText={() => getFieldSelectedText(cardKey, block.body)}
                      />
                      <textarea
                        ref={registerFieldRef(cardKey)}
                        rows={3}
                        dir={contentDir}
                        value={block.body}
                        onFocus={(e) => syncSelection(cardKey, e.currentTarget)}
                        onSelect={(e) => syncSelection(cardKey, e.currentTarget)}
                        onKeyUp={(e) => syncSelection(cardKey, e.currentTarget)}
                        onMouseUp={(e) => syncSelection(cardKey, e.currentTarget)}
                        onKeyDown={(e) =>
                          handleFormattedKeyDown(e, cardKey, block.body, (val) =>
                            updateBlock(index, { ...block, body: val }),
                          )
                        }
                        onChange={(e) => {
                          updateBlock(index, { ...block, body: e.target.value });
                          syncSelection(cardKey, e.currentTarget);
                        }}
                        placeholder={isUiEn ? 'Card body text' : 'متن کارت...'}
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
                        placeholder={isUiEn ? 'Button label' : 'عنوان دکمه'}
                        className={`px-3.5 py-2 text-xs ${inputBase}`}
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={block.url}
                        onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                        placeholder="https://... or /projects"
                        className={`px-3.5 py-2 text-xs ${inputBase}`}
                      />
                      <select
                        value={block.variant || 'primary'}
                        onChange={(e) =>
                          updateBlock(index, {
                            ...block,
                            variant: e.target.value === 'secondary' ? 'secondary' : 'primary',
                          })
                        }
                        aria-label={isUiEn ? 'Button style' : 'استایل دکمه'}
                        className={`px-3 py-2 text-xs ${inputBase}`}
                      >
                        <option value="primary">
                          {isUiEn ? 'Primary (Accent)' : 'دکمه اصلی (نارنجی)'}
                        </option>
                        <option value="secondary">
                          {isUiEn ? 'Secondary (Outline)' : 'دکمه ثانویه (ساده)'}
                        </option>
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
                          placeholder={isUiEn ? 'Link title' : 'عنوان لینک'}
                          className={`px-3.5 py-2 text-xs ${inputBase}`}
                        />
                        <input
                          type="text"
                          dir="ltr"
                          value={block.url}
                          onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                          placeholder="https://..."
                          className={`px-3.5 py-2 text-xs ${inputBase}`}
                        />
                      </div>
                      <input
                        type="text"
                        dir={contentDir}
                        value={block.description || ''}
                        onChange={(e) =>
                          updateBlock(index, { ...block, description: e.target.value })
                        }
                        placeholder={
                          isUiEn ? 'Short description (optional)' : 'توضیح کوتاه (اختیاری)'
                        }
                        className={`w-full px-3.5 py-2 text-xs ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'quote' && (
                    <div className="space-y-2">
                      <InlineFormatToolbar
                        isUiEn={isUiEn}
                        isContentEn={isContentEn}
                        activeFormats={getActiveFormatsForField(quoteKey, block.text)}
                        onToggleFormat={(kind) =>
                          applyInlineFormat(
                            quoteKey,
                            block.text,
                            (val) => updateBlock(index, { ...block, text: val }),
                            kind,
                          )
                        }
                        onExitFormat={() => applyExitFormat(quoteKey, block.text)}
                        onInsertLink={(label, url) =>
                          applyInlineLink(
                            quoteKey,
                            block.text,
                            (val) => updateBlock(index, { ...block, text: val }),
                            label,
                            url,
                          )
                        }
                        getSelectedText={() => getFieldSelectedText(quoteKey, block.text)}
                      />
                      <textarea
                        ref={registerFieldRef(quoteKey)}
                        rows={2}
                        dir={contentDir}
                        value={block.text}
                        onFocus={(e) => syncSelection(quoteKey, e.currentTarget)}
                        onSelect={(e) => syncSelection(quoteKey, e.currentTarget)}
                        onKeyUp={(e) => syncSelection(quoteKey, e.currentTarget)}
                        onMouseUp={(e) => syncSelection(quoteKey, e.currentTarget)}
                        onKeyDown={(e) =>
                          handleFormattedKeyDown(e, quoteKey, block.text, (val) =>
                            updateBlock(index, { ...block, text: val }),
                          )
                        }
                        onChange={(e) => {
                          updateBlock(index, { ...block, text: e.target.value });
                          syncSelection(quoteKey, e.currentTarget);
                        }}
                        placeholder={isUiEn ? 'Quote text' : 'متن نقل‌قول...'}
                        className={`w-full px-3.5 py-2 text-sm leading-7 ${inputBase}`}
                      />
                      <input
                        type="text"
                        dir={contentDir}
                        value={block.author || ''}
                        onChange={(e) => updateBlock(index, { ...block, author: e.target.value })}
                        placeholder={
                          isUiEn ? 'Source / Author (optional)' : 'منبع / گوینده (اختیاری)'
                        }
                        className={`w-full px-3.5 py-2 text-xs ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'code' && (
                    <div className="space-y-2.5" dir="ltr">
                      <input
                        type="text"
                        value={block.language}
                        onChange={(e) =>
                          updateBlock(index, { ...block, language: e.target.value })
                        }
                        placeholder="bash / ts / python"
                        className={`w-48 px-3 py-1.5 font-mono text-xs ${inputBase}`}
                      />
                      <textarea
                        rows={5}
                        value={block.code}
                        onChange={(e) => updateBlock(index, { ...block, code: e.target.value })}
                        placeholder="// code..."
                        className={`w-full px-3.5 py-2.5 font-mono text-xs leading-6 ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'list' && (
                    <div className="space-y-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-muted)]">
                        <input
                          type="checkbox"
                          checked={block.ordered}
                          onChange={(e) =>
                            updateBlock(index, { ...block, ordered: e.target.checked })
                          }
                          className="accent-[var(--flame)]"
                        />
                        <span>{isUiEn ? 'Numbered list (1, 2, 3...)' : 'فهرست شماره‌دار'}</span>
                      </label>
                      <InlineFormatToolbar
                        isUiEn={isUiEn}
                        isContentEn={isContentEn}
                        activeFormats={getActiveFormatsForField(listKey, block.items.join('\n'))}
                        onToggleFormat={(kind) =>
                          applyInlineFormat(
                            listKey,
                            block.items.join('\n'),
                            (val) => updateBlock(index, { ...block, items: val.split('\n') }),
                            kind,
                          )
                        }
                        onExitFormat={() => applyExitFormat(listKey, block.items.join('\n'))}
                        onInsertLink={(label, url) =>
                          applyInlineLink(
                            listKey,
                            block.items.join('\n'),
                            (val) => updateBlock(index, { ...block, items: val.split('\n') }),
                            label,
                            url,
                          )
                        }
                        getSelectedText={() =>
                          getFieldSelectedText(listKey, block.items.join('\n'))
                        }
                      />
                      <textarea
                        ref={registerFieldRef(listKey)}
                        rows={4}
                        dir={contentDir}
                        value={block.items.join('\n')}
                        onFocus={(e) => syncSelection(listKey, e.currentTarget)}
                        onSelect={(e) => syncSelection(listKey, e.currentTarget)}
                        onKeyUp={(e) => syncSelection(listKey, e.currentTarget)}
                        onMouseUp={(e) => syncSelection(listKey, e.currentTarget)}
                        onKeyDown={(e) =>
                          handleFormattedKeyDown(e, listKey, block.items.join('\n'), (val) =>
                            updateBlock(index, { ...block, items: val.split('\n') }),
                          )
                        }
                        onChange={(e) => {
                          updateBlock(index, { ...block, items: e.target.value.split('\n') });
                          syncSelection(listKey, e.currentTarget);
                        }}
                        placeholder={
                          isUiEn ? 'One item per line' : 'هر خط یک مورد...'
                        }
                        className={`w-full px-3.5 py-2.5 text-sm leading-7 ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'image' && (
                    <div className="space-y-2.5">
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
                              ? isUiEn
                                ? 'Uploading...'
                                : 'در حال آپلود...'
                              : isUiEn
                                ? 'Upload File'
                                : 'آپلود از دستگاه'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
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
                        <img
                          src={sanitizeMediaUrl(block.url)}
                          alt={block.alt || 'Preview'}
                          className="max-h-44 rounded-xl border border-[var(--hair)] object-cover"
                        />
                      )}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.alt || ''}
                          onChange={(e) => updateBlock(index, { ...block, alt: e.target.value })}
                          placeholder={isUiEn ? 'Alt text' : 'متن جایگزین (Alt)'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        />
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.caption || ''}
                          onChange={(e) =>
                            updateBlock(index, { ...block, caption: e.target.value })
                          }
                          placeholder={isUiEn ? 'Caption (optional)' : 'زیرنویس (اختیاری)'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        />
                      </div>
                    </div>
                  )}

                  {block.type === 'video' && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] text-[var(--ink-faint)]">
                        {isUiEn
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
                              ? isUiEn
                                ? 'Uploading...'
                                : 'در حال آپلود...'
                              : isUiEn
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
                                ? isUiEn
                                  ? 'Detected: YouTube embed'
                                  : 'شناسایی شد: ویدیوی یوتیوب (پخش تعبیه‌شده)'
                                : videoParsed.kind === 'aparat'
                                  ? isUiEn
                                    ? 'Detected: Aparat embed'
                                    : 'شناسایی شد: ویدیوی آپارات (پخش تعبیه‌شده)'
                                  : isUiEn
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
                        onChange={(e) =>
                          updateBlock(index, { ...block, caption: e.target.value })
                        }
                        placeholder={
                          isUiEn ? 'Video caption (optional)' : 'زیرنویس ویدیو (اختیاری)'
                        }
                        className={`w-full px-3 py-2 text-xs ${inputBase}`}
                      />
                    </div>
                  )}

                  {block.type === 'audio' && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] text-[var(--ink-faint)]">
                        {isUiEn
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
                              ? isUiEn
                                ? 'Uploading...'
                                : 'در حال آپلود...'
                              : isUiEn
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
                          placeholder={isUiEn ? 'Audio title' : 'عنوان فایل صوتی'}
                          className={`px-3 py-2 text-xs ${inputBase}`}
                        />
                        <input
                          type="text"
                          dir={contentDir}
                          value={block.caption || ''}
                          onChange={(e) =>
                            updateBlock(index, { ...block, caption: e.target.value })
                          }
                          placeholder={isUiEn ? 'Caption (optional)' : 'توضیح (اختیاری)'}
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
              {isUiEn ? 'Add a new block:' : 'افزودن بلوک جدید:'}
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
