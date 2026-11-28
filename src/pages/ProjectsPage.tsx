import { ExternalLink, Layers } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLocalizedSettingsText, getUiDict, localizeProject } from '../lib/i18n.ts';
import type { ProjectItem, SiteLanguage, SiteSettings } from '../types/cms.ts';

interface ProjectsPageProps {
  projects: ProjectItem[];
  settings: SiteSettings;
  lang: SiteLanguage;
}

export function ProjectsPage({ projects, settings, lang }: ProjectsPageProps) {
  const t = getUiDict(lang);
  const loc = getLocalizedSettingsText(settings, lang);

  useEffect(() => {
    document.title = `${loc.projectsSectionTitle} | ${settings.brandName || 'My Portfolio'}`;
  }, [loc.projectsSectionTitle, settings.brandName]);

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hair)] pb-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--flame-tint)] text-[var(--flame)]">
            <Layers className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-[var(--ink)] sm:text-3xl">
              {loc.projectsSectionTitle}
            </h1>
            {loc.projectsPageSubtitle && (
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{loc.projectsPageSubtitle}</p>
            )}
          </div>
        </div>
        <span className="text-xs text-[var(--ink-faint)] tabular-nums">
          {t.projectCount(projects.length)}
        </span>
      </header>

      {projects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground)] p-10 text-center text-sm text-[var(--ink-muted)]">
          {t.noProjectsYet}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {projects.map((proj) => {
            const locProj = localizeProject(proj, lang);
            const isExternal = proj.url.startsWith('http://') || proj.url.startsWith('https://');
            return (
              <article
                key={proj.id}
                className="ember-glass-interactive flex flex-col justify-between rounded-3xl p-6"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div dir="auto">
                      <h2 className="text-base font-bold text-[var(--ink)]">{locProj.title}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-faint)]">
                        {locProj.role && (
                          <span className="font-medium text-[var(--flame)]">{locProj.role}</span>
                        )}
                        {locProj.role && locProj.period && <span aria-hidden="true">·</span>}
                        {locProj.period && <span>{locProj.period}</span>}
                      </div>
                    </div>

                    {proj.url &&
                      (isExternal ? (
                        <a
                          href={proj.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${t.view} ${locProj.title}`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:bg-[var(--flame)] hover:text-[var(--flame-ink)]"
                        >
                          <span>{t.view}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <Link
                          to={proj.url}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--flame)]"
                        >
                          <span>{t.view}</span>
                        </Link>
                      ))}
                  </div>

                  {locProj.summary && (
                    <p dir="auto" className="mt-4 text-xs leading-7 text-[var(--ink-soft)]">
                      {locProj.summary}
                    </p>
                  )}
                </div>

                {proj.stack.length > 0 && (
                  <div className="mt-5 border-t border-[var(--hair)] pt-3.5">
                    <p className="font-mono text-[11px] text-[var(--ink-faint)]" dir="ltr">
                      {proj.stack.join(' · ')}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
