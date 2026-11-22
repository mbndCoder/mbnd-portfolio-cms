import { Check, Copy, ExternalLink, Headphones, ImageOff, Link2, VideoOff } from 'lucide-react';
import { Fragment, useState } from 'react';
import { parseInlineRichText, parseVideoEmbed } from '../lib/blocks.ts';
import { getUiDict } from '../lib/i18n.ts';
import type { ContentBlock, SiteLanguage } from '../types/cms.ts';

function RichInlineText({ text }: { text: string }) {
  const tokens = parseInlineRichText(text);
  return (
    <>
      {tokens.map((token, idx) => {
        switch (token.type) {
          case 'bold':
            return (
              <strong key={idx} className="font-bold text-[var(--ink)]">
                {token.value}
              </strong>
            );
          case 'italic':
            return (
              <em key={idx} className="italic text-[var(--ink)]">
                {token.value}
              </em>
            );
          case 'highlight':
            return (
              <mark
                key={idx}
                className="rounded bg-[var(--flame-tint)] px-1.5 py-0.5 text-[var(--ink)]"
              >
                {token.value}
              </mark>
            );
          case 'code':
            return (
              <code
                key={idx}
                dir="ltr"
                className="inline-block rounded-md border border-[var(--hair-strong)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[0.86em] text-[var(--flame)]"
              >
                {token.value}
              </code>
            );
          case 'link': {
            const isExternal = token.url.startsWith('http://') || token.url.startsWith('https://');
            return (
              <a
                key={idx}
                href={token.url}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="font-medium text-[var(--flame)] underline decoration-[var(--flame-border)] underline-offset-4 transition-colors hover:text-[var(--flame-lit)]"
              >
                {token.label}
              </a>
            );
          }
          case 'text':
          default:
            return <Fragment key={idx}>{token.value}</Fragment>;
        }
      })}
    </>
  );
}

