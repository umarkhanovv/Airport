'use server';

import {
  checkFormToken,
  consumeFeedbackAttempt,
  hashIp,
  isHoneypotTripped,
  FORM_TOKEN_FIELD,
  HONEYPOT_FIELD,
} from '@/lib/feedback/antispam';
import { notifyFeedback } from '@/lib/feedback/mail';
import { saveFeedback } from '@/lib/feedback/store';
import type { FeedbackErrors } from '@/lib/feedback/types';
import { validateFeedback } from '@/lib/feedback/validate';
import { clientIp } from '@/lib/admin/auth';

export type FeedbackFormError = 'tooFast' | 'expired' | 'rateLimited' | 'failed';

export interface FeedbackState {
  status: 'idle' | 'sent';
  errors?: FeedbackErrors;
  formError?: FeedbackFormError;
}

const INITIAL: FeedbackState = { status: 'idle' };

/**
 * Receives a feedback submission (spec §9).
 *
 * Order matters. The cheap spam checks run before validation so a bot never
 * reaches the database, and the database write happens before the optional
 * email so a mail failure cannot lose a real complaint.
 */
export async function submitFeedback(
  _state: FeedbackState,
  formData: FormData
): Promise<FeedbackState> {
  // A filled honeypot is answered with the same success screen a person gets.
  // Telling a bot it was detected only teaches whoever wrote it what to change.
  if (isHoneypotTripped(formData.get(HONEYPOT_FIELD))) {
    return { status: 'sent' };
  }

  const token = checkFormToken(formData.get(FORM_TOKEN_FIELD));
  if (token === 'too-fast') return { ...INITIAL, formError: 'tooFast' };
  if (token === 'expired') return { ...INITIAL, formError: 'expired' };
  if (token === 'missing') return { ...INITIAL, formError: 'failed' };

  const ip = await clientIp();
  if (!consumeFeedbackAttempt(ip).allowed) {
    return { ...INITIAL, formError: 'rateLimited' };
  }

  const validated = validateFeedback({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    subject: formData.get('subject'),
    message: formData.get('message'),
    locale: formData.get('locale'),
  });

  if (!validated.ok) {
    return { ...INITIAL, errors: validated.errors };
  }

  const submission = saveFeedback(validated.value, ip === 'unknown' ? null : hashIp(ip));

  // Not awaited, for the same reason the flight board never waits on weather
  // (plan §11.2): the submission is already stored, so the person who filed it
  // should not be held on the airport's mail relay. Delivery is a notification.
  void notifyFeedback(submission);

  return { status: 'sent' };
}
