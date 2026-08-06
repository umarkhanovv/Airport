'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { submitFeedback, type FeedbackState } from '@/app/[locale]/contacts/actions';
import { FORM_TOKEN_FIELD, HONEYPOT_FIELD } from '@/lib/feedback/field-names';
import { LIMITS, type FeedbackErrorCode, type FeedbackField } from '@/lib/feedback/types';

const INITIAL: FeedbackState = { status: 'idle' };

const FIELD_CLASS =
  'border-border-strong bg-surface focus:ring-focus w-full rounded-md border px-3 py-2 focus:ring-2 focus:outline-none';

/**
 * Declared at module scope rather than inside the form. A component defined
 * during render is a new type on every render, so React unmounts and remounts
 * it — which would drop focus from the field a visitor is correcting.
 */
function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}

/**
 * The public feedback form (spec §9).
 *
 * A Server Action drives it, so it submits and reports errors with JavaScript
 * disabled — which matters on the connections this audience actually has. The
 * signed anti-spam token is rendered by the server for the same reason: a token
 * fetched by client script would make JavaScript mandatory to send a message.
 */
export function FeedbackForm({ locale, token }: { locale: string; token: string }) {
  const t = useTranslations('Feedback');
  const [state, action, pending] = useActionState(submitFeedback, INITIAL);

  if (state.status === 'sent') {
    return (
      <div
        role="status"
        className="border-arrival bg-arrival-soft rounded-lg border px-4 py-5 text-sm"
      >
        <p className="text-text font-medium">{t('successTitle')}</p>
        <p className="text-text-muted mt-1">{t('successBody')}</p>
      </div>
    );
  }

  const errorFor = (field: FeedbackField) =>
    state.errors?.[field] ? t(`errors.${state.errors[field] as FeedbackErrorCode}`) : null;

  const describedBy = (field: FeedbackField) =>
    state.errors?.[field] ? `${field}-error` : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name={FORM_TOKEN_FIELD} value={token} />

      {/*
        Honeypot. Hidden from sight and from assistive technology, skipped by
        the tab order, and excluded from autofill — so no person fills it in,
        and a bot that fills every field gives itself away.
      */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={HONEYPOT_FIELD}>Website</label>
        <input
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {state.formError ? (
        <p role="alert" id="feedback-form-error" className="text-sm text-red-700 dark:text-red-400">
          {t(`errors.${state.formError}`)}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            {t('name')}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={LIMITS.name.max}
            autoComplete="name"
            aria-invalid={state.errors?.name ? true : undefined}
            aria-describedby={describedBy('name')}
            className={FIELD_CLASS}
          />
          <FieldError id="name-error" message={errorFor('name')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            {t('email')} <span className="text-text-muted font-normal">({t('optionalHint')})</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={LIMITS.email.max}
            autoComplete="email"
            aria-invalid={state.errors?.email ? true : undefined}
            aria-describedby={describedBy('email')}
            className={FIELD_CLASS}
          />
          <FieldError id="email-error" message={errorFor('email')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium">
            {t('phone')} <span className="text-text-muted font-normal">({t('optionalHint')})</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            maxLength={LIMITS.phone.max}
            autoComplete="tel"
            aria-invalid={state.errors?.phone ? true : undefined}
            aria-describedby={describedBy('phone')}
            className={FIELD_CLASS}
          />
          <FieldError id="phone-error" message={errorFor('phone')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="subject" className="text-sm font-medium">
            {t('subject')}{' '}
            <span className="text-text-muted font-normal">({t('optionalHint')})</span>
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            maxLength={LIMITS.subject.max}
            aria-invalid={state.errors?.subject ? true : undefined}
            aria-describedby={describedBy('subject')}
            className={FIELD_CLASS}
          />
          <FieldError id="subject-error" message={errorFor('subject')} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-sm font-medium">
          {t('message')}
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={LIMITS.message.max}
          aria-invalid={state.errors?.message ? true : undefined}
          aria-describedby={describedBy('message')}
          className={FIELD_CLASS}
        />
        <FieldError id="message-error" message={errorFor('message')} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-on-brand focus:ring-focus self-start rounded-md px-5 py-2.5 font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
      >
        {pending ? t('sending') : t('submit')}
      </button>
    </form>
  );
}
