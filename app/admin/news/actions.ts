'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { assertSameOrigin, requireAdmin } from '@/lib/admin/auth';
import {
  createNewsPost,
  deleteNewsPost,
  getNewsPostById,
  setNewsPublished,
  updateNewsPost,
} from '@/lib/news/admin';
import { ImageRejectedError, MAX_COVER_BYTES, storeNewsCover } from '@/lib/news/images';
import { validateNewsPost, type NewsErrorField, type NewsErrors } from '@/lib/news/validate';

/** What the editor typed, echoed back so a rejected form is not a lost draft. */
export interface NewsFormValues {
  locale: string;
  title: string;
  excerpt: string;
  body: string;
  publishedAt: string;
  isPublished: boolean;
  coverAlt: string;
  translationOf: string;
}

export interface NewsFormState {
  errors?: NewsErrors;
  /**
   * Values for the two field messages that interpolate one — the size in an
   * over-large image, so far. Keyed by field, merged with the length limits
   * the form already knows about when the message is finally resolved.
   */
  errorParams?: Partial<Record<NewsErrorField, Record<string, string | number>>>;
  /** A failure that belongs to the form rather than to one field. */
  errorKey?: 'errorPostGone';
  values?: NewsFormValues;
}

const text = (value: FormDataEntryValue | null): string => (typeof value === 'string' ? value : '');

/**
 * Reads the form back out.
 *
 * A validation failure re-renders the page when scripting is off, and a post is
 * not a two-line message — losing a press release to a mistyped date would
 * teach staff to write it somewhere else first.
 */
function submittedValues(formData: FormData): NewsFormValues {
  return {
    locale: text(formData.get('locale')),
    title: text(formData.get('title')),
    excerpt: text(formData.get('excerpt')),
    body: text(formData.get('body')),
    publishedAt: text(formData.get('publishedAt')),
    isPublished: formData.get('isPublished') === 'on',
    coverAlt: text(formData.get('coverAlt')),
    translationOf: text(formData.get('translationOf')),
  };
}

/**
 * Refreshes the public pages that read news.
 *
 * The list and the detail pages are statically generated from published posts,
 * so nothing an editor does appears until they are revalidated — including a
 * post being *unpublished*, which is the case that matters: taking an
 * announcement down has to take it down.
 *
 * The home page is on this list too, and was missing from it. It grew a
 * three-newest-stories block in the last wave and nobody came back here, so
 * publishing an announcement left the front page — the most-read page on the
 * site — showing the previous three until its own 60-second window elapsed.
 * Sixty seconds is not a catastrophe, but an editor who publishes something
 * and then looks at the home page to check should see it there.
 */
function revalidatePublicNews(): void {
  revalidatePath('/[locale]/news', 'page');
  revalidatePath('/[locale]/news/[slug]', 'page');
  revalidatePath('/[locale]', 'page');
}

/**
 * Creates or updates a post.
 *
 * One action for both, because the form is the same form: splitting them would
 * duplicate the validation, the image handling and the error shape in order to
 * differ by one database call.
 */
export async function saveNewsPost(
  _state: NewsFormState,
  formData: FormData
): Promise<NewsFormState> {
  await requireAdmin();
  await assertSameOrigin();

  const values = submittedValues(formData);

  const rawId = formData.get('id');
  const id = typeof rawId === 'string' && rawId !== '' ? rawId : null;
  const existing = id ? getNewsPostById(id) : null;

  if (id && !existing) return { errorKey: 'errorPostGone', values };

  const file = formData.get('cover');
  const uploaded = file instanceof File && file.size > 0 ? file : null;
  const removeCover = formData.get('removeCover') === 'on';

  // Checked before the stream is read, so an oversized image is refused without
  // being buffered into memory first.
  if (uploaded && uploaded.size > MAX_COVER_BYTES) {
    return {
      values,
      errors: { cover: 'errorImageTooLarge' },
      errorParams: { cover: { size: (uploaded.size / 1024 / 1024).toFixed(1) } },
    };
  }

  const willHaveCover = uploaded !== null || (!removeCover && Boolean(existing?.coverImage));

  const result = validateNewsPost(
    {
      locale: existing ? existing.locale : formData.get('locale'),
      title: formData.get('title'),
      excerpt: formData.get('excerpt'),
      body: formData.get('body'),
      publishedAt: formData.get('publishedAt'),
      isPublished: formData.get('isPublished'),
      coverAlt: formData.get('coverAlt'),
      translationOf: formData.get('translationOf'),
    },
    { hasCover: willHaveCover }
  );

  if (!result.ok) return { errors: result.errors, values };

  // Stored only after validation passes, so a rejected form never leaves a file
  // behind that no row will ever point at.
  let storedCover: string | null | undefined;
  if (uploaded) {
    try {
      storedCover = storeNewsCover(Buffer.from(await uploaded.arrayBuffer()));
    } catch (error) {
      if (error instanceof ImageRejectedError) {
        return { errors: { cover: error.code }, errorParams: { cover: error.params }, values };
      }
      throw error;
    }
  } else if (removeCover) {
    storedCover = null;
  }

  if (existing) {
    updateNewsPost(existing.id, result.value, storedCover);
  } else {
    createNewsPost(result.value, storedCover ?? null);
  }

  revalidatePublicNews();
  redirect('/admin/news?saved=1');
}

export async function toggleNewsPublished(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  const publish = formData.get('publish');
  if (typeof id !== 'string') return;

  setNewsPublished(id, publish === 'true');
  revalidatePublicNews();

  redirect('/admin/news');
}

/**
 * Deletes a post outright.
 *
 * There is no soft delete and no undo, so the form that calls this asks for the
 * headline to be typed back — see `delete-form.tsx`. Unpublishing is the
 * reversible action, and it is one click away in the same row.
 */
export async function deleteNewsPostAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  if (typeof id !== 'string') return;

  const post = getNewsPostById(id);
  const typed = formData.get('confirmTitle');

  // The confirmation is checked on the server, not only in the browser: this is
  // the request that destroys the row.
  if (!post || typeof typed !== 'string' || typed.trim() !== post.title) {
    redirect(`/admin/news/${encodeURIComponent(id)}?confirm=mismatch`);
  }

  deleteNewsPost(id);
  revalidatePublicNews();

  redirect('/admin/news?deleted=1');
}
