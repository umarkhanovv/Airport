'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { NEWS_LIMITS, type NewsErrorField } from '@/lib/news/validate';

import { saveNewsPost, type NewsFormState } from './actions';

const INITIAL: NewsFormState = {};

const FIELD_CLASS =
  'border-border-strong bg-surface focus:ring-focus w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none';

/** The catalogue key for each language's own name, so the list is translated. */
const LOCALE_KEYS = { ru: 'langRu', en: 'langEn', kk: 'langKk' } as const;

/** Only these fields have a length limit; the rest resolve `{max}` to nothing. */
const LIMITS: Partial<Record<NewsErrorField, number>> = {
  title: NEWS_LIMITS.title.max,
  excerpt: NEWS_LIMITS.excerpt.max,
  body: NEWS_LIMITS.body.max,
  coverAlt: NEWS_LIMITS.coverAlt.max,
};

/**
 * Declared at module scope, not inside the form: a component defined during
 * render is a new type on every render, so React remounts it and the field
 * being corrected loses focus.
 */
function FieldError({ field, message }: { field: NewsErrorField; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${field}-error`} className="text-sm text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}

export interface ExistingPost {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  body: string;
  coverImage: string | null;
  coverAlt: string | null;
  publishedAt: string;
  isPublished: boolean;
}

export interface TranslationCandidate {
  id: string;
  title: string;
  locale: string;
  translationGroupId: string;
}

/**
 * The news editor (spec §7, plan §9.1).
 *
 * A Server Action drives it, so it works without client scripting, and every
 * value the editor typed is echoed back on a validation failure — a post is not
 * a two-line message, and losing one to a mistyped date would teach staff to
 * draft it somewhere else and paste it in.
 *
 * The body is Markdown, rendered on the public site by the same pipeline as the
 * migrated static pages. There is no rich-text editor: one would have to be
 * trusted to produce safe HTML, and the point of storing Markdown is that it
 * never has to be.
 */
export function PostForm({
  post,
  candidates,
  currentTranslationGroupId,
  today,
}: {
  post?: ExistingPost;
  candidates: TranslationCandidate[];
  currentTranslationGroupId?: string;
  /**
   * Today's date at the airport, computed on the server.
   *
   * This used to be `new Date().toISOString().slice(0, 10)` right here — the
   * pattern `lib/date.ts` bans in its opening comment, and for exactly the
   * reason given there. Between 19:00 and midnight in Türkistan, UTC is still
   * on the previous day, so the form offered yesterday as the publication date
   * of an announcement being written tonight.
   *
   * A prop rather than a client-side `airportToday()`, so the answer does not
   * depend on the clock of whichever machine the staff member is sitting at.
   */
  today: string;
}) {
  const [state, action, pending] = useActionState(saveNewsPost, INITIAL);
  const t = useTranslations('Admin.news');

  const values = state.values;
  const describedBy = (field: NewsErrorField) =>
    state.errors?.[field] ? `${field}-error` : undefined;

  /*
   * A field's error, resolved from its key.
   *
   * The validator has no locale and says only what went wrong; the wording and
   * the numbers in it arrive here. `max` comes from `NEWS_LIMITS` rather than
   * being sent along with the key — the form already imports the limits to
   * enforce them in the browser, and two copies of a constant is one too many.
   */
  const message = (field: NewsErrorField) => {
    const key = state.errors?.[field];
    if (!key) return undefined;
    return t(key, { max: LIMITS[field] ?? 0, ...state.errorParams?.[field] });
  };

  const localeName = (locale: string) =>
    locale in LOCALE_KEYS ? t(LOCALE_KEYS[locale as keyof typeof LOCALE_KEYS]) : locale;

  // The date input wants `YYYY-MM-DD`; the column holds a full ISO instant.
  const dateValue = values?.publishedAt ?? post?.publishedAt.slice(0, 10) ?? today;

  const linkedCandidate = candidates.find(
    (candidate) => candidate.translationGroupId === currentTranslationGroupId
  );

  return (
    <form action={action} encType="multipart/form-data" className="mt-6 flex flex-col gap-5">
      {post ? <input type="hidden" name="id" value={post.id} /> : null}

      {state.errorKey ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(state.errorKey)}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="locale" className="text-sm font-medium">
            {t('language')}
          </label>
          {post ? (
            <>
              {/*
                Fixed after creation. The language is part of the post's address,
                and a published URL is a promise — a story in another language is
                a new post, linked to this one below.
              */}
              <p id="locale" className="text-text-muted py-2 text-sm">
                {localeName(post.locale)} · <code>/news/{post.slug}</code>
              </p>
              <p className="text-text-muted text-xs">{t('languageFixed')}</p>
            </>
          ) : (
            <select
              id="locale"
              name="locale"
              defaultValue={values?.locale || 'ru'}
              aria-invalid={state.errors?.locale ? true : undefined}
              aria-describedby={describedBy('locale')}
              className={FIELD_CLASS}
            >
              <option value="ru">{t('langRu')}</option>
              <option value="en">{t('langEn')}</option>
              <option value="kk">{t('langKk')}</option>
            </select>
          )}
          <FieldError field="locale" message={message('locale')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="publishedAt" className="text-sm font-medium">
            {t('publicationDate')}
          </label>
          <input
            id="publishedAt"
            name="publishedAt"
            type="date"
            required
            defaultValue={dateValue}
            aria-invalid={state.errors?.publishedAt ? true : undefined}
            aria-describedby={describedBy('publishedAt')}
            className={FIELD_CLASS}
          />
          <FieldError field="publishedAt" message={message('publishedAt')} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          {t('headline')}
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={NEWS_LIMITS.title.max}
          defaultValue={values?.title ?? post?.title ?? ''}
          aria-invalid={state.errors?.title ? true : undefined}
          aria-describedby={describedBy('title')}
          className={FIELD_CLASS}
        />
        <FieldError field="title" message={message('title')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="excerpt" className="text-sm font-medium">
          {t('summary')} <span className="text-text-muted font-normal">{t('optional')}</span>
        </label>
        <textarea
          id="excerpt"
          name="excerpt"
          rows={2}
          maxLength={NEWS_LIMITS.excerpt.max}
          defaultValue={values?.excerpt ?? post?.excerpt ?? ''}
          aria-invalid={state.errors?.excerpt ? true : undefined}
          aria-describedby={describedBy('excerpt')}
          className={FIELD_CLASS}
        />
        <p className="text-text-muted text-xs">{t('summaryHint')}</p>
        <FieldError field="excerpt" message={message('excerpt')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body" className="text-sm font-medium">
          {t('text')}
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={18}
          maxLength={NEWS_LIMITS.body.max}
          defaultValue={values?.body ?? post?.body ?? ''}
          aria-invalid={state.errors?.body ? true : undefined}
          aria-describedby={describedBy('body')}
          className={`${FIELD_CLASS} font-mono`}
        />
        {/* The markers themselves are part of the sentence, so they travel with
            it into the catalogue rather than being spliced around it. */}
        <p className="text-text-muted text-xs">
          {t.rich('markdownHint', { code: (chunks) => <code>{chunks}</code> })}
        </p>
        <FieldError field="body" message={message('body')} />
      </div>

      <fieldset className="panel p-4">
        <legend className="px-1 text-sm font-medium">{t('coverImage')}</legend>

        {post?.coverImage ? (
          <div className="flex flex-wrap items-center gap-4">
            {/*
              Plain img, not next/image: this is one admin screen behind a login,
              and routing it through the optimiser would buy nothing.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/news/image/${post.coverImage}`}
              alt={post.coverAlt ?? ''}
              width={160}
              height={100}
              className="border-border h-[100px] w-[160px] rounded border object-cover"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeCover" className="size-4" />
              {t('removeImage')}
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="cover" className="text-sm font-medium">
            {post?.coverImage ? t('coverReplace') : t('coverUpload')}
          </label>
          <input
            id="cover"
            name="cover"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            aria-invalid={state.errors?.cover ? true : undefined}
            aria-describedby={describedBy('cover')}
            className={FIELD_CLASS}
          />
          <FieldError field="cover" message={message('cover')} />
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="coverAlt" className="text-sm font-medium">
            {t('imageDescription')}
          </label>
          <input
            id="coverAlt"
            name="coverAlt"
            type="text"
            maxLength={NEWS_LIMITS.coverAlt.max}
            defaultValue={values?.coverAlt ?? post?.coverAlt ?? ''}
            aria-invalid={state.errors?.coverAlt ? true : undefined}
            aria-describedby={describedBy('coverAlt')}
            className={FIELD_CLASS}
          />
          <p className="text-text-muted text-xs">{t('imageDescriptionHint')}</p>
          <FieldError field="coverAlt" message={message('coverAlt')} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="translationOf" className="text-sm font-medium">
          {t('translationOf')} <span className="text-text-muted font-normal">{t('optional')}</span>
        </label>
        <select
          id="translationOf"
          name="translationOf"
          defaultValue={values?.translationOf ?? linkedCandidate?.id ?? ''}
          className={FIELD_CLASS}
        >
          <option value="">{t('notATranslation')}</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              [{localeName(candidate.locale)}] {candidate.title}
            </option>
          ))}
        </select>
        <p className="text-text-muted text-xs">{t('translationHint')}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPublished"
          defaultChecked={values ? values.isPublished : (post?.isPublished ?? false)}
          className="size-4"
        />
        {t('publishedCheckbox')}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-on-brand focus:ring-focus self-start rounded-md px-5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
      >
        {pending ? t('saving') : post ? t('save') : t('create')}
      </button>
    </form>
  );
}
