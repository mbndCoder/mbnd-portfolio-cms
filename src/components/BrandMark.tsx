import type { SVGProps } from 'react';
import type { SocialIconKey } from '../types/cms.ts';

export function BrandLogo({
  src,
  alt = 'Site Logo',
  className = 'h-7 w-7',
}: {
  src?: string;
  alt?: string;
  className?: string;
}) {
  const imageSrc = src && src.trim() ? src.trim() : '/logo.webp';
  return (
    <img
      src={imageSrc}
      alt={alt}
      decoding="async"
      className={`${className} shrink-0 object-contain select-none`}
    />
  );
}

export function GitHubMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

export function TelegramMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M21 5 2 12.5l7 2.2M21 5l-2.5 14-6.5-4.3M21 5 9 14.7m0 0V19l3.3-3.2" />
    </svg>
  );
}

export function BaleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.4-4.1-1L4 20l1.1-4.1A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M9.5 10.5c0-.8.7-1.5 1.5-1.5h2a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h2.2" />
    </svg>
  );
}

export function MailMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function InstagramMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function YouTubeMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="m10 9.5 5.5 2.5-5.5 2.5v-5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AparatMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="7.4" r="1.7" />
      <circle cx="16.6" cy="12" r="1.7" />
      <circle cx="12" cy="16.6" r="1.7" />
      <circle cx="7.4" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function XMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

export function LinkedInMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 11v5M8 8v.01M12 16v-5m0 2a2.5 2.5 0 0 1 5 0v3" />
    </svg>
  );
}

export function WhatsAppMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.5 7.5L3.5 20.5l1.3-4.3a8.5 8.5 0 1 1 15.7-4.5Z" />
      <path d="M9.5 8.8c.2-.4.5-.5.8-.3l1.1.8c.2.2.3.5.1.8l-.5.8c.5.9 1.3 1.7 2.2 2.2l.8-.5c.3-.2.6-.1.8.1l.8 1.1c.2.3.1.6-.3.8-.8.5-1.9.5-3.2-.2a8.2 8.2 0 0 1-3.3-3.3c-.7-1.3-.7-2.4-.2-3.2Z" />
    </svg>
  );
}

export function EitaaMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M8 15.5c2.2-1 4.2-3 6-6.2M8.5 9.2c2.5-.3 5.2.3 7.3 1.8M11.8 16c1.8-.3 3.2-1.2 4.2-2.6" />
    </svg>
  );
}

export function RubikaMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 3.2 19.6 7.6v8.8L12 20.8l-7.6-4.4V7.6L12 3.2Z" />
      <path d="M12 12 19.6 7.6M12 12 4.4 7.6M12 12v8.8" />
    </svg>
  );
}

export function DiscordMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7.5 17.5c-1.8-.5-3.2-1.3-4-2.2.3-3.5 1.1-6.5 2.4-8.8 1.5-.8 3-1.2 4.3-1.3l.7 1.3c.7-.1 1.5-.1 2.2 0l.7-1.3c1.3.1 2.8.5 4.3 1.3 1.3 2.3 2.1 5.3 2.4 8.8-.8.9-2.2 1.7-4 2.2l-.9-1.4c-1.2.4-2.4.6-3.6.6s-2.4-.2-3.6-.6l-.9 1.4Z" />
      <circle cx="9.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function VirgoolMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="9.5" r="4.5" />
      <path d="M15.8 11.8c-.4 3.4-2.2 6.2-5.6 7.7" />
    </svg>
  );
}

export function SpotifyMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.8 9.6c2.7-.7 6.1-.5 8.7.9M8.6 12.6c2.2-.5 4.9-.3 7 .8M9.4 15.5c1.7-.4 3.7-.2 5.3.6" />
    </svg>
  );
}

export function PhoneMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export function GlobeMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18" />
    </svg>
  );
}

export function ContactCardMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9.5" cy="10.5" r="2" />
      <path d="M6.5 16c.6-1.5 1.8-2.2 3-2.2s2.4.7 3 2.2M15 9.5h3M15 13.5h3" />
    </svg>
  );
}

export function SocialIcon({
  iconKey,
  className = 'h-4 w-4',
}: {
  iconKey: SocialIconKey;
  className?: string;
}) {
  switch (iconKey) {
    case 'telegram':
      return <TelegramMark className={className} />;
    case 'email':
      return <MailMark className={className} />;
    case 'bale':
      return <BaleMark className={className} />;
    case 'github':
      return <GitHubMark className={className} />;
    case 'instagram':
      return <InstagramMark className={className} />;
    case 'youtube':
      return <YouTubeMark className={className} />;
    case 'aparat':
      return <AparatMark className={className} />;
    case 'x':
      return <XMark className={className} />;
    case 'linkedin':
      return <LinkedInMark className={className} />;
    case 'whatsapp':
      return <WhatsAppMark className={className} />;
    case 'eitaa':
      return <EitaaMark className={className} />;
    case 'rubika':
      return <RubikaMark className={className} />;
    case 'discord':
      return <DiscordMark className={className} />;
    case 'virgool':
      return <VirgoolMark className={className} />;
    case 'spotify':
      return <SpotifyMark className={className} />;
    case 'phone':
      return <PhoneMark className={className} />;
    case 'globe':
    default:
      return <GlobeMark className={className} />;
  }
}
