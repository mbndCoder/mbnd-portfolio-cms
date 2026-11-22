import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getUiDict } from '../lib/i18n.ts';
import type { SiteLanguage } from '../types/cms.ts';

interface NotFoundPageProps {
  lang: SiteLanguage;
}

export function NotFoundPage({ lang }: NotFoundPageProps) {
  const t = getUiDict(lang);
  const BackArrow = lang === 'en' ? ArrowLeft : ArrowRight;

  return (
    <main id="main" className="flex min-h-[70svh] items-center justify-center bg-[var(--ground-deep)] px-4 py-16">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm font-bold text-[var(--flame)]">404</p>
        <h1 className="mt-2 text-2xl font-extrabold text-[var(--ink)]">{t.notFoundPageTitle}</h1>
        <p className="mt-3 text-sm leading-7 text-[var(--ink-muted)]">{t.notFoundPageDesc}</p>
        <Link
          to="/"
          className="ember-btn-flame mt-6 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm"
        >
          <BackArrow className="h-4 w-4" />
          <span>{t.backToHome}</span>
        </Link>
      </div>
    </main>
  );
}
