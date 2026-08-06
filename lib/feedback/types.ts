/**
 * The feedback contract (spec §9, plan §3.3).
 *
 * Validation returns error *codes*, never sentences. The form is rendered in
 * three languages, so the message a visitor reads has to come from the
 * translation catalogue — a validator that returned English prose would quietly
 * make the Kazakh and Russian forms half-English the first time someone made a
 * mistake.
 */

export type FeedbackLocale = 'ru' | 'en' | 'kk';

export type FeedbackField = 'name' | 'email' | 'phone' | 'subject' | 'message';

export type FeedbackErrorCode = 'required' | 'tooShort' | 'tooLong' | 'invalidEmail';

export type FeedbackErrors = Partial<Record<FeedbackField, FeedbackErrorCode>>;

/**
 * Length caps (plan §9.1).
 *
 * These bound what an unauthenticated stranger can write into the airport's
 * database. The message cap is generous — someone with a real complaint should
 * not be truncated — but it is a cap.
 */
export const LIMITS = {
  name: { min: 2, max: 120 },
  email: { max: 254 },
  phone: { max: 40 },
  subject: { max: 200 },
  message: { min: 10, max: 5000 },
} as const;

export interface FeedbackInput {
  name: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  locale: FeedbackLocale;
}

export type ValidationResult =
  { ok: true; value: FeedbackInput } | { ok: false; errors: FeedbackErrors };
