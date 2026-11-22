import { ArrowLeft, ArrowRight, Check, Clock, Copy, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BlockRenderer } from '../components/BlockRenderer.tsx';
import { SocialIcon } from '../components/BrandMark.tsx';
import {
  formatDateByLang,
  formatReadingTime,
  getLocalizedSettingsText,
  getUiDict,
  localizeCategoryName,
  localizePost,
} from '../lib/i18n.ts';
import type { BlogPost, CategoryItem, SiteLanguage, SiteSettings } from '../types/cms.ts';

interface BlogPostPageProps {
  posts: BlogPost[];
  categories: CategoryItem[];
  settings: SiteSettings;
  lang: SiteLanguage;
}

function safeDecodeSlug(raw?: string): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function BlogPostPage({ posts, categories, settings, lang }: BlogPostPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const decodedSlug = safeDecodeSlug(slug);
  const initialPost = posts.find((p) => p.slug === decodedSlug) ?? null;

  const t = getUiDict(lang);
  const loc = getLocalizedSettingsText(settings, lang);
  const BackArrow = lang === 'en' ? ArrowLeft : ArrowRight;

  const [post, setPost] = useState<BlogPost | null>(initialPost);
  const [loading, setLoading] = useState(!initialPost);
  const [notFound, setNotFound] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const showReading = settings.showReadingTime !== 'false';
  const showShareBar = settings.shareEnabled !== 'false';
  const showCopy = settings.shareCopyEnabled !== 'false';
  const showTelegram = settings.shareTelegramEnabled !== 'false';
  const showWhatsapp = settings.shareWhatsappEnabled !== 'false';
  const showX = settings.shareXEnabled !== 'false';
  const showNative = settings.shareNativeEnabled !== 'false' && canNativeShare;

  const hasAnyShareButton = showCopy || showTelegram || showWhatsapp || showX || showNative;

  useEffect(() => {
    window.scrollTo(0, 0);
    if (initialPost) {
      setPost(initialPost);
      setLoading(false);
      setNotFound(false);
      const locInitial = localizePost(initialPost, lang);
      document.title = `${locInitial.title} | ${settings.brandName}`;
      return;
    }

    if (!decodedSlug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/public/posts/${encodeURIComponent(decodedSlug)}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.json() as Promise<{ post: BlogPost }>;
      })
      .then((data) => {
        if (cancelled) return;
        setPost(data.post);
        setNotFound(false);
        const locFetched = localizePost(data.post, lang);
        document.title = `${locFetched.title} | ${settings.brandName}`;
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [decodedSlug, initialPost, lang, settings.brandName]);

  if (loading) {
    return (
      <main id="main" className="min-h-[75svh] bg-[var(--ground-deep)] py-20">
        <div className="mx-auto max-w-3xl px-4 text-center text-sm text-[var(--ink-faint)] sm:px-6">
          {t.loading}
        </div>
      </main>
    );
  }

  if (notFound || !post) {
    return (
      <main id="main" className="min-h-[75svh] bg-[var(--ground-deep)] py-20">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h1 className="text-2xl font-bold text-[var(--ink)]">{t.notFoundPostTitle}</h1>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">{t.notFoundPostDesc}</p>
          <Link
            to="/blog"
            className="ember-btn-flame mt-6 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm"
          >
            <BackArrow className="h-4 w-4" />
            <span>{t.backToBlog}</span>
          </Link>
        </div>
      </main>
    );
  }

  const locPost = localizePost(post, lang);
  const categoryLabel = localizeCategoryName(post.category, categories, lang);

  const shareUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `https://mbnd.ir/blog/${encodeURIComponent(post.slug)}`;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(locPost.title);
  const encodedWhatsApp = encodeURIComponent(`${locPost.title}\n${shareUrl}`);

  const handleCopyLink = async () => {
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) {
      try {
        const tmp = document.createElement('textarea');
        tmp.value = shareUrl;
        tmp.setAttribute('readonly', '');
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.select();
        copied = document.execCommand('copy');
        document.body.removeChild(tmp);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: locPost.title,
        text: locPost.excerpt,
        url: shareUrl,
      });
    } catch {
      // user cancelled native share sheet
    }
  };

  return (
    <main id="main" className="min-h-[75svh] bg-[var(--ground-deep)] py-12 sm:py-16">
      <article className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--flame)]"
        >
          <BackArrow className="h-3.5 w-3.5" />
          <span>{t.allPosts}</span>
        </Link>

        <header className="mt-6 border-b border-[var(--hair)] pb-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-faint)] tabular-nums">
            <span className="font-semibold text-[var(--flame)]">{categoryLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDateByLang(post.createdAt, lang)}</span>
            {showReading && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[var(--ink-soft)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--flame)]" />
                  <span>{formatReadingTime(post.readingMinutes, lang)}</span>
                </span>
              </>
            )}
          </div>

          <h1
            dir="auto"
            className="mt-4 text-2xl font-extrabold leading-snug tracking-tight text-[var(--ink)] [text-wrap:balance] sm:text-4xl"
          >
            {locPost.title}
          </h1>

          <p dir="auto" className="mt-4 text-base leading-8 text-[var(--ink-soft)]">
            {locPost.excerpt}
          </p>

          {lang === 'en' && !locPost.hasEnglishTranslation && t.untranslatedPostNote && (
            <p className="mt-4 inline-block rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-1.5 text-xs text-[var(--ink-soft)]">
              {t.untranslatedPostNote}
            </p>
          )}
        </header>

        {post.coverImage && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--hair)]">
            <img
              src={post.coverImage}
              alt={locPost.title}
              referrerPolicy="no-referrer"
              className="max-h-[440px] w-full object-cover"
            />
          </div>
        )}

        <div className="mt-10" dir={lang === 'en' && locPost.hasEnglishTranslation ? 'ltr' : 'auto'}>
          <BlockRenderer blocks={locPost.blocks} lang={lang} />
        </div>

        {/* Share Section (all buttons & texts controllable from Admin) */}
        {showShareBar && hasAnyShareButton && (
          <section
            aria-label={t.shareSectionAria}
            className="mt-12 rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                  <Share2 className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[var(--ink)]">{loc.shareHeading}</h2>
                  {loc.shareSubtitle && (
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{loc.shareSubtitle}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {showCopy && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors ${
                      copiedLink
                        ? 'border-emerald-500/45 bg-emerald-500/15 text-[var(--status-success-ink)]'
                        : 'border-[var(--hair-strong)] bg-[var(--ground-deep)] text-[var(--ink)] hover:border-[var(--flame)]'
                    }`}
                  >
                    {copiedLink ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-[var(--flame)]" />
                    )}
                    <span>{copiedLink ? t.linkCopied : t.copyLink}</span>
                  </button>
                )}

                {showTelegram && (
                  <a
                    href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.shareTelegram}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--flame)]"
                  >
                    <SocialIcon iconKey="telegram" className="h-3.5 w-3.5 text-[var(--flame)]" />
                    <span>{t.shareTelegram}</span>
                  </a>
                )}

                {showWhatsapp && (
                  <a
                    href={`https://wa.me/?text=${encodedWhatsApp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.shareWhatsapp}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--flame)]"
                  >
                    <SocialIcon iconKey="whatsapp" className="h-3.5 w-3.5 text-[var(--flame)]" />
                    <span>{t.shareWhatsapp}</span>
                  </a>
                )}

                {showX && (
                  <a
                    href={`https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.shareX}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--flame)]"
                  >
                    <SocialIcon iconKey="x" className="h-3.5 w-3.5 text-[var(--flame)]" />
                    <span>{t.shareX}</span>
                  </a>
                )}

                {showNative && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="ember-btn-flame inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-xs"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>{t.shareNative}</span>
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        <footer className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-[var(--hair)] pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-[var(--ink-faint)]">
            {t.author}{' '}
            <strong className="font-semibold text-[var(--ink)]">
              {lang === 'en'
                ? settings.brandName || 'Mohammad Bagher'
                : settings.vcardFullName || settings.brandName}
            </strong>
          </p>
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--flame)] hover:text-[var(--flame-lit)]"
          >
            <BackArrow className="h-3.5 w-3.5" />
            <span>{t.otherPosts}</span>
          </Link>
        </footer>
      </article>
    </main>
  );
}
