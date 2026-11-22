import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, Layers, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatDateByLang,
  formatReadingTime,
  getLocalizedSettingsText,
  getUiDict,
  localizeCategory,
  localizeCategoryName,
  localizePost,
  localizeProject,
} from '../lib/i18n.ts';
import type {
  BlogPost,
  CategoryItem,
  ProjectItem,
  SiteLanguage,
  SiteSettings,
} from '../types/cms.ts';
import { ContactForm } from './ContactForm.tsx';

interface HomeCardsGridProps {
  settings: SiteSettings;
  categories: CategoryItem[];
  posts: BlogPost[];
  projects: ProjectItem[];
  lang: SiteLanguage;
}

export function HomeCardsGrid({
  settings,
  categories,
  posts,
  projects,
  lang,
}: HomeCardsGridProps) {
  const t = getUiDict(lang);
  const loc = getLocalizedSettingsText(settings, lang);
  const [selectedCategory, setSelectedCategory] = useState<string>('__ALL__');

  const showBlog = settings.showBlogCard !== 'false';
  const showProjects = settings.showProjectsCard !== 'false';
  const showAbout = settings.showAboutCard !== 'false';
  const showHero = settings.showHeroSection !== 'false';
  const showReading = settings.showReadingTime !== 'false';
  const showForm = settings.contactFormEnabled !== 'false';

  const visibleCardCount = [showBlog, showProjects, showAbout].filter(Boolean).length;
  const gridColsClass =
    visibleCardCount === 1
      ? 'lg:grid-cols-1 max-w-2xl mx-auto'
      : visibleCardCount === 2
        ? 'lg:grid-cols-2'
        : 'lg:grid-cols-3';

  const ArrowForward = lang === 'en' ? ArrowRight : ArrowLeft;

  const filterNames = useMemo(() => {
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

  const filteredPosts = useMemo(() => {
    const list =
      selectedCategory === '__ALL__'
        ? posts
        : posts.filter((p) => p.category === selectedCategory);
    return list.slice(0, 3);
  }, [posts, selectedCategory]);

  if (visibleCardCount === 0) return null;

  return (
    <section
      aria-label={lang === 'en' ? 'Main sections' : 'بخش‌های اصلی'}
      className={`relative z-10 bg-gradient-to-b from-transparent via-[var(--ground-deep)] to-[var(--ground-deep)] pb-16 sm:pb-24 ${
        showHero ? '-mt-10 pt-2 sm:-mt-12' : 'pt-12'
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className={`grid grid-cols-1 gap-6 lg:items-stretch ${gridColsClass}`}>
          {/* Card 1: نوشته‌ها و تجربه‌ها */}
          {showBlog && (
            <article
              id="blog-preview"
              className="ember-glass-interactive flex flex-col justify-between rounded-3xl p-6 sm:p-7"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <h2 className="text-lg font-bold text-[var(--ink)]">{loc.blogSectionTitle}</h2>
                  </div>
                  <Link
                    to="/blog"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--flame)] hover:text-[var(--flame-lit)]"
                  >
                    <span>{t.all}</span>
                    <ArrowForward className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div
                  role="group"
                  aria-label={t.filterCategoriesAria}
                  className="mt-4 flex flex-wrap items-center gap-1.5"
                >
                  {filterNames.map((cat) => {
                    const active = selectedCategory === cat;
                    const label =
                      cat === '__ALL__' ? t.all : localizeCategoryName(cat, categories, lang);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                            : 'border border-[var(--hair-strong)] bg-[var(--ground-deep)] text-[var(--ink-soft)] hover:border-[var(--flame)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {activeCategoryMeta && localizeCategory(activeCategoryMeta, lang).description && (
                  <p
                    dir="auto"
                    className="mt-3 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-2 text-xs leading-6 text-[var(--ink-soft)]"
                  >
                    {localizeCategory(activeCategoryMeta, lang).description}
                  </p>
                )}

                <div className="mt-5 space-y-3">
                  {filteredPosts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-5 text-xs leading-7 text-[var(--ink-muted)]">
                      {selectedCategory === '__ALL__'
                        ? t.noPostsYet
                        : t.noPostsInCategory(
                            localizeCategoryName(selectedCategory, categories, lang),
                          )}
                    </div>
                  ) : (
                    filteredPosts.map((post) => {
                      const locPost = localizePost(post, lang);
                      const catLabel = localizeCategoryName(post.category, categories, lang);
                      return (
                        <Link
                          key={post.id}
                          to={`/blog/${encodeURIComponent(post.slug)}`}
                          className="block rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-3.5 transition-colors hover:border-[var(--flame)] hover:bg-[var(--surface)]"
                        >
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--ink-faint)] tabular-nums">
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
                          <h3 dir="auto" className="mt-1 text-sm font-bold text-[var(--ink)]">
                            {locPost.title}
                          </h3>
                          <p
                            dir="auto"
                            className="mt-1 line-clamp-2 text-xs leading-6 text-[var(--ink-muted)]"
                          >
                            {locPost.excerpt}
                          </p>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-[var(--hair)] pt-4">
                <Link
                  to="/blog"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:text-[var(--flame)]"
                >
                  <span>{t.viewBlogPage}</span>
                  <ArrowForward className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          )}

          {/* Card 2: پروژه‌ها */}
          {showProjects && (
            <article
              id="projects"
              className="ember-glass-interactive flex flex-col justify-between rounded-3xl p-6 sm:p-7"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                      <Layers className="h-4 w-4" />
                    </span>
                    <h2 className="text-lg font-bold text-[var(--ink)]">
                      {loc.projectsSectionTitle}
                    </h2>
                  </div>
                  <Link
                    to="/projects"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--flame)] hover:text-[var(--flame-lit)]"
                  >
                    <span>{t.all}</span>
                    <ArrowForward className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="mt-5 space-y-3.5">
                  {projects.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-5 text-xs text-[var(--ink-muted)]">
                      {t.noProjectsYet}
                    </p>
                  ) : (
                    projects.slice(0, 3).map((proj) => {
                      const locProj = localizeProject(proj, lang);
                      const isExternal =
                        proj.url.startsWith('http://') || proj.url.startsWith('https://');
                      return (
                        <div
                          key={proj.id}
                          className="rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-4 transition-colors hover:border-[var(--flame)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div dir="auto">
                              <h3 className="text-sm font-bold text-[var(--ink)]">{locProj.title}</h3>
                              {locProj.role && (
                                <p className="mt-0.5 text-[11px] text-[var(--flame)]">
                                  {locProj.role}
                                </p>
                              )}
                            </div>

                            {proj.url &&
                              (isExternal ? (
                                <a
                                  href={proj.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`${t.view} ${locProj.title}`}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--flame-border)] bg-[var(--flame-tint)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--flame)] hover:text-[var(--flame-ink)]"
                                >
                                  <span>{t.view}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <Link
                                  to={proj.url}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--hair-strong)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink)] hover:border-[var(--flame)]"
                                >
                                  <span>{t.view}</span>
                                </Link>
                              ))}
                          </div>

                          {locProj.summary && (
                            <p dir="auto" className="mt-2.5 text-xs leading-6 text-[var(--ink-muted)]">
                              {locProj.summary}
                            </p>
                          )}

                          {proj.stack.length > 0 && (
                            <p className="mt-2.5 text-[11px] text-[var(--ink-faint)]" dir="ltr">
                              {proj.stack.join(' · ')}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-[var(--hair)] pt-4">
                <Link
                  to="/projects"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:text-[var(--flame)]"
                >
                  <span>{t.viewProjectsPage}</span>
                  <ArrowForward className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          )}

          {/* Card 3: درباره من و ارتباط (کاملاً همسان با صفحه درباره من) */}
          {showAbout && (
            <article
              id="about"
              className="ember-glass-interactive flex flex-col justify-between rounded-3xl p-6 sm:p-7"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                      <User className="h-4 w-4" />
                    </span>
                    <h2 className="text-lg font-bold text-[var(--ink)]">{loc.aboutTitle}</h2>
                  </div>
                  <Link
                    to="/about"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--flame)] hover:text-[var(--flame-lit)]"
                  >
                    <span>{t.more}</span>
                    <ArrowForward className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <p className="mt-3 text-xs leading-7 text-[var(--ink-soft)]">{loc.aboutBio}</p>

                {loc.aboutFocusText && (
                  <div className="mt-4 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-3.5">
                    <div className="text-[11px] font-bold text-[var(--flame)]">
                      {loc.aboutFocusHeading}
                    </div>
                    <p className="mt-1 text-xs leading-6 text-[var(--ink-muted)]">
                      {loc.aboutFocusText}
                    </p>
                  </div>
                )}

                {showForm && (
                  <div className="mt-5">
                    <ContactForm
                      settings={settings}
                      lang={lang}
                      idPrefix="home-contact"
                      compact
                      defaultSubject={lang === 'en' ? 'Message from Home page' : 'پیام از صفحه اصلی'}
                    />
                  </div>
                )}
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
