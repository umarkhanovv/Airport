import {
  LIMITS,
  type FeedbackErrors,
  type FeedbackInput,
  type FeedbackLocale,
  type ValidationResult,
} from './types.ts';

/**
 * Feedback field validation.
 *
 * Deliberately dependency-free and free of `server-only`, so it is a plain
 * function over plain data and can be tested without a request, a database or
 * a running server.
 */

const LOCALES: readonly FeedbackLocale[] = ['ru', 'en', 'kk'];

/**
 * Permissive on purpose. The job is to catch a typo like `name@` before it is
 * stored as the only way of replying to someone — not to adjudicate RFC 5322.
 * Over-strict address regexes reject real addresses, and the cost of a false
 * rejection here is a member of the public who cannot report a problem.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Trims, collapses inner runs of whitespace, and normalises "" to null. */
function clean(raw: FormDataEntryValue | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}

/** As `clean`, but newlines survive — a message is allowed paragraphs. */
function cleanMultiline(raw: FormDataEntryValue | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
  return trimmed === '' ? null : trimmed;
}

export function isFeedbackLocale(value: unknown): value is FeedbackLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Validates one submission.
 *
 * Every field is reported at once rather than failing on the first problem, so
 * someone who got two things wrong is told both instead of discovering them one
 * round trip at a time.
 */
export function validateFeedback(form: {
  name?: FormDataEntryValue | null;
  email?: FormDataEntryValue | null;
  phone?: FormDataEntryValue | null;
  subject?: FormDataEntryValue | null;
  message?: FormDataEntryValue | null;
  locale?: FormDataEntryValue | null;
}): ValidationResult {
  const errors: FeedbackErrors = {};

  const name = clean(form.name);
  if (name === null) errors.name = 'required';
  else if (name.length < LIMITS.name.min) errors.name = 'tooShort';
  else if (name.length > LIMITS.name.max) errors.name = 'tooLong';

  const email = clean(form.email);
  if (email !== null) {
    if (email.length > LIMITS.email.max) errors.email = 'tooLong';
    else if (!EMAIL_RE.test(email)) errors.email = 'invalidEmail';
  }

  const phone = clean(form.phone);
  if (phone !== null && phone.length > LIMITS.phone.max) errors.phone = 'tooLong';

  const subject = clean(form.subject);
  if (subject !== null && subject.length > LIMITS.subject.max) errors.subject = 'tooLong';

  const message = cleanMultiline(form.message);
  if (message === null) errors.message = 'required';
  else if (message.length < LIMITS.message.min) errors.message = 'tooShort';
  else if (message.length > LIMITS.message.max) errors.message = 'tooLong';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const value: FeedbackInput = {
    name: name!,
    email,
    phone,
    subject,
    message: message!,
    // The locale comes from the route segment, not from the visitor. An
    // unrecognised value means a hand-built request, and Russian is the
    // airport's default language.
    locale: isFeedbackLocale(form.locale) ? form.locale : 'ru',
  };

  return { ok: true, value };
}
