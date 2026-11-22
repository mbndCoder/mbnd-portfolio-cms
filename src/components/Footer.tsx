import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getLocalizedSettingsText, getUiDict, parseNavItems } from '../lib/i18n.ts';
import type { SiteLanguage, SiteSettings } from '../types/cms.ts';
import { BrandLogo } from './BrandMark.tsx';

interface FooterProps {
  settings: SiteSettings;
  lang: SiteLanguage;
}

export function Footer({ settings, lang }: FooterProps) {
  const t = getUiDict(lang);
  const loc = getLocalizedSettingsText(settings, lang);

  const navItems = useMemo(
    () => parseNavItems(settings.navItemsJson).filter((item) => item.enabled !== false),
    [settings.navItemsJson],
  );

  return (
    <footer className="border-t border-[var(--hair)] bg-[var(--ground-deep)]">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-8 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2.5">
          {settings.logoImage !== '__hidden__' && (
            <BrandLogo src={settings.logoImage} alt={settings.brandName} className="h-6 w-6" />
          )}
          <p className="text-xs text-[var(--ink-faint)] tabular-nums">{loc.footerText}</p>
        </div>

        <nav aria-label={t.footerNavLabel} className="flex flex-wrap items-center gap-5 text-xs text-[var(--ink-muted)]">
          {navItems.map((item) => {
            const label =
              lang === 'en' ? item.labelEn || item.labelFa : item.labelFa || item.labelEn;
            if (item.external) {
              return (
                <a
                  key={item.id}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[var(--ink)]"
                >
                  {label}
                </a>
              );
            }
            return (
              <Link
                key={item.id}
                to={item.to}
                className="transition-colors hover:text-[var(--ink)]"
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
