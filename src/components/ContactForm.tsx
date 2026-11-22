import { CheckCircle2, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getLocalizedSettingsText, getUiDict } from '../lib/i18n.ts';
import type { SiteLanguage, SiteSettings } from '../types/cms.ts';

interface ContactFormProps {
  settings: SiteSettings;
  lang: SiteLanguage;
  idPrefix: string;
  compact?: boolean;
  defaultSubject?: string;
}

export function ContactForm({
  settings,
  lang,
  idPrefix,
  compact = false,
  defaultSubject,
}: ContactFormProps) {
  const t = getUiDict(lang);
  const loc = getLocalizedSettingsText(settings, lang);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess(false);

    if (name.trim().length < 2) {
      setSubmitError(t.contactErrName);
      return;
    }
    if (!email.trim().includes('@')) {
      setSubmitError(t.contactErrEmail);
      return;
    }
    if (message.trim().length < 5) {
      setSubmitError(t.contactErrMessage);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contact: email.trim(),
          subject: subject.trim() || defaultSubject || (lang === 'en' ? 'Website message' : 'پیام از سایت'),
          message: message.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setSubmitError(data.error || t.contactErrFailed);
        return;
      }
      setSubmitSuccess(true);
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch {
      setSubmitError(t.contactErrNetwork);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className={compact ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
        <div>
          <label
            htmlFor={`${idPrefix}-name`}
            className="mb-1 block text-xs text-[var(--ink-soft)]"
          >
            {t.contactNameLabel}
          </label>
          <input
            id={`${idPrefix}-name`}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.contactNamePlaceholder}
            className={`theme-input w-full rounded-xl px-3.5 text-xs ${compact ? 'py-2' : 'py-2.5'}`}
          />
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-email`}
            className="mb-1 block text-xs text-[var(--ink-soft)]"
          >
            {t.contactEmailLabel}
          </label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className={`theme-input w-full rounded-xl px-3.5 text-xs ${compact ? 'py-2' : 'py-2.5'}`}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-subject`}
          className="mb-1 block text-xs text-[var(--ink-soft)]"
        >
          {t.contactSubjectLabel}
        </label>
        <input
          id={`${idPrefix}-subject`}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t.contactSubjectPlaceholder}
          className={`theme-input w-full rounded-xl px-3.5 text-xs ${compact ? 'py-2' : 'py-2.5'}`}
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-message`}
          className="mb-1 block text-xs text-[var(--ink-soft)]"
        >
          {t.contactMessageLabel}
        </label>
        <textarea
          id={`${idPrefix}-message`}
          rows={compact ? 3 : 5}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.contactMessagePlaceholder}
          className={`theme-input w-full rounded-xl px-3.5 text-xs leading-6 ${compact ? 'py-2' : 'py-2.5 leading-7'}`}
        />
      </div>

      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/35 bg-red-500/12 px-3 py-2 text-xs text-[var(--status-error-ink)]"
        >
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/12 px-3 py-2 text-xs text-[var(--status-success-ink)]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{loc.contactSuccessMessage}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={`ember-btn-flame inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl text-xs disabled:opacity-60 ${
          compact ? 'py-2.5' : 'py-3'
        }`}
      >
        <Send className="h-3.5 w-3.5" />
        <span>{submitting ? t.contactSending : t.contactSend}</span>
      </button>
    </form>
  );
}
