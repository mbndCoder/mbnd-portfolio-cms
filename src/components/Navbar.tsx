import { Globe, Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getUiDict, parseNavItems } from '../lib/i18n.ts';
import type { SiteLanguage, SiteSettings, ThemeMode } from '../types/cms.ts';
import { BrandLogo } from './BrandMark.tsx';

interface NavbarProps {
  settings: SiteSettings;
  lang: SiteLanguage;
  onToggleLang: () => void;
  themePref: ThemeMode;
  onCycleTheme: () => void;
}

export function Navbar({
  settings,
  lang,
  onToggleLang,
  themePref,
  onCycleTheme,
}: NavbarProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const t = getUiDict(lang);

  const navItems = useMemo(
    () => parseNavItems(settings.navItemsJson).filter((item) => item.enabled !== false),
    [settings.navItemsJson],
  );

  // Both toggles are OFF by default; admin can opt-in from Appearance settings
  const allowThemeToggle = settings.allowThemeToggle === 'true';
  const allowLanguageToggle = settings.allowLanguageToggle === 'true';

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const ThemeIcon = themePref === 'light' ? Sun : themePref === 'dark' ? Moon : Monitor;
  const themeLabel =
    themePref === 'light' ? t.themeLight : themePref === 'dark' ? t.themeDark : t.themeAuto;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hair)] bg-[var(--ground-deep-85)] backdrop-blur-[12px]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/"
          onClick={() => setOpen(false)}
          className="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap text-sm font-bold tracking-tight text-[var(--ink)] transition-opacity hover:opacity-90 sm:text-[15px]"
        >
          {settings.logoImage !== '__hidden__' && (
            <BrandLogo
              src={settings.logoImage}
              alt={settings.brandName || 'My Portfolio'}
              className="h-7 w-7"
            />
          )}
          <span dir="ltr">{settings.brandName || 'My Portfolio'}</span>
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <nav aria-label={t.mainNavLabel} className="hidden items-center gap-6 md:flex">
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
                    className="shrink-0 whitespace-nowrap text-sm font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--flame)]"
                  >
                    {label}
                  </a>
                );
              }
              const active = isActive(item.to);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className={`shrink-0 whitespace-nowrap text-sm font-medium transition-colors ${
                    active ? 'text-[var(--flame)]' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Optional Language & Theme Controls (both OFF by default) + Mobile Menu Button */}
          <div className="flex items-center gap-1.5">
            {allowLanguageToggle && (
              <button
                type="button"
                onClick={onToggleLang}
                aria-label={t.langToggleAria}
                title={t.langToggleAria}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-2.5 text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:border-[var(--flame)] hover:text-[var(--ink)]"
              >
                <Globe className="h-3.5 w-3.5 text-[var(--flame)]" />
                <span>{lang === 'fa' ? 'EN' : 'فا'}</span>
              </button>
            )}

            {allowThemeToggle && (
              <button
                type="button"
                onClick={onCycleTheme}
                aria-label={`${t.themeToggleAria} (${themeLabel})`}
                title={`${t.themeToggleAria}: ${themeLabel}`}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-2.5 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--flame)] hover:text-[var(--ink)]"
              >
                <ThemeIcon className="h-3.5 w-3.5 text-[var(--flame)]" />
                <span className="hidden sm:inline">{themeLabel}</span>
              </button>
            )}

            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] text-[var(--ink)] md:hidden"
              aria-label={open ? t.closeMenu : t.openMenu}
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--hair)] bg-[var(--ground)] px-4 py-4 md:hidden">
          <nav aria-label={t.mobileNavLabel} className="flex flex-col gap-1">
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
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--flame-tint)] hover:text-[var(--flame)]"
                  >
                    {label}
                  </a>
                );
              }
              const active = isActive(item.to);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[var(--flame-tint)] text-[var(--flame)]'
                      : 'text-[var(--ink-soft)] hover:bg-[var(--surface)]'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
