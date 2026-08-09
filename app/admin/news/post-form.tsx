'use client';

import { useActionState } from 'react';

import { NEWS_LIMITS, type NewsErrorField } from '@/lib/news/validate';

import { saveNewsPost, type NewsFormState } from './actions';

const INITIAL: NewsFormState = {};

const FIELD_CLASS =
  'border-border-strong bg-surface focus:ring-focus w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none';

const LOCALE_LABELS: Record<string, string> = {
  ru: 'Russian',
  en: 'English',
  kk: 'Kazakh',
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
}: {
  post?: ExistingPost;
  candidates: TranslationCandidate[];
  currentTranslationGroupId?: string;
}) {
  const [state, action, pending] = useActionState(saveNewsPost, INITIAL);

  const values = state.values;
  const error = (field: NewsErrorField) => state.errors?.[field];
  const describedBy = (field: NewsErrorField) => (error(field) ? `${field}-error` : undefined);

  // The date input wants `YYYY-MM-DD`; the column holds a full ISO instant.
  const dateValue = values?.publishedAt ?? post?.publishedAt.slice(0, 10) ?? today();

  const linkedCandidate = candidates.find(
    (candidate) => candidate.translationGroupId === currentTranslationGroupId
  );

  return (
    <form action={action} encType="multipart/form-data" className="mt-6 flex flex-col gap-5">
      {post ? <input type="hidden" name="id" value={post.id} /> : null}

      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="locale" className="text-sm font-medium">
            Language
          </label>
          {post ? (
            <>
              {/*
                Fixed after creation. The language is part of the post's address,
                and a published URL is a promise — a story in another language is
                a new post, linked to this one below.
              */}
              <p id="locale" className="text-text-muted py-2 text-sm">
                {LOCALE_LABELS[post.locale] ?? post.locale} · <code>/news/{post.slug}</code>
              </p>
              <p className="text-text-muted text-xs">
                The language and the address are fixed once a post exists, so links to it keep
                working.
              </p>
            </>
          ) : (
            <select
              id="locale"
              name="locale"
              defaultValue={values?.locale || 'ru'}
              aria-invalid={error('locale') ? true : undefined}
              aria-describedby={describedBy('locale')}
              className={FIELD_CLASS}
            >
              <option value="ru">Russian</option>
              <option value="en">English</option>
              <option value="kk">Kazakh</option>
            </select>
          )}
          <FieldError field="locale" message={error('locale')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="publishedAt" className="text-sm font-medium">
            Publication date
          </label>
          <input
            id="publishedAt"
            name="publishedAt"
            type="date"
            required
            defaultValue={dateValue}
            aria-invalid={error('publishedAt') ? true : undefined}
            aria-describedby={describedBy('publishedAt')}
            className={FIELD_CLASS}
          />
          <FieldError field="publishedAt" message={error('publishedAt')} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Headline
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={NEWS_LIMITS.title.max}
          defaultValue={values?.title ?? post?.title ?? ''}
          aria-invalid={error('title') ? true : undefined}
          aria-describedby={describedBy('title')}
          className={FIELD_CLASS}
        />
        <FieldError field="title" message={error('title')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="excerpt" className="text-sm font-medium">
          Summary <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="excerpt"
          name="excerpt"
          rows={2}
          maxLength={NEWS_LIMITS.excerpt.max}
          defaultValue={values?.excerpt ?? post?.excerpt ?? ''}
          aria-invalid={error('excerpt') ? true : undefined}
          aria-describedby={describedBy('excerpt')}
          className={FIELD_CLASS}
        />
        <p className="text-text-muted text-xs">
          Shown in the news list and to search engines. Left empty, the list shows the headline
          alone.
        </p>
        <FieldError field="excerpt" message={error('excerpt')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body" className="text-sm font-medium">
          Text
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={18}
          maxLength={NEWS_LIMITS.body.max}
          defaultValue={values?.body ?? post?.body ?? ''}
          aria-invalid={error('body') ? true : undefined}
          aria-describedby={describedBy('body')}
          className={`${FIELD_CLASS} font-mono`}
        />
        <p className="text-text-muted text-xs">
          Markdown. A blank line starts a paragraph; <code>## </code> makes a heading,{' '}
          <code>- </code> a list item, and <code>[text](https://…)</code> a link.
        </p>
        <FieldError field="body" message={error('body')} />
      </div>

      <fieldset className="panel p-4">
        <legend className="px-1 text-sm font-medium">Cover image</legend>

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
              Remove this image
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="cover" className="text-sm font-medium">
            {post?.coverImage ? 'Replace with' : 'Upload'} a JPEG, PNG, WebP or AVIF (max 2 MB)
          </label>
          <input
            id="cover"
            name="cover"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            aria-invalid={error('cover') ? true : undefined}
            aria-describedby={describedBy('cover')}
            className={FIELD_CLASS}
          />
          <FieldError field="cover" message={error('cover')} />
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="coverAlt" className="text-sm font-medium">
            Image description
          </label>
          <input
            id="coverAlt"
            name="coverAlt"
            type="text"
            maxLength={NEWS_LIMITS.coverAlt.max}
            defaultValue={values?.coverAlt ?? post?.coverAlt ?? ''}
            aria-invalid={error('coverAlt') ? true : undefined}
            aria-describedby={describedBy('coverAlt')}
            className={FIELD_CLASS}
          />
          <p className="text-text-muted text-xs">
            Required when there is an image: it is what a screen reader announces, and what shows if
            the picture fails to load. Describe what it shows, not that it is a photograph.
          </p>
          <FieldError field="coverAlt" message={error('coverAlt')} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="translationOf" className="text-sm font-medium">
          Same story in another language{' '}
          <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <select
          id="translationOf"
          name="translationOf"
          defaultValue={values?.translationOf ?? linkedCandidate?.id ?? ''}
          className={FIELD_CLASS}
        >
          <option value="">Not a translation of anything</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              [{LOCALE_LABELS[candidate.locale] ?? candidate.locale}] {candidate.title}
            </option>
          ))}
        </select>
        <p className="text-text-muted text-xs">
          Linked posts point at each other on the public site, so a reader who opens the wrong
          language is told where the right one is.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPublished"
          defaultChecked={values ? values.isPublished : (post?.isPublished ?? false)}
          className="size-4"
        />
        Published — visible on the public site
      </label>

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-on-brand focus:ring-focus self-start rounded-md px-5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
      >
        {pending ? 'Saving…' : post ? 'Save changes' : 'Create post'}
      </button>
    </form>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
