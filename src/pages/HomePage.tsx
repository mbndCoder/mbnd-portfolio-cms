import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { HeroSection } from '../components/HeroSection.tsx';
import { HomeCardsGrid } from '../components/HomeCardsGrid.tsx';
import type { PublicSiteData, SiteLanguage } from '../types/cms.ts';

interface HomePageProps {
  data: PublicSiteData;
  lang: SiteLanguage;
}

export function HomePage({ data, lang }: HomePageProps) {
  const location = useLocation();
  const showHero = data.settings.showHeroSection !== 'false';

  useEffect(() => {
    document.title =
      lang === 'en'
        ? data.settings.brandName || 'My Portfolio'
        : data.settings.siteTitle;
  }, [data.settings.siteTitle, data.settings.brandName, lang]);

  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.replace('#', '');
      const el = document.getElementById(targetId);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 60);
      }
    }
  }, [location.hash]);

  return (
    <main id="main">
      {showHero && <HeroSection settings={data.settings} lang={lang} />}
      <HomeCardsGrid
        settings={data.settings}
        categories={data.categories}
        posts={data.posts}
        projects={data.projects}
        lang={lang}
      />
    </main>
  );
}