function CodeBlockView({
  language,
  code,
  lang,
}: {
  language: string;
  code: string;
  lang: SiteLanguage;
}) {
  const t = getUiDict(lang);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    let ok = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(code);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      try {
        const tmp = document.createElement('textarea');
        tmp.value = code;
        tmp.setAttribute('readonly', '');
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.select();
        ok = document.execCommand('copy');
        document.body.removeChild(tmp);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div
      className="my-6 overflow-hidden rounded-2xl border border-[var(--hair-strong)] bg-[#0E0E0E]"
      dir="ltr"
    >
      <div className="flex items-center justify-between border-b border-[#FBEFDD]/10 bg-[#181818] px-4 py-2 text-xs text-[#FBEFDD]/65">
        <span className="font-mono uppercase">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[#FBEFDD]/80 transition-colors hover:bg-[#FBEFDD]/10 hover:text-[#FBEFDD]"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span>{copied ? t.copiedCode : t.copyCode}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-7 text-[#FBEFDD]/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ImageBlockView({ url, alt, caption }: { url: string; alt?: string; caption?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className="my-7">
      {!url || failed ? (
        <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--ground)] text-[var(--ink-faint)]">
          <ImageOff className="h-6 w-6" />
          <span className="text-xs">{alt || caption || 'تصویر در دسترس نیست'}</span>
        </div>
      ) : (
        <img
          src={url}
          alt={alt || caption || ''}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-[520px] w-full rounded-2xl border border-[var(--hair)] object-cover"
        />
      )}
      {caption && (
        <figcaption className="mt-2.5 text-center text-xs text-[var(--ink-faint)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function VideoBlockView({ url, caption }: { url: string; caption?: string }) {
  const [failed, setFailed] = useState(false);
  const parsed = parseVideoEmbed(url);

  return (
    <figure className="my-7">
      {parsed.kind === 'youtube' || parsed.kind === 'aparat' ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--hair)] bg-black">
          <div className="relative aspect-video w-full">
            <iframe
              src={parsed.embedUrl}
              title={caption || (parsed.kind === 'youtube' ? 'YouTube Video' : 'Aparat Video')}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </div>
      ) : parsed.kind === 'direct' && !failed ? (
        <video
          src={parsed.url}
          controls
          preload="metadata"
          playsInline
          onError={() => setFailed(true)}
          className="w-full rounded-2xl border border-[var(--hair)] bg-black"
        />
      ) : (
        <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--ground)] text-xs text-[var(--ink-faint)]">
          <VideoOff className="h-5 w-5" />
          <span>{url ? 'پخش این ویدیو با خطا مواجه شد' : 'آدرس ویدیو وارد نشده است'}</span>
        </div>
      )}
      {caption && (
        <figcaption className="mt-2.5 text-center text-xs text-[var(--ink-faint)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function formatHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function BlockRenderer({
  blocks,
  lang = 'fa',
}: {
  blocks: ContentBlock[];
  lang?: SiteLanguage;
}) {
  if (!blocks || blocks.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-faint)]">
        {lang === 'en' ? 'No content added yet.' : 'محتوایی برای این بخش ثبت نشده است.'}
      </p>
    );
  }

  return (
    <div className="space-y-5 text-base leading-8 text-[var(--ink-soft)]">
      {blocks.map((block) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2
                key={block.id}
                className="pt-5 text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl"
              >
                {block.text}
              </h2>
            );

          case 'h3':
            return (
              <h3 key={block.id} className="pt-3 text-lg font-bold text-[var(--ink)] sm:text-xl">
                {block.text}
              </h3>
            );

          case 'paragraph':
            return (
              <p key={block.id} className="whitespace-pre-line text-[var(--ink-soft)]">
                <RichInlineText text={block.text} />
              </p>
            );

          case 'card':
            return (
              <div
                key={block.id}
                className={`my-6 rounded-2xl border p-5 sm:p-6 ${
                  block.accent === 'neutral'
                    ? 'border-[var(--hair)] bg-[var(--ground)]'
                    : 'border-[var(--flame-border)] bg-[var(--flame-tint)]'
                }`}
              >
                {block.title && (
                  <h4
                    className={`text-base font-bold ${
                      block.accent === 'neutral' ? 'text-[var(--ink)]' : 'text-[var(--flame)]'
                    }`}
                  >
                    {block.title}
                  </h4>
                )}
                {block.body && (
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-[var(--ink-soft)]">
                    <RichInlineText text={block.body} />
                  </p>
                )}
              </div>
            );

          case 'button': {
            if (!block.label && !block.url) return null;
            const isExternal =
              block.url.startsWith('http://') || block.url.startsWith('https://');
            return (
              <div key={block.id} className="my-5">
                <a
                  href={block.url || '#'}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  className={
                    block.variant === 'secondary'
                      ? 'inline-flex items-center gap-2 rounded-2xl border border-[var(--hair-strong)] bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--flame)]'
                      : 'ember-btn-flame inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm'
                  }
                >
                  <span>{block.label || block.url}</span>
                  {isExternal && <ExternalLink className="h-4 w-4 shrink-0" />}
                </a>
              </div>
            );
          }

          case 'embed': {
            if (!block.url) return null;
            const isExternal =
              block.url.startsWith('http://') || block.url.startsWith('https://');
            return (
              <a
                key={block.id}
                href={block.url}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="group my-6 flex items-start justify-between gap-4 rounded-2xl border border-[var(--hair)] bg-[var(--ground)] p-5 transition-colors hover:border-[var(--flame)] hover:bg-[var(--surface)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[var(--flame)]" dir="ltr">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{formatHostname(block.url)}</span>
                  </div>
                  <h4 className="mt-1.5 text-base font-bold text-[var(--ink)] transition-colors group-hover:text-[var(--flame)]">
                    {block.title || block.url}
                  </h4>
                  {block.description && (
                    <p className="mt-1.5 text-xs leading-6 text-[var(--ink-muted)]">
                      {block.description}
                    </p>
                  )}
                </div>
                <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-[var(--ink-faint)] transition-colors group-hover:text-[var(--flame)]" />
              </a>
            );
          }

          case 'quote':
            return (
              <blockquote
                key={block.id}
                className="my-6 rounded-2xl border-s-4 border-[var(--flame)] bg-[var(--ground)] p-6 text-[var(--ink)]"
              >
                <p className="text-base font-medium leading-8">
                  «<RichInlineText text={block.text} />»
                </p>
                {block.author && (
                  <footer className="mt-3 text-xs text-[var(--flame)]">— {block.author}</footer>
                )}
              </blockquote>
            );

          case 'code':
            return (
              <CodeBlockView
                key={block.id}
                language={block.language}
                code={block.code}
                lang={lang}
              />
            );

          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul';
            return (
              <ListTag
                key={block.id}
                className={`space-y-2 ps-5 text-[var(--ink-soft)] ${
                  block.ordered ? 'list-decimal' : 'list-disc'
                }`}
              >
                {block.items
                  .filter((item) => item.trim().length > 0)
                  .map((item, idx) => (
                    <li key={idx} className="leading-8">
                      <RichInlineText text={item} />
                    </li>
                  ))}
              </ListTag>
            );
          }

          case 'image':
            return (
              <ImageBlockView
                key={block.id}
                url={block.url}
                alt={block.alt}
                caption={block.caption}
              />
            );

          case 'video':
            return <VideoBlockView key={block.id} url={block.url} caption={block.caption} />;

          case 'audio':
            return (
              <figure
                key={block.id}
                className="my-6 rounded-2xl border border-[var(--hair)] bg-[var(--ground)] p-5"
              >
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                    <Headphones className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-bold text-[var(--ink)]">
                    {block.title || (lang === 'en' ? 'Audio clip' : 'فایل صوتی')}
                  </span>
                </div>
                {block.url ? (
                  <audio src={block.url} controls preload="metadata" className="w-full" />
                ) : (
                  <div className="rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] p-3 text-xs text-[var(--ink-faint)]">
                    {lang === 'en' ? 'No audio source selected.' : 'فایل صوتی انتخاب نشده است'}
                  </div>
                )}
                {block.caption && (
                  <figcaption className="mt-2.5 text-xs text-[var(--ink-muted)]">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
