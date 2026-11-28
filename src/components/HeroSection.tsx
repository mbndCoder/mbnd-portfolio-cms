import { useEffect, useMemo, useRef, useState } from 'react';
import { getLocalizedSettingsText, localizeSocialLabel } from '../lib/i18n.ts';
import type { SiteLanguage, SiteSettings, SocialPlatformLink } from '../types/cms.ts';
import { ContactCardMark, SocialIcon } from './BrandMark.tsx';

interface HeroSectionProps {
  settings: SiteSettings;
  lang: SiteLanguage;
}

export function parseClientSocialLinks(
  jsonStr: string,
  settings: SiteSettings,
): SocialPlatformLink[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(
        (item): item is SocialPlatformLink =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.label === 'string' &&
          typeof item.url === 'string' &&
          item.enabled !== false,
      );
      if (valid.length > 0) return valid;
    }
  } catch {
    // fallback below
  }

  const fallback: SocialPlatformLink[] = [];
  if (settings.telegramUrl) {
    fallback.push({
      id: 'telegram',
      label: 'تلگرام',
      labelEn: 'Telegram',
      handle: settings.telegramHandle || '',
      url: settings.telegramUrl,
      iconKey: 'telegram',
      enabled: true,
    });
  }
  if (settings.email) {
    fallback.push({
      id: 'email',
      label: 'ایمیل',
      labelEn: 'Email',
      handle: settings.email,
      url: `mailto:${settings.email}`,
      iconKey: 'email',
      enabled: true,
    });
  }
  return fallback;
}

export function HeroSection({ settings, lang }: HeroSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgLayerRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );
  const [inView, setInView] = useState(true);
  const [shouldAttachVideo, setShouldAttachVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const loc = getLocalizedSettingsText(settings, lang);

  const desktopPoster = settings.heroPosterDesktop?.trim() || '/poster.webp';
  const mobilePoster = settings.heroPosterMobile?.trim() || desktopPoster || '/poster-mobile.webp';
  const desktopVideo = settings.heroVideoDesktop?.trim() ?? '/hero-loop.mp4';
  const mobileVideo = settings.heroVideoMobile?.trim() ?? desktopVideo;

  const videoEnabled = settings.heroVideoEnabled !== 'false';
  const activeVideoSrc = videoEnabled ? (isMobile ? mobileVideo : desktopVideo) : '';
  const activePosterSrc = isMobile ? mobilePoster : desktopPoster;

  const socialLinks = useMemo(
    () => parseClientSocialLinks(settings.socialLinksJson, settings),
    [settings],
  );

  // Sync mobile portrait vs desktop landscape breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => {
      setVideoReady(false);
      setIsMobile(mq.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Slow-net optimization: paint lightweight WebP poster first; skip heavy video on 2g / Save-Data / reduced-motion
  useEffect(() => {
    if (!activeVideoSrc) {
      setShouldAttachVideo(false);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    if (
      nav.connection?.saveData ||
      nav.connection?.effectiveType === '2g' ||
      nav.connection?.effectiveType === 'slow-2g'
    ) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const attach = () => setShouldAttachVideo(true);

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(attach, { timeout: 900 });
      return () => window.cancelIdleCallback(idleId);
    }

    timer = setTimeout(attach, 450);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [activeVideoSrc]);

  // Single-purpose IntersectionObserver: ONLY track visibility (prevents duplicate load/abort race)
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setInView(entries.some((entry) => entry.isIntersecting));
      },
      { threshold: 0.05 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Single-source-of-truth video playback controller
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!shouldAttachVideo || !activeVideoSrc) {
      video.pause();
      setVideoReady(false);
      return;
    }

    if (inView) {
      const currentSrc = video.getAttribute('data-loaded-src') || '';
      if (currentSrc !== activeVideoSrc) {
        setVideoReady(false);
        video.setAttribute('data-loaded-src', activeVideoSrc);
        video.src = activeVideoSrc;
        video.poster = activePosterSrc;
        video.load();
      } else if (video.readyState >= 2) {
        setVideoReady(true);
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [activeVideoSrc, activePosterSrc, inView, shouldAttachVideo]);

  // Subtle GPU parallax on desktop pointer move
  useEffect(() => {
    const section = sectionRef.current;
    const layer = bgLayerRef.current;
    if (!section || !layer) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const onMove = (event: PointerEvent) => {
      const rect = section.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      layer.style.transform = `translate3d(${(nx * -10).toFixed(1)}px, ${(ny * -7).toFixed(1)}px, 0) scale(1.04)`;
    };

    const onLeave = () => {
      layer.style.transform = 'translate3d(0px, 0px, 0) scale(1.02)';
    };

    section.addEventListener('pointermove', onMove, { passive: true });
    section.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label={lang === 'en' ? 'Introduction' : 'معرفی'}
      className="relative isolate flex min-h-[62svh] items-center overflow-hidden bg-[#0E0E0E] sm:min-h-[66svh]"
    >
      {/* Layer 1: Lightweight WebP Poster First (instant paint on slow connections) + Smooth Video Fade-in */}
      <div
        ref={bgLayerRef}
        className="pointer-events-none absolute inset-0 -z-20 transition-transform duration-500 ease-out will-change-transform"
        style={{ transform: 'scale(1.02)' }}
      >
        <picture className="absolute inset-0 h-full w-full">
          {mobilePoster && <source media="(max-width: 767px)" srcSet={mobilePoster} />}
          <img
            src={desktopPoster}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="sync"
            className="h-full w-full object-cover object-center"
          />
        </picture>

        {videoEnabled && activeVideoSrc && (
          <video
            ref={videoRef}
            poster={activePosterSrc}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            onCanPlay={() => setVideoReady(true)}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[1400ms] ease-out ${
              videoReady ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
      </div>

      {/* Atmospheric Layering */}
      <div aria-hidden="true" className="hero-brand-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden="true" className="hero-noise pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden="true" className="hero-scrim-rtl pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="max-w-xl">
          <h1 className="text-3xl font-extrabold leading-[1.3] tracking-tight text-[#FBEFDD] [text-shadow:0_2px_20px_rgba(0,0,0,0.68)] [text-wrap:balance] sm:text-5xl">
            {loc.heroTitle}
          </h1>

          <p className="mt-4 text-base leading-8 text-[#FBEFDD]/92 [text-shadow:0_1px_14px_rgba(0,0,0,0.75)] sm:text-lg">
            {loc.heroSubtitle}
          </p>

          {/* Compact Direct Connect Buttons + Instant vCard */}
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
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
                  aria-label={`${displayLabel}: ${item.handle || item.url}`}
                  title={item.handle ? `${displayLabel} (${item.handle})` : displayLabel}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#FBEFDD]/20 bg-[#121212]/80 px-4 text-xs font-medium text-[#FBEFDD] backdrop-blur-[12px] transition-all hover:-translate-y-0.5 hover:border-[var(--flame)] hover:bg-[#181818]"
                >
                  <SocialIcon iconKey={item.iconKey} className="h-4 w-4 text-[var(--flame)]" />
                  <span>{displayLabel}</span>
                </a>
              );
            })}

            {settings.vcardEnabled !== 'false' && (
              <a
                href="/api/save-contact"
                className="ember-btn-flame inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-xs"
              >
                <ContactCardMark className="h-4 w-4 shrink-0" />
                <span>{loc.vcardButtonLabel}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
