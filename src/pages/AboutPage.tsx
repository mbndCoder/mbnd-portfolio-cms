import { Mail, User } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { BrandLogo, ContactCardMark, SocialIcon } from '../components/BrandMark.tsx';
import { ContactForm } from '../components/ContactForm.tsx';
import { parseClientSocialLinks } from '../components/HeroSection.tsx';
import { getLocalizedSettingsText, localizeSocialLabel } from '../lib/i18n.ts';
import type { SiteLanguage, SiteSettings } from '../types/cms.ts';

interface AboutPageProps {
  settings: SiteSettings;
  lang: SiteLanguage;
}

export function AboutPage({ settings, lang }: AboutPageProps) {
  const loc = getLocalizedSettingsText(settings, lang);
  const showForm = settings.contactFormEnabled !== 'false';

  const socialLinks = useMemo(
    () => parseClientSocialLinks(settings.socialLinksJson, settings),
    [settings],
  );

  useEffect(() => {
    document.title = `${loc.aboutTitle} | ${settings.brandName || 'My Portfolio'}`;
  }, [loc.aboutTitle, settings.brandName]);

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className={`grid grid-cols-1 gap-8 ${showForm ? 'lg:grid-cols-12' : 'max-w-2xl mx-auto'}`}>
        {/* Profile & Direct Connect */}
        <section className={`ember-glass rounded-3xl p-6 sm:p-8 ${showForm ? 'lg:col-span-6' : ''}`}>
          <div className="flex items-center gap-4">
            {settings.logoImage !== '__hidden__' && (
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] p-2">
                <BrandLogo
                  src={settings.logoImage}
                  className="h-full w-full"
                  alt={settings.brandName}
                />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-extrabold text-[var(--ink)]">{loc.aboutTitle}</h1>
              <p className="mt-1 text-xs text-[var(--flame)]">
                {lang === 'en'
                  ? settings.brandName || 'My Portfolio'
                  : settings.vcardFullName || settings.brandName || 'My Portfolio'}
              </p>
            </div>
          </div>

          <p className="mt-6 whitespace-pre-line text-sm leading-8 text-[var(--ink-soft)]">
            {loc.aboutBio}
          </p>

          {loc.aboutFocusText && (
            <div className="mt-5 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--flame)]">
                <User className="h-3.5 w-3.5" />
                <span>{loc.aboutFocusHeading}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-xs leading-7 text-[var(--ink-muted)]">
                {loc.aboutFocusText}
              </p>
            </div>
          )}

          <div className="mt-6 border-t border-[var(--hair)] pt-6">
            <h2 className="text-xs font-bold text-[var(--ink-muted)]">{loc.aboutConnectHeading}</h2>
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              {socialLinks.map((item) => {
                const isExternal = item.url.startsWith('http://') || item.url.startsWith('https://');
                const displayLabel = localizeSocialLabel(
                  item.label,
                  item.iconKey,
                  lang,
                  item.labelEn,
                );
                return (
                  <a
                    key={item.id}
                    href={item.url}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noopener noreferrer' : undefined}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--flame)] hover:bg-[var(--surface)]"
                  >
                    <SocialIcon iconKey={item.iconKey} className="h-4 w-4 text-[var(--flame)]" />
                    <span>{displayLabel}</span>
                  </a>
                );
              })}

              {settings.vcardEnabled !== 'false' && (
                <a
                  href="/api/save-contact"
                  className="ember-btn-flame inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-xs"
                >
                  <ContactCardMark className="h-4 w-4 shrink-0" />
                  <span>{loc.vcardButtonLabel}</span>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Unified Contact Form */}
        {showForm && (
          <section className="ember-glass rounded-3xl p-6 sm:p-8 lg:col-span-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                <Mail className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-[var(--ink)]">{loc.contactFormHeading}</h2>
            </div>

            <div className="mt-6">
              <ContactForm
                settings={settings}
                lang={lang}
                idPrefix="about-contact"
                defaultSubject={lang === 'en' ? 'Message from About page' : 'پیام از صفحه درباره من'}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
