import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  formatDateByLang,
  formatReadingTime,
  getLocalizedSettingsText,
  getUiDict,
  localizeCategory,
  localizeCategoryName,
  localizePost,
} from '../lib/i18n.ts';
import type { BlogPost, CategoryItem, SiteLanguage, SiteSettings } from '../types/cms.ts';

interface BlogListPageProps {
  posts: BlogPost[];
  categories: CategoryItem[];
  settings: SiteSettings;
  lang: SiteLanguage;
}

export function BlogListPage({ posts, categories, settings, lang }: BlogListPageProps) {
  const t = getUiDict(lang);
  const loc = getLocalizedSettingsText(settings, lang);
  const [searchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState('__ALL__');
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const showReading = settings.showReadingTime !== 'false';
  const ArrowForward = lang === 'en' ? ArrowRight : ArrowLeft;

  useEffect(() => {
    const qParam = searchParams.get('q');
    if (qParam !== null) {
      setQuery(qParam);
    }
  }, [searchParams]);

  useEffect(() => {
    document.title = `${loc.blogSectionTitle} | ${settings.brandName}`;
    window.scrollTo(0, 0);
  }, [loc.blogSectionTitle, settings.brandName]);

  const categoryNames = useMemo(() => {
    const names = categories.map((c) => c.name);
    for (const p of posts) {
      if (p.category && !names.includes(p.category)) {
        names.push(p.category);
      }
    }
    return ['__ALL__', ...names];
  }, [categories, posts]);

  const activeCategoryMeta = useMemo(
    () =>
      selectedCategory === '__ALL__'
        ? null
        : (categories.find((c) => c.name === selectedCategory) ?? null),
    [categories, selectedCategory],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((post) => {
      const matchCat = selectedCategory === '__ALL__' || post.category === selectedCategory;
      const locPost = localizePost(post, lang);
      const catLabel = localizeCategoryName(post.category, categories, lang);
      const matchQuery =
        !q ||
        locPost.title.toLowerCase().includes(q) ||
        locPost.excerpt.toLowerCase().includes(q) ||
        post.title.toLowerCase().includes(q) ||
        catLabel.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [posts, categories, lang, selectedCategory, query]);

  return (
    <main id="main" className="min-h-[75svh] bg-[var(--ground-deep)] py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="border-b border-[var(--hair)] pb-8">
          <p className="text-xs font-semibold text-[var(--flame)]">{loc.blogSectionTitle}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--ink)] sm:text-4xl">
            {loc.blogPageTitle}
          </h1>
          {loc.blogPageSubtitle && (
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--ink-muted)]">
              {loc.blogPageSubtitle}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="group"
              aria-label={t.filterCategoriesAria}
              className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--hair)] bg-[var(--ground)] p-1"
            >
              {categoryNames.map((cat) => {
                const active = selectedCategory === cat;
                const label =
                  cat === '__ALL__' ? t.all : localizeCategoryName(cat, categories, lang);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                        : 'text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full sm:w-72">
              <Search
                className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)] ${
                  lang === 'en' ? 'left-3.5' : 'right-3.5'
                }`}
              />
              <label htmlFor="blog-search" className="sr-only">
                {t.searchPostsAria}
              </label>
              <input
                id="blog-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPostsPlaceholder}
                className={`theme-input w-full rounded-xl py-2 text-sm ${
                  lang === 'en' ? 'pl-10 pr-4' : 'pl-4 pr-10'
                }`}
              />
            </div>
          </div>

          {activeCategoryMeta && localizeCategory(activeCategoryMeta, lang).description && (
            <p
              dir="auto"
              className="mt-4 inline-block rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-4 py-2 text-xs text-[var(--ink)]"
            >
              {localizeCategory(activeCategoryMeta, lang).description}
            </p>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-10 text-center">
            <p className="text-sm leading-7 text-[var(--ink-soft)]">
              {posts.length === 0
                ? t.noPostsYet
                : selectedCategory !== '__ALL__'
                  ? t.noPostsInCategory(localizeCategoryName(selectedCategory, categories, lang))
                  : t.noPostsYet}
            </p>
            {(selectedCategory !== '__ALL__' || query) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('__ALL__');
                  setQuery('');
                }}
                className="mt-4 cursor-pointer rounded-full border border-[var(--hair-strong)] px-4 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--flame)]"
              >
                {t.all}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((post) => {
              const locPost = localizePost(post, lang);
              const catLabel = localizeCategoryName(post.category, categories, lang);
              return (
                <Link
                  key={post.id}
                  to={`/blog/${encodeURIComponent(post.slug)}`}
                  className="ember-glass-interactive group flex flex-col justify-between overflow-hidden rounded-2xl"
                >
                  <div>
                    <div className="aspect-[16/10] w-full overflow-hidden border-b border-[var(--hair)] bg-[var(--surface)]">
                      {post.coverImage ? (
                        <img
                          src={post.coverImage}
                          alt={locPost.title}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-end p-5">
                          <span className="text-xs font-medium text-[var(--ink-faint)]">
                            {catLabel}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-6">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-faint)] tabular-nums">
                        <span className="font-medium text-[var(--flame)]">{catLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDateByLang(post.createdAt, lang)}</span>
                        {showReading && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatReadingTime(post.readingMinutes, lang)}</span>
                          </>
                        )}
                      </div>

                      <h2
                        dir="auto"
                        className="mt-3 text-lg font-bold leading-snug text-[var(--ink)] transition-colors group-hover:text-[var(--flame)]"
                      >
                        {locPost.title}
                      </h2>

                      <p
                        dir="auto"
                        className="mt-2.5 line-clamp-3 text-sm leading-7 text-[var(--ink-muted)]"
                      >
                        {locPost.excerpt}
                      </p>
                    </div>
                  </div>

                  <div className="px-6 pb-5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-soft)] group-hover:text-[var(--flame)]">
                      <span>{t.readArticle}</span>
                      <ArrowForward className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
